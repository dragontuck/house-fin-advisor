-- Migration 004: Add statement ingestion tables for Slice 2
-- Implements document storage, processing lifecycle, and transaction import framework

SET search_path TO finhouse;

-- Document processing status enum
CREATE TYPE document_processing_status AS ENUM (
  'UPLOADED',
  'VALIDATING',
  'VALIDATION_FAILED',
  'IDENTIFYING',
  'PARSING',
  'PARSE_FAILED',
  'NORMALIZING',
  'RECONCILING',
  'REVIEW_REQUIRED',
  'READY_TO_POST',
  'POSTING',
  'COMPLETED',
  'PARTIALLY_COMPLETED',
  'FAILED'
);

-- Document source type enum
CREATE TYPE document_source_type AS ENUM (
  'CSV',
  'PDF',
  'IMAGE',
  'MANUAL'
);

-- Financial documents table - stores metadata and lifecycle for uploaded statements
CREATE TABLE financial_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  
  -- File metadata
  source_type document_source_type NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  file_checksum VARCHAR(64) NOT NULL, -- SHA-256 hex digest
  object_storage_key VARCHAR(512) NOT NULL, -- Path in MinIO, not user-provided filename
  
  -- Account and institution metadata
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  institution_name VARCHAR(255),
  statement_type VARCHAR(50), -- e.g., 'CHECKING', 'CREDIT_CARD'
  
  -- Statement period
  period_start DATE,
  period_end DATE,
  opening_balance_cents BIGINT,
  closing_balance_cents BIGINT,
  
  -- Processing state and versioning
  processing_status document_processing_status NOT NULL DEFAULT 'UPLOADED',
  processing_version INTEGER NOT NULL DEFAULT 1, -- Allows reprocessing with new parser versions
  
  -- Audit trail
  uploaded_by VARCHAR(255) NOT NULL, -- Keycloak user ID or identifier
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP WITH TIME ZONE,
  
  -- Error information (separate from diagnostic details)
  error_code VARCHAR(50),
  error_message_user TEXT, -- User-facing error, no stack traces
  
  -- Request tracking and idempotency
  correlation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  
  -- Lifecycle
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT check_file_size_positive CHECK (file_size_bytes > 0),
  CONSTRAINT check_checksum_length CHECK (LENGTH(file_checksum) = 64),
  CONSTRAINT check_valid_checksum CHECK (file_checksum ~ '^[a-f0-9]{64}$'),
  CONSTRAINT check_file_name_not_empty CHECK (LENGTH(TRIM(file_name)) > 0),
  CONSTRAINT check_mime_type_not_empty CHECK (LENGTH(TRIM(mime_type)) > 0),
  CONSTRAINT check_storage_key_not_empty CHECK (LENGTH(TRIM(object_storage_key)) > 0),
  CONSTRAINT check_period_valid CHECK (period_start IS NULL OR period_end IS NULL OR period_start <= period_end),
  CONSTRAINT check_balances_non_negative CHECK (opening_balance_cents IS NULL OR opening_balance_cents >= 0),
  CONSTRAINT check_closing_balance_non_negative CHECK (closing_balance_cents IS NULL OR closing_balance_cents >= 0),
  CONSTRAINT unique_household_checksum UNIQUE(household_id, file_checksum) -- Detect duplicate files by checksum within household
);

-- Indexes for efficient queries
CREATE INDEX idx_financial_documents_household ON financial_documents(household_id);
CREATE INDEX idx_financial_documents_status ON financial_documents(processing_status);
CREATE INDEX idx_financial_documents_uploaded_at ON financial_documents(uploaded_at DESC);
CREATE INDEX idx_financial_documents_correlation ON financial_documents(correlation_id);
CREATE INDEX idx_financial_documents_account ON financial_documents(account_id);

-- Add comments for clarity
COMMENT ON TABLE financial_documents IS 'Stores metadata and lifecycle state for uploaded financial statements. Original files immutably stored in MinIO.';
COMMENT ON COLUMN financial_documents.file_checksum IS 'SHA-256 digest of file contents, used for duplicate detection and integrity verification';
COMMENT ON COLUMN financial_documents.object_storage_key IS 'Deterministic path in MinIO object store, derived from household and document identity, NOT from user filename';
COMMENT ON COLUMN financial_documents.processing_status IS 'Tracks document through parse/reconcile/post lifecycle. Must transition explicitly via API.';
COMMENT ON COLUMN financial_documents.processing_version IS 'Parser/normalization version used. Allows reprocessing with improved parser versions.';
COMMENT ON COLUMN financial_documents.error_message_user IS 'User-facing error message. Should never contain stack traces, SQL errors, or internal details.';
COMMENT ON COLUMN financial_documents.correlation_id IS 'Request correlation ID for audit trail and retry idempotency';
COMMENT ON CONSTRAINT check_valid_checksum ON financial_documents IS 'SHA-256 checksums are exactly 64 hex characters';
COMMENT ON CONSTRAINT unique_household_checksum ON financial_documents IS 'Prevents duplicate file uploads within the same household';
