-- Migration 010: AI Advisor Conversation & Workflow Tables
-- Supports Slice 4 conversational financial planning
--
-- Design principles:
-- - Conversations are lightweight containers for messages (immutable core, soft-delete support)
-- - Messages are immutable append-only audit trail (role-based: USER, ASSISTANT, SYSTEM, TOOL)
-- - WorkflowState tracks stateful, multi-turn planning/scenario workflows (separate from chat history)
-- - ToolExecutions provide audit trail for all AI tool calls (who called what, when, with what result)
-- - No LLM integration yet — these tables hold conversation state, not tokens/embeddings

-- ── Advisor Conversations ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finhouse.advisor_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES finhouse.households(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES finhouse.household_members(id) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED', 'DELETED')),
    current_workflow VARCHAR(64),                     -- Current workflow type (enum string)
    current_workflow_id UUID,                         -- Link to active WorkflowState
    message_count INTEGER NOT NULL DEFAULT 0,         -- Denormalized for performance
    last_message_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_advisor_conversations_household ON finhouse.advisor_conversations(household_id);
CREATE INDEX idx_advisor_conversations_member ON finhouse.advisor_conversations(member_id);
CREATE INDEX idx_advisor_conversations_status ON finhouse.advisor_conversations(status);
CREATE INDEX idx_advisor_conversations_last_message ON finhouse.advisor_conversations(last_message_at DESC);

COMMENT ON TABLE finhouse.advisor_conversations IS
    'Lightweight containers for AI conversations. Core immutable; status and title mutable.';
COMMENT ON COLUMN finhouse.advisor_conversations.current_workflow IS
    'Type of workflow active in this conversation (e.g., BUDGET_CREATE, BUDGET_DIAGNOSE).';
COMMENT ON COLUMN finhouse.advisor_conversations.message_count IS
    'Denormalized count of messages for performance; maintained by application.';

-- ── Advisor Messages ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finhouse.advisor_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES finhouse.advisor_conversations(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL CHECK (role IN ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL')),
    content TEXT NOT NULL,
    tool_execution_id UUID,                          -- When role = TOOL, references ToolExecution
    ai_response JSONB,                               -- Structured AIResponse when role = ASSISTANT
    metadata JSONB,                                  -- workflow_id, related_items, user_feedback, etc.
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_advisor_messages_conversation ON finhouse.advisor_messages(conversation_id);
CREATE INDEX idx_advisor_messages_role ON finhouse.advisor_messages(role);
CREATE INDEX idx_advisor_messages_created_at ON finhouse.advisor_messages(created_at);

COMMENT ON TABLE finhouse.advisor_messages IS
    'Immutable append-only message history. Supports audit trail and conversation replay.';
COMMENT ON COLUMN finhouse.advisor_messages.role IS
    'USER=human, ASSISTANT=AI, SYSTEM=workflow transitions, TOOL=tool execution results.';
COMMENT ON COLUMN finhouse.advisor_messages.ai_response IS
    'Structured response per AIResponse contract: facts, calculations, assumptions, analysis, proposal.';
COMMENT ON COLUMN finhouse.advisor_messages.metadata IS
    'Workflow context, related items, user feedback (HELPFUL/UNHELPFUL/NEEDS_REVISION).';

-- ── Workflow State ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finhouse.advisor_workflow_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES finhouse.households(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES finhouse.advisor_conversations(id) ON DELETE SET NULL,
    workflow_type VARCHAR(64) NOT NULL,              -- AdvisorWorkflow enum value
    planning_period JSONB,                           -- { year: number, month: number }
    current_scenario JSONB,                          -- { type, description, affectedAmountCents, ... }
    known_activities JSONB,                          -- Array of KnownActivity objects
    proposed_changes JSONB,                          -- Array of { category, proposedBudgetCents, ... }
    assumptions JSONB,                               -- Array of assumptions with reasoning
    pending_questions JSONB,                         -- Array of questions awaiting user input
    status VARCHAR(32) NOT NULL CHECK (
        status IN ('ACTIVE', 'WAITING_FOR_USER', 'READY_FOR_REVIEW', 'APPROVED', 'CANCELLED', 'COMPLETED')
    ),
    linked_financial_snapshot_id UUID REFERENCES finhouse.financial_snapshots(id) ON DELETE SET NULL,
    linked_snapshot_version INTEGER,                 -- Version for reproducibility
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_advisor_workflow_states_household ON finhouse.advisor_workflow_states(household_id);
CREATE INDEX idx_advisor_workflow_states_conversation ON finhouse.advisor_workflow_states(conversation_id);
CREATE INDEX idx_advisor_workflow_states_status ON finhouse.advisor_workflow_states(status);
CREATE INDEX idx_advisor_workflow_states_type ON finhouse.advisor_workflow_states(workflow_type);

COMMENT ON TABLE finhouse.advisor_workflow_states IS
    'Stateful tracking of in-progress workflows. Separate from message history — multiple messages per workflow.';
COMMENT ON COLUMN finhouse.advisor_workflow_states.workflow_type IS
    'Type of workflow: FINANCIAL_HEALTH, BUDGET_CREATE, BUDGET_DIAGNOSE, BUDGET_REVISE, BUDGET_SCENARIO, etc.';
COMMENT ON COLUMN finhouse.advisor_workflow_states.status IS
    'Workflow status: ACTIVE (ongoing), WAITING_FOR_USER (user input needed), READY_FOR_REVIEW (plan ready),
     APPROVED (user approved), CANCELLED (user quit), COMPLETED (finished).';
COMMENT ON COLUMN finhouse.advisor_workflow_states.linked_financial_snapshot_id IS
    'The financial snapshot this workflow is based on. Enables reproducibility and scenario comparisons.';

-- ── Tool Executions ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finhouse.advisor_tool_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES finhouse.advisor_conversations(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES finhouse.advisor_messages(id) ON DELETE CASCADE,
    tool_name VARCHAR(128) NOT NULL,                 -- e.g., get_financial_snapshot, simulate_purchase
    input_params JSONB NOT NULL,                     -- Parameters passed to the tool
    result JSONB,                                    -- Tool result (null if error)
    error_message TEXT,                              -- Error description if execution failed
    duration_ms INTEGER NOT NULL,                    -- Execution time for performance analysis
    execution_version INTEGER NOT NULL DEFAULT 1,    -- For reproducibility
    executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    correlation_id UUID NOT NULL                     -- Trace ID for request correlation
);

CREATE INDEX idx_advisor_tool_executions_conversation ON finhouse.advisor_tool_executions(conversation_id);
CREATE INDEX idx_advisor_tool_executions_message ON finhouse.advisor_tool_executions(message_id);
CREATE INDEX idx_advisor_tool_executions_tool_name ON finhouse.advisor_tool_executions(tool_name);
CREATE INDEX idx_advisor_tool_executions_executed_at ON finhouse.advisor_tool_executions(executed_at);
CREATE INDEX idx_advisor_tool_executions_correlation ON finhouse.advisor_tool_executions(correlation_id);

COMMENT ON TABLE finhouse.advisor_tool_executions IS
    'Immutable audit log of all AI tool executions. Enables debugging, compliance, and impact analysis.';
COMMENT ON COLUMN finhouse.advisor_tool_executions.tool_name IS
    'Name of the financial tool: get_financial_snapshot, get_budget_status, simulate_purchase, etc.';
COMMENT ON COLUMN finhouse.advisor_tool_executions.input_params IS
    'Parameters the AI tool was called with (e.g., { householdId, asOf, scenario })';
COMMENT ON COLUMN finhouse.advisor_tool_executions.result IS
    'Result returned by the tool, or null if execution failed.';
COMMENT ON COLUMN finhouse.advisor_tool_executions.correlation_id IS
    'Request correlation ID for tracing a conversation/decision back to tool calls.';

-- ── Unique Constraints & Foreign Keys ────────────────────────────────────────────────

-- Ensure current_workflow_id, if set, exists and belongs to the same household
ALTER TABLE finhouse.advisor_conversations
    ADD CONSTRAINT fk_advisor_conversations_workflow
        FOREIGN KEY (current_workflow_id)
        REFERENCES finhouse.advisor_workflow_states(id)
        ON DELETE SET NULL;

-- Ensure tool_execution_id, if set, belongs to the same conversation
ALTER TABLE finhouse.advisor_messages
    ADD CONSTRAINT fk_advisor_messages_tool_execution
        FOREIGN KEY (tool_execution_id)
        REFERENCES finhouse.advisor_tool_executions(id)
        ON DELETE SET NULL;
