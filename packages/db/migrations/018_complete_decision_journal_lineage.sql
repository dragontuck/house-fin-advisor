-- Preserve append-only decision history and require replay version references for new entries.

ALTER TABLE finhouse.decision_journal_decisions
    DROP CONSTRAINT IF EXISTS decision_journal_decisions_recommendation_id_key;

CREATE INDEX IF NOT EXISTS idx_decision_journal_decisions_history
    ON finhouse.decision_journal_decisions (recommendation_id, household_id, decided_at);

ALTER TABLE finhouse.decision_journal_entries
    ADD CONSTRAINT decision_journal_entries_snapshot_version_required
        CHECK (financial_snapshot_id IS NOT NULL AND financial_snapshot_version IS NOT NULL) NOT VALID,
    ADD CONSTRAINT decision_journal_entries_policy_version_required
        CHECK (household_policy_version IS NOT NULL) NOT VALID;