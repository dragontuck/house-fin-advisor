-- Migration 013: Optimistic concurrency for advisor_workflow_states
-- The multi-turn planning flow (extract activities/constraints from each message, merge into
-- WorkflowState, write back) is read-modify-write. Without a version guard, two concurrent
-- turns (rapid follow-up messages, a client retry) can race and the second write silently
-- discards the first's knownActivities/assumptions/proposedChanges. Matches the same pattern
-- already used for budgets and savings goals.

ALTER TABLE finhouse.advisor_workflow_states
    ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN finhouse.advisor_workflow_states.version IS
    'Optimistic concurrency token. Every update must supply the version it read and increments it by 1; a mismatch means the workflow changed since it was read.';
