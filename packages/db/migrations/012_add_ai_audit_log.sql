-- Migration 012: AI Audit Log
-- Records metadata about every AI advisor interaction for administrator auditability.
--
-- Design principles:
-- - Immutable, append-only (matches advisor_tool_executions / statement_posting_audit pattern).
-- - Records METADATA about the interaction (who, what workflow, which tools/versions, provider,
--   validation/approval outcome, timing) - never raw financial payloads. The tool inputs/results
--   themselves already live in finhouse.advisor_tool_executions (household-scoped); this table
--   is the cross-household admin-facing audit surface and must stay safe to review broadly.
-- - Answers: "What did the AI do when it created this budget proposal?" by joining on
--   conversation_id / correlation_id with advisor_conversations, advisor_tool_executions, and
--   budget_proposals - without duplicating any of their data here.

CREATE TABLE IF NOT EXISTS finhouse.ai_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    correlation_id UUID NOT NULL,
    conversation_id UUID REFERENCES finhouse.advisor_conversations(id) ON DELETE SET NULL,
    household_id UUID NOT NULL REFERENCES finhouse.households(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES finhouse.household_members(id) ON DELETE RESTRICT,
    workflow VARCHAR(64) NOT NULL,
    intent VARCHAR(64) NOT NULL,
    tools_requested JSONB NOT NULL DEFAULT '[]',
    tools_executed JSONB NOT NULL DEFAULT '[]',
    tool_versions JSONB NOT NULL DEFAULT '{}',
    financial_snapshot_version INTEGER,
    provider VARCHAR(64),
    model VARCHAR(128),
    validation_status VARCHAR(32) NOT NULL CHECK (
        validation_status IN ('PASSED', 'FAILED_SAFE_FALLBACK', 'NOT_APPLICABLE')
    ),
    approval_status VARCHAR(32) NOT NULL DEFAULT 'NOT_APPLICABLE' CHECK (
        approval_status IN ('PENDING', 'NOT_APPLICABLE')
    ),
    success BOOLEAN NOT NULL,
    failure_category VARCHAR(64),
    total_duration_ms INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_audit_log_correlation ON finhouse.ai_audit_log(correlation_id);
CREATE INDEX idx_ai_audit_log_conversation ON finhouse.ai_audit_log(conversation_id);
CREATE INDEX idx_ai_audit_log_household ON finhouse.ai_audit_log(household_id);
CREATE INDEX idx_ai_audit_log_workflow ON finhouse.ai_audit_log(workflow);
CREATE INDEX idx_ai_audit_log_created_at ON finhouse.ai_audit_log(created_at DESC);

COMMENT ON TABLE finhouse.ai_audit_log IS
    'Immutable, append-only metadata record of every AI advisor request. No financial payloads -
     administrators can see what the AI did (workflow, tools, versions, provider, validation and
     approval outcome) without exposing account balances, transactions, or other private data.';
COMMENT ON COLUMN finhouse.ai_audit_log.tools_requested IS
    'All tool names the plan called for, in order.';
COMMENT ON COLUMN finhouse.ai_audit_log.tools_executed IS
    'Tool names that actually completed successfully (subset of tools_requested).';
COMMENT ON COLUMN finhouse.ai_audit_log.tool_versions IS
    'Map of tool name -> implementation version at time of execution, for reproducibility.';
COMMENT ON COLUMN finhouse.ai_audit_log.financial_snapshot_version IS
    'Version of the financial snapshot the request reasoned over, if determinable.';
COMMENT ON COLUMN finhouse.ai_audit_log.validation_status IS
    'PASSED = LLM response was grounded; FAILED_SAFE_FALLBACK = ungrounded response was replaced;
     NOT_APPLICABLE = request never reached response validation (e.g. tool/LLM failure).';
COMMENT ON COLUMN finhouse.ai_audit_log.approval_status IS
    'PENDING = this request''s workflow can produce a budget proposal awaiting approval;
     NOT_APPLICABLE = no proposal is possible for this workflow type. The proposal''s live status
     lives in finhouse.budget_proposals (joined via conversation_id) - never duplicated here.';
