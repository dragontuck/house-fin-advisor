SET search_path TO finhouse;

DROP TABLE IF EXISTS financial_documents CASCADE;
DROP TYPE IF EXISTS document_processing_status CASCADE;
DROP TYPE IF EXISTS document_source_type CASCADE;

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

CREATE TYPE document_source_type AS ENUM (
  'CSV',
  'PDF',
  'IMAGE',
  'MANUAL'
);

CREATE TABLE financial_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  
  source_type document_source_type NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  file_checksum VARCHAR(64) NOT NULL,
  object_storage_key VARCHAR(512) NOT NULL,
  
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  institution_name VARCHAR(255),
  statement_type VARCHAR(50),
  
  period_start DATE,
  period_end DATE,
  opening_balance_cents BIGINT,
  closing_balance_cents BIGINT,
  
  processing_status document_processing_status NOT NULL DEFAULT 'UPLOADED',
  processing_version INTEGER NOT NULL DEFAULT 1,
  
  uploaded_by VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP WITH TIME ZONE,
  
  error_code VARCHAR(50),
  error_message_user TEXT,
  
  correlation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT check_file_size_positive CHECK (file_size_bytes > 0),
  CONSTRAINT check_checksum_length CHECK (LENGTH(file_checksum) = 64),
  CONSTRAINT check_valid_checksum CHECK (file_checksum ~ '^[a-f0-9]{64}$'),
  CONSTRAINT check_file_name_not_empty CHECK (LENGTH(TRIM(file_name)) > 0),
  CONSTRAINT check_mime_type_not_empty CHECK (LENGTH(TRIM(mime_type)) > 0),
  CONSTRAINT check_storage_key_not_empty CHECK (LENGTH(TRIM(object_storage_key)) > 0),
  CONSTRAINT check_period_valid CHECK (period_start IS NULL OR period_end IS NULL OR period_start <= period_end),
  CONSTRAINT check_balances_non_negative CHECK (opening_balance_cents IS NULL OR opening_balance_cents >= 0),
  CONSTRAINT check_closing_balance_non_negative CHECK (closing_balance_cents IS NULL OR closing_balance_cents >= 0),
  CONSTRAINT unique_household_checksum UNIQUE(household_id, file_checksum)
);

CREATE INDEX idx_financial_documents_household ON financial_documents(household_id);
CREATE INDEX idx_financial_documents_status ON financial_documents(processing_status);
CREATE INDEX idx_financial_documents_uploaded_at ON financial_documents(uploaded_at DESC);
CREATE INDEX idx_financial_documents_correlation ON financial_documents(correlation_id);
CREATE INDEX idx_financial_documents_account ON financial_documents(account_id);
