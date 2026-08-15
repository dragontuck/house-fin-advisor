-- Migration 005: Add review queue for statement-processing exceptions
-- Implements human review workflow for ambiguous/conflicting transactions

SET search_path TO finhouse;

-- Review type enum
CREATE TYPE review_type AS ENUM (
  'AMBIGUOUS_TRANSACTION',
  'POSSIBLE_DUPLICATE',
  'RECONCILIATION_CONFLICT',
  'UNKNOWN_ACCOUNT',
  'UNKNOWN_STATEMENT_PERIOD',
  'PARSE_WARNING',
  'BALANCE_MISMATCH'
);

-- Review severity enum
CREATE TYPE review_severity AS ENUM (
  'INFO',
  'WARNING',
  'ERROR'
);

-- Review status enum
CREATE TYPE review_status AS ENUM (
  'PENDING',
  'IN_PROGRESS',
  'RESOLVED',
  'ARCHIVED'
);

-- Review items table
-- Stores individual items that require human attention
CREATE TABLE review_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  statement_id UUID REFERENCES financial_documents(id) ON DELETE SET NULL,
  
  -- Classification
  type review_type NOT NULL,
  severity review_severity NOT NULL,
  status review_status NOT NULL DEFAULT 'PENDING',
  
  -- Presentation (user-friendly, no technical details)
  title VARCHAR(255) NOT NULL, -- e.g., "Amazon — $147.83"
  user_message TEXT NOT NULL, -- Explanation of what was found and why we're uncertain
  recommended_action VARCHAR(255), -- Suggested resolution
  
  -- Candidate values (presented as choices to user)
  candidate_values JSONB NOT NULL, -- Array of {label, value, metadata?}
  
  -- Supporting evidence (for decision-making context)
  supporting_evidence JSONB NOT NULL, -- Array of {type, description, data}
  
  -- Affected transactions (for linking)
  transaction_ids UUID[] NOT NULL DEFAULT '{}', -- Array of related transaction IDs
  
  -- Audit trail
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by VARCHAR(255), -- Keycloak user ID
  
  -- Constraints
  CONSTRAINT check_title_not_empty CHECK (LENGTH(TRIM(title)) > 0),
  CONSTRAINT check_message_not_empty CHECK (LENGTH(TRIM(user_message)) > 0),
  CONSTRAINT check_valid_json_candidates CHECK (jsonb_typeof(candidate_values) = 'array'),
  CONSTRAINT check_valid_json_evidence CHECK (jsonb_typeof(supporting_evidence) = 'array'),
  CONSTRAINT check_resolved_requires_user CHECK (resolved_at IS NULL OR resolved_by IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_review_items_household ON review_items(household_id);
CREATE INDEX idx_review_items_status ON review_items(status);
CREATE INDEX idx_review_items_type ON review_items(type);
CREATE INDEX idx_review_items_severity ON review_items(severity);
CREATE INDEX idx_review_items_created ON review_items(created_at DESC);
CREATE INDEX idx_review_items_statement ON review_items(statement_id);

-- Review resolutions table
-- Audit trail of user decisions (immutable, never update)
CREATE TABLE review_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_item_id UUID NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  
  -- User's decision
  chosen_action VARCHAR(255) NOT NULL, -- e.g., "USE_EXISTING", "KEEP_BOTH", "CATEGORIZE_AS_SHOPPING"
  reasoning TEXT NOT NULL, -- User's explanation
  
  -- Affected entities
  affected_transaction_ids UUID[] NOT NULL DEFAULT '{}', -- Which transactions were affected
  resulting_metadata JSONB, -- Any metadata created by this resolution
  
  -- Audit
  resolved_by VARCHAR(255) NOT NULL, -- Keycloak user ID
  resolved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT check_action_not_empty CHECK (LENGTH(TRIM(chosen_action)) > 0),
  CONSTRAINT check_reasoning_not_empty CHECK (LENGTH(TRIM(reasoning)) > 0)
);

-- Indexes
CREATE INDEX idx_review_resolutions_household ON review_resolutions(household_id);
CREATE INDEX idx_review_resolutions_review_item ON review_resolutions(review_item_id);
CREATE INDEX idx_review_resolutions_resolved_at ON review_resolutions(resolved_at DESC);

-- Comments
COMMENT ON TABLE review_items IS 'Human review queue for transactions that require attention (duplicates, conflicts, ambiguous categorization, etc.)';
COMMENT ON TABLE review_resolutions IS 'Immutable audit trail of user decisions. Foreign key to review_items allows history tracking.';
COMMENT ON COLUMN review_items.candidate_values IS 'JSON array: [{label: string, value: string, metadata?: object}]. Presented as choices to user (e.g., Shopping, Entertainment).';
COMMENT ON COLUMN review_items.supporting_evidence IS 'JSON array: [{type: string, description: string, data: object}]. Context for decision-making (e.g., transaction details, statement info, parsing notes).';
COMMENT ON COLUMN review_items.transaction_ids IS 'Array of transaction UUIDs involved in this review (for linking and bulk resolution).';
COMMENT ON COLUMN review_items.user_message IS 'User-friendly explanation. Never include parser details, database IDs, or technical jargon.';
COMMENT ON COLUMN review_resolutions.chosen_action IS 'The specific action taken by user (e.g., "USE_EXISTING", "KEEP_BOTH", "CATEGORIZE_AS_SHOPPING"). Domain-specific per review type.';
COMMENT ON COLUMN review_resolutions.resulting_metadata IS 'Any system state created by resolution (e.g., category assignment, category_id, split amounts, etc.).';
