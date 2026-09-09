-- Slice 5: Add Evidence Table
-- Date: 2026-09-09
-- Purpose: Store evidence used in recommendations (separate from recommendations to enable reuse)

CREATE TABLE evidence (
    id UUID PRIMARY KEY,
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
    
    -- Evidence details
    claim TEXT NOT NULL, -- What the evidence claims
    source_name VARCHAR(255) NOT NULL, -- e.g., "IRS", "Chase", "Morningstar"
    source_tier VARCHAR(30) NOT NULL, -- "TIER_1_GOVERNMENT" | "TIER_2_PROVIDER" | "TIER_3_RESEARCH" | "TIER_4_MEDIA"
    source_authority VARCHAR(30) NOT NULL, -- "REGULATORY" | "OFFICIAL" | "ACADEMIC" | etc.
    source_type VARCHAR(50) NOT NULL, -- "GOVERNMENT" | "PROVIDER" | "RESEARCH" | "MEDIA" | "CUSTOM"
    source_url VARCHAR(2048),
    
    -- Retrieval details
    retrieval_date TIMESTAMP NOT NULL,
    freshness VARCHAR(20) NOT NULL, -- "CURRENT" | "RECENT" | "STALE" | "EXPIRED"
    expires_at TIMESTAMP,
    confidence VARCHAR(20) NOT NULL, -- "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT_INFORMATION"
    
    -- Raw evidence (for audit)
    source_text TEXT,
    source_quote TEXT,
    
    -- Which recommendations use this evidence (denormalized for quick lookup)
    used_in JSONB DEFAULT '[]', -- EntityId[] (recommendation IDs)
    
    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_source_tier CHECK (
        source_tier IN (
            'TIER_1_GOVERNMENT',
            'TIER_2_PROVIDER',
            'TIER_3_RESEARCH',
            'TIER_4_MEDIA'
        )
    ),
    CONSTRAINT valid_freshness CHECK (
        freshness IN ('CURRENT', 'RECENT', 'STALE', 'EXPIRED')
    ),
    CONSTRAINT valid_confidence CHECK (
        confidence IN ('HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT_INFORMATION')
    )
);

-- Indexes for common queries
CREATE INDEX idx_evidence_household_id ON evidence(household_id);
CREATE INDEX idx_evidence_source_tier ON evidence(source_tier);
CREATE INDEX idx_evidence_source_name ON evidence(source_name);
CREATE INDEX idx_evidence_freshness ON evidence(freshness);
CREATE INDEX idx_evidence_created_at ON evidence(created_at);
CREATE INDEX idx_evidence_retrieval_date ON evidence(retrieval_date);

-- Index for finding stale evidence
CREATE INDEX idx_evidence_stale ON evidence(expires_at) 
    WHERE freshness IN ('STALE', 'EXPIRED');
