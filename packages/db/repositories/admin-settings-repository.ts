/**
 * Admin Settings Repository
 * Manages database operations for AI provider settings
 */

import { Pool, QueryResult } from "pg";
import {
    AIProviderSettings,
    UpdateAIProviderSettingsRequest,
    LLMProviderName,
} from "@house-fin/contracts";
import { EntityId } from "@house-fin/contracts";

export interface AIProviderSettingsRepository {
    /**
     * Get AI provider settings for a household
     * Returns null if not configured (uses environment defaults)
     */
    getSettingsByHouseholdId(householdId: EntityId): Promise<AIProviderSettings | null>;

    /**
     * Create or update AI provider settings for a household
     */
    upsertSettings(
        householdId: EntityId,
        memberId: EntityId,
        settings: UpdateAIProviderSettingsRequest
    ): Promise<AIProviderSettings>;

    /**
     * Get settings by ID
     */
    getSettingsById(id: EntityId): Promise<AIProviderSettings | null>;

    /**
     * Delete settings (soft delete)
     */
    deleteSettings(id: EntityId): Promise<void>;
}

/**
 * PostgreSQL implementation of AIProviderSettingsRepository
 */
export class PostgresAIProviderSettingsRepository implements AIProviderSettingsRepository {
    constructor(private pool: Pool) { }

    async getSettingsByHouseholdId(householdId: EntityId): Promise<AIProviderSettings | null> {
        const query = `
            SELECT 
                id,
                household_id,
                provider,
                model,
                provider_config,
                configured_by_member_id,
                configured_at,
                updated_by_member_id,
                updated_at
            FROM finhouse.ai_provider_settings
            WHERE household_id = $1 AND deleted_at IS NULL
            LIMIT 1
        `;

        const result = await this.pool.query(query, [householdId]);

        if (result.rows.length === 0) {
            return null;
        }

        return this.mapRowToSettings(result.rows[0]);
    }

    async getSettingsById(id: EntityId): Promise<AIProviderSettings | null> {
        const query = `
            SELECT 
                id,
                household_id,
                provider,
                model,
                provider_config,
                configured_by_member_id,
                configured_at,
                updated_by_member_id,
                updated_at
            FROM finhouse.ai_provider_settings
            WHERE id = $1 AND deleted_at IS NULL
            LIMIT 1
        `;

        const result = await this.pool.query(query, [id]);

        if (result.rows.length === 0) {
            return null;
        }

        return this.mapRowToSettings(result.rows[0]);
    }

    async upsertSettings(
        householdId: EntityId,
        memberId: EntityId,
        settings: UpdateAIProviderSettingsRequest
    ): Promise<AIProviderSettings> {
        // Check if settings already exist
        const existing = await this.getSettingsByHouseholdId(householdId);

        if (existing) {
            // Update existing settings
            const query = `
                UPDATE finhouse.ai_provider_settings
                SET 
                    provider = $2,
                    model = $3,
                    provider_config = $4,
                    updated_by_member_id = $5,
                    updated_at = NOW()
                WHERE id = $1 AND deleted_at IS NULL
                RETURNING 
                    id,
                    household_id,
                    provider,
                    model,
                    provider_config,
                    configured_by_member_id,
                    configured_at,
                    updated_by_member_id,
                    updated_at
            `;

            const result = await this.pool.query(query, [
                existing.id,
                settings.provider,
                settings.model,
                JSON.stringify(settings.providerConfig || {}),
                memberId,
            ]);

            return this.mapRowToSettings(result.rows[0]);
        } else {
            // Create new settings
            const query = `
                INSERT INTO finhouse.ai_provider_settings (
                    household_id,
                    provider,
                    model,
                    provider_config,
                    configured_by_member_id,
                    configured_at,
                    updated_at
                ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                RETURNING 
                    id,
                    household_id,
                    provider,
                    model,
                    provider_config,
                    configured_by_member_id,
                    configured_at,
                    updated_by_member_id,
                    updated_at
            `;

            const result = await this.pool.query(query, [
                householdId,
                settings.provider,
                settings.model,
                JSON.stringify(settings.providerConfig || {}),
                memberId,
            ]);

            return this.mapRowToSettings(result.rows[0]);
        }
    }

    async deleteSettings(id: EntityId): Promise<void> {
        const query = `
            UPDATE finhouse.ai_provider_settings
            SET deleted_at = NOW()
            WHERE id = $1 AND deleted_at IS NULL
        `;

        await this.pool.query(query, [id]);
    }

    private mapRowToSettings(row: any): AIProviderSettings {
        return {
            id: row.id as EntityId,
            householdId: row.household_id as EntityId,
            provider: row.provider as LLMProviderName,
            model: row.model,
            providerConfig: row.provider_config || {},
            configuredByMemberId: row.configured_by_member_id as EntityId,
            configuredAt: new Date(row.configured_at),
            updatedByMemberId: row.updated_by_member_id as EntityId | undefined,
            updatedAt: new Date(row.updated_at),
        };
    }
}
