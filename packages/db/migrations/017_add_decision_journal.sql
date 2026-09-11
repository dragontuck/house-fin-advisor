-- Migration 017: Decision Journal
-- Stores the exact private context used to generate a recommendation.
-- Generation records and decisions are append-only; historical context is never rebuilt from live data.

CREATE TABLE IF NOT EXISTS finhouse.decision_journal_entries (
    recommendation_id UUID PRIMARY KEY,
    correlation_id UUID NOT NULL UNIQUE,
    household_id UUID NOT NULL REFERENCES finhouse.households(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES finhouse.household_members(id) ON DELETE RESTRICT,
    conversation_id UUID REFERENCES finhouse.advisor_conversations(id) ON DELETE SET NULL,
    workflow_type VARCHAR(64) NOT NULL,
    question TEXT NOT NULL,
    current_financial_state JSONB NOT NULL,
    financial_snapshot_id UUID,
    financial_snapshot_version INTEGER,
    household_policy_version INTEGER,
    scenarios JSONB NOT NULL,
    evidence JSONB NOT NULL,
    recommendation JSONB NOT NULL,
    alternatives JSONB NOT NULL,
    validation JSONB NOT NULL,
    confidence JSONB NOT NULL,
    persona_used JSONB NOT NULL,
    approval_state VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (approval_state = 'PENDING'),
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE IF NOT EXISTS finhouse.decision_journal_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID NOT NULL UNIQUE REFERENCES finhouse.decision_journal_entries(recommendation_id) ON DELETE RESTRICT,
    household_id UUID NOT NULL REFERENCES finhouse.households(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES finhouse.household_members(id) ON DELETE RESTRICT,
    decision VARCHAR(16) NOT NULL CHECK (decision IN ('APPROVED', 'DECLINED')),
    user_choice TEXT,
    notes TEXT,
    decided_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_decision_journal_household_generated
    ON finhouse.decision_journal_entries(household_id, generated_at DESC);
CREATE INDEX idx_decision_journal_conversation
    ON finhouse.decision_journal_entries(conversation_id, generated_at ASC);
CREATE INDEX idx_decision_journal_search
    ON finhouse.decision_journal_entries USING GIN (
        to_tsvector('english', question || ' ' || recommendation::text)
    );

CREATE OR REPLACE FUNCTION finhouse.prevent_decision_journal_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Decision journal records are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS decision_journal_entries_immutable ON finhouse.decision_journal_entries;
CREATE TRIGGER decision_journal_entries_immutable
    BEFORE UPDATE OR DELETE ON finhouse.decision_journal_entries
    FOR EACH ROW EXECUTE FUNCTION finhouse.prevent_decision_journal_mutation();

DROP TRIGGER IF EXISTS decision_journal_decisions_immutable ON finhouse.decision_journal_decisions;
CREATE TRIGGER decision_journal_decisions_immutable
    BEFORE UPDATE OR DELETE ON finhouse.decision_journal_decisions
    FOR EACH ROW EXECUTE FUNCTION finhouse.prevent_decision_journal_mutation();

COMMENT ON TABLE finhouse.decision_journal_entries IS
    'Immutable household-private recommendation context captured at generation time. Never reconstructed from current data.';
COMMENT ON TABLE finhouse.decision_journal_decisions IS
    'Append-only user decisions associated with immutable recommendation journal entries.';