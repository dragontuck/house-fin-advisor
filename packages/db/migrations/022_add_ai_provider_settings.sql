-- Migration 022: AI Provider Settings
-- Stores household-level AI provider and model configuration.
-- Allows admins to override default LLM provider/model per household.
-- Records who made the change, when, and from where (audit trail).

CREATE TABLE IF NOT EXISTS finhouse.ai_provider_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL UNIQUE REFERENCES finhouse.households(id) ON DELETE CASCADE,
    
    -- Provider and model configuration
    provider VARCHAR(64) NOT NULL CHECK (provider IN ('anthropic', 'openai', 'gemini', 'ollama')),
    model VARCHAR(255) NOT NULL,
    
    -- Optional provider-specific settings (e.g., temperature, max_tokens)
    provider_config JSONB NOT NULL DEFAULT '{}',
    
    -- Audit fields
    configured_by_member_id UUID NOT NULL REFERENCES finhouse.household_members(id) ON DELETE RESTRICT,
    configured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_by_member_id UUID REFERENCES finhouse.household_members(id) ON DELETE RESTRICT,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Soft delete support
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT check_not_soft_deleted CHECK (deleted_at IS NULL)
);

-- Indexes for queries
CREATE INDEX idx_ai_provider_settings_household ON finhouse.ai_provider_settings(household_id) 
    WHERE deleted_at IS NULL;
CREATE INDEX idx_ai_provider_settings_provider ON finhouse.ai_provider_settings(provider)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_ai_provider_settings_updated_at ON finhouse.ai_provider_settings(updated_at DESC)
    WHERE deleted_at IS NULL;

-- Audit index
CREATE INDEX idx_ai_provider_settings_configured_by ON finhouse.ai_provider_settings(configured_by_member_id);

-- Comments
COMMENT ON TABLE finhouse.ai_provider_settings IS
    'Household-level AI provider configuration. Each household can select their preferred LLM provider
     and model. Only household admins can modify these settings. Includes full audit trail of who
     changed what and when.';

COMMENT ON COLUMN finhouse.ai_provider_settings.provider IS
    'LLM provider: anthropic, openai, gemini, ollama. Must match a supported provider in llm-provider-factory.ts';

COMMENT ON COLUMN finhouse.ai_provider_settings.model IS
    'Model identifier as understood by the provider (e.g., claude-3-sonnet-20240229, gpt-4-turbo)';

COMMENT ON COLUMN finhouse.ai_provider_settings.provider_config IS
    'Optional JSON configuration passed to provider (e.g., {"temperature": 0.7, "max_tokens": 2000})';

COMMENT ON COLUMN finhouse.ai_provider_settings.configured_by_member_id IS
    'The household member who originally configured these settings (for audit purposes)';

COMMENT ON COLUMN finhouse.ai_provider_settings.updated_by_member_id IS
    'The household member who last updated these settings (NULL if never updated)';
