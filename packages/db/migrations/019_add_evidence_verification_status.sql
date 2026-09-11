-- Evidence must be explicitly verified before it can support a recommendation.

ALTER TABLE finhouse.evidence
    ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED';

ALTER TABLE finhouse.evidence
    ADD CONSTRAINT evidence_valid_verification_status
        CHECK (verification_status IN ('VERIFIED', 'UNVERIFIED', 'CONFLICTED'));

CREATE INDEX IF NOT EXISTS idx_evidence_verified_household
    ON finhouse.evidence (household_id, source_tier, retrieval_date DESC)
    WHERE verification_status = 'VERIFIED';