-- Migration 005: Add soft-delete pattern and processing history
-- Implements audit trail and prevents silent overwrites (AGENTS.md requirement)

SET search_path TO finhouse;

-- Processing history to track all status changes
CREATE TABLE document_processing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES financial_documents(id) ON DELETE CASCADE,
  previous_status document_processing_status,
  new_status document_processing_status NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  changed_by VARCHAR(255), -- Keycloak user ID
  reason TEXT, -- Why status changed
  correlation_id UUID -- Link to request
);

-- Add soft-delete to financial_documents
ALTER TABLE financial_documents ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;

-- Index for efficiently querying active documents
CREATE INDEX idx_financial_documents_active ON financial_documents(household_id) 
  WHERE deleted_at IS NULL;

-- Index for processing history queries
CREATE INDEX idx_document_processing_history_document ON document_processing_history(document_id);
CREATE INDEX idx_document_processing_history_status ON document_processing_history(new_status);
CREATE INDEX idx_document_processing_history_changed_at ON document_processing_history(changed_at DESC);

COMMENT ON TABLE document_processing_history IS 'Immutable audit trail of all document status changes, enables reprocessing history and compliance tracking';
COMMENT ON COLUMN financial_documents.deleted_at IS 'Soft delete timestamp. NULL = active, non-null = logically deleted. Never actually delete for audit trail.';
