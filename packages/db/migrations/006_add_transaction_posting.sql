-- Migration 006: Add transaction posting infrastructure
-- Implements posting of normalized/reconciled transactions to canonical ledger
-- Supports idempotent, transactional posting with audit trail and versioning

SET search_path TO finhouse;

-- Auto-post confidence threshold configuration
-- Allows per-household configuration of minimum confidence for automatic posting
CREATE TABLE auto_post_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  
  -- Confidence threshold: transactions with confidence >= this value will auto-post
  -- Range: 0.0 to 1.0 (e.g., 0.95 = 95%)
  confidence_threshold DECIMAL(3, 2) NOT NULL DEFAULT 0.85,
  
  -- When true, transactions below threshold will create ReviewItems instead of blocking entire statement
  -- When false, any below-threshold transaction causes entire statement to require review
  allow_partial_posting BOOLEAN NOT NULL DEFAULT true,
  
  -- Audit trail
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(255) NOT NULL, -- Keycloak user ID
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT check_valid_threshold CHECK (confidence_threshold >= 0.0 AND confidence_threshold <= 1.0)
);

-- Canonical posted transactions ledger
-- These are immutable records of transactions that have been posted to the household's accounts
CREATE TABLE posted_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  
  -- Core transaction data
  posted_date DATE NOT NULL,
  transaction_date DATE NOT NULL, -- When the transaction actually occurred (bank statement date)
  amount_cents BIGINT NOT NULL, -- Positive for debits/expenses, negative for credits/income
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
  merchant VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  
  -- Confidence score for auto-posting decision
  confidence_score DECIMAL(3, 2) NOT NULL,
  
  -- Source provenance (audit trail - which document this came from)
  source_document_id UUID NOT NULL REFERENCES financial_documents(id) ON DELETE RESTRICT,
  source_row_number INTEGER, -- Row in CSV, if from parsed statement
  source_page_number INTEGER, -- Page in PDF, if from image/PDF
  
  -- Reconciliation state
  reconciliation_state VARCHAR(50) NOT NULL DEFAULT 'NEW'
    CHECK (reconciliation_state IN ('NEW', 'MATCHED', 'POSSIBLE_DUPLICATE', 'CONFLICT')),
  matched_transaction_id UUID, -- Reference to pre-existing transaction if MATCHED
  
  -- Optional reference within statement (e.g., check number)
  statement_reference VARCHAR(100),
  
  -- Metadata preserved from import
  source_transaction_id VARCHAR(255), -- Provider/bank transaction ID
  original_amount_string VARCHAR(50), -- Original representation for validation
  original_date_string VARCHAR(50), -- Original date representation
  
  -- Immutable record fields
  posted_by VARCHAR(255) NOT NULL, -- Keycloak user ID of who triggered posting
  posted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  posting_correlation_id UUID NOT NULL, -- Links related transactions posted together
  
  -- Versioning for snapshot recalculation
  calculation_version INTEGER NOT NULL DEFAULT 1,
  
  -- Metadata (JSONB for flexibility)
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT check_non_empty_merchant CHECK (LENGTH(TRIM(merchant)) > 0),
  CONSTRAINT check_non_empty_description CHECK (LENGTH(TRIM(description)) > 0),
  CONSTRAINT check_valid_confidence CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
  CONSTRAINT check_posted_date_valid CHECK (posted_date >= '2000-01-01' AND posted_date <= CURRENT_DATE + INTERVAL '1 day'),
  CONSTRAINT check_transaction_date_valid CHECK (transaction_date >= '2000-01-01' AND transaction_date <= CURRENT_DATE),
  CONSTRAINT check_merchant_length CHECK (LENGTH(merchant) <= 500),
  
  -- Immutability: posted_at and posted_by must be set at creation
  CONSTRAINT check_posted_by_not_empty CHECK (LENGTH(TRIM(posted_by)) > 0)
);

-- Indexes for efficient queries
CREATE INDEX idx_posted_transactions_household_account ON posted_transactions(household_id, account_id);
CREATE INDEX idx_posted_transactions_account ON posted_transactions(account_id);
CREATE INDEX idx_posted_transactions_posted_date ON posted_transactions(posted_date DESC);
CREATE INDEX idx_posted_transactions_transaction_date ON posted_transactions(transaction_date DESC);
CREATE INDEX idx_posted_transactions_source_document ON posted_transactions(source_document_id);
CREATE INDEX idx_posted_transactions_correlation ON posted_transactions(posting_correlation_id);
CREATE INDEX idx_posted_transactions_matched_transaction ON posted_transactions(matched_transaction_id);
CREATE INDEX idx_posted_transactions_household_date ON posted_transactions(household_id, posted_date DESC);

-- Posting audit trail (immutable log of posting operations)
-- Records each batch posting operation, enabling audit and replay
CREATE TABLE statement_posting_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  
  -- Reference to source document
  source_document_id UUID NOT NULL REFERENCES financial_documents(id) ON DELETE RESTRICT,
  
  -- Posting metadata
  posting_correlation_id UUID NOT NULL, -- Links all transactions from this posting batch
  posting_status VARCHAR(20) NOT NULL CHECK (posting_status IN ('STARTED', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED')),
  
  -- High-confidence transactions
  high_confidence_count INTEGER NOT NULL DEFAULT 0,
  high_confidence_posted INTEGER NOT NULL DEFAULT 0,
  
  -- Low-confidence (requiring review)
  low_confidence_count INTEGER NOT NULL DEFAULT 0,
  low_confidence_skipped INTEGER NOT NULL DEFAULT 0, -- Skipped because below threshold
  
  -- Total summary
  total_candidates INTEGER NOT NULL,
  total_posted INTEGER NOT NULL,
  
  -- Error tracking
  error_code VARCHAR(50),
  error_message_user TEXT, -- User-facing error message
  error_details JSONB, -- Technical details
  
  -- Request info
  initiated_by VARCHAR(255) NOT NULL, -- Keycloak user ID
  processing_duration_ms INTEGER, -- How long the posting took
  
  -- Idempotency
  idempotency_key VARCHAR(255) NOT NULL UNIQUE,
  
  -- Timestamps
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraints
  CONSTRAINT check_counts_non_negative CHECK (
    high_confidence_count >= 0 AND
    high_confidence_posted >= 0 AND
    low_confidence_count >= 0 AND
    low_confidence_skipped >= 0 AND
    total_candidates >= 0 AND
    total_posted >= 0
  ),
  CONSTRAINT check_posted_le_candidates CHECK (total_posted <= total_candidates),
  CONSTRAINT check_high_confidence_consistent CHECK (high_confidence_posted <= high_confidence_count),
  CONSTRAINT check_low_confidence_consistent CHECK (low_confidence_skipped <= low_confidence_count)
);

-- Indexes for audit queries
CREATE INDEX idx_posting_audit_household ON statement_posting_audit(household_id);
CREATE INDEX idx_posting_audit_document ON statement_posting_audit(source_document_id);
CREATE INDEX idx_posting_audit_correlation ON statement_posting_audit(posting_correlation_id);
CREATE INDEX idx_posting_audit_status ON statement_posting_audit(posting_status);
CREATE INDEX idx_posting_audit_initiated_by ON statement_posting_audit(initiated_by);
CREATE INDEX idx_posting_audit_started_at ON statement_posting_audit(started_at DESC);
CREATE INDEX idx_posting_audit_idempotency ON statement_posting_audit(idempotency_key);

-- Update financial_documents to track posting state
ALTER TABLE financial_documents
ADD COLUMN posted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN posted_by VARCHAR(255),
ADD COLUMN posting_correlation_id UUID,
ADD CONSTRAINT fk_posting_correlation FOREIGN KEY (posting_correlation_id) REFERENCES statement_posting_audit(posting_correlation_id);

CREATE INDEX idx_financial_documents_posted_at ON financial_documents(posted_at DESC);
CREATE INDEX idx_financial_documents_posting_correlation ON financial_documents(posting_correlation_id);

-- Comments for documentation
COMMENT ON TABLE auto_post_config IS 'Household-level configuration for automatic transaction posting thresholds';
COMMENT ON COLUMN auto_post_config.confidence_threshold IS 'Minimum confidence (0.0-1.0) required for automatic posting without review';
COMMENT ON COLUMN auto_post_config.allow_partial_posting IS 'If true, high-confidence transactions post even if some require review. If false, blocks all on any low-confidence transaction.';

COMMENT ON TABLE posted_transactions IS 'Canonical ledger of posted transactions. Immutable records used for financial calculations and account reconciliation.';
COMMENT ON COLUMN posted_transactions.confidence_score IS 'Confidence score from reconciliation process. Used to determine if auto-posting is allowed.';
COMMENT ON COLUMN posted_transactions.source_document_id IS 'Reference to source financial document for audit trail and document reprocessing.';
COMMENT ON COLUMN posted_transactions.reconciliation_state IS 'How this transaction was matched/reconciled: NEW=no match, MATCHED=single match, POSSIBLE_DUPLICATE=multiple matches, CONFLICT=conflicting data';
COMMENT ON COLUMN posted_transactions.posting_correlation_id IS 'Batch ID linking all transactions posted in a single operation. Enables replay and audit.';
COMMENT ON COLUMN posted_transactions.calculation_version IS 'Version of calculation logic used during posting. Enables snapshot recalculation if algorithm changes.';

COMMENT ON TABLE statement_posting_audit IS 'Immutable audit log of all posting operations. Enables compliance, debugging, and retry logic.';
COMMENT ON COLUMN statement_posting_audit.posting_status IS 'STARTED=began, COMPLETED=all posted, PARTIALLY_COMPLETED=some posted (review needed for others), FAILED=error occurred';
COMMENT ON COLUMN statement_posting_audit.idempotency_key IS 'Prevents duplicate posting if request retried. Same key means same operation.';
COMMENT ON COLUMN statement_posting_audit.processing_duration_ms IS 'Performance metric: how long the transaction posting took.';

COMMENT ON CONSTRAINT check_posted_le_candidates ON statement_posting_audit IS 'Total posted must not exceed total candidates';
COMMENT ON CONSTRAINT check_high_confidence_consistent ON statement_posting_audit IS 'High-confidence posted count must not exceed high-confidence count';
COMMENT ON CONSTRAINT check_low_confidence_consistent ON statement_posting_audit IS 'Low-confidence skipped must not exceed low-confidence count';
