/**
 * Keycloak User Sync Service
 * Synchronizes Keycloak users with household members in the database
 */

import { EntityId, HouseholdMember, HouseholdMemberRole, HouseholdMemberVisibility } from "@house-fin/contracts";
import { HouseholdMemberRepository } from "@house-fin/domain";
import { KeycloakToken } from "./jwt-verifier";

/**
 * User sync result
 */
export interface UserSyncResult {
    success: boolean;
    memberId?: string;
    isNew: boolean;
    error?: string;
}

/**
 * Keycloak user sync service
 */
export class KeycloakUserSyncService {
    constructor(private memberRepo: HouseholdMemberRepository) { }

    /**
     * Sync a Keycloak user to a household member
     * @param token Keycloak token with user claims
     * @param householdId Household to sync user into
     * @returns Sync result with member ID if successful
     */
    async syncUser(token: KeycloakToken, householdId: EntityId): Promise<UserSyncResult> {
        try {
            const userId = token.sub;
            if (!userId) {
                return {
                    success: false,
                    isNew: false,
                    error: "No user ID in token",
                };
            }

            // Try to find existing member
            const existing = await this.memberRepo.findByIdentityId(householdId, userId);

            if (existing) {
                // User already synced - just return existing member
                return {
                    success: true,
                    memberId: existing.id,
                    isNew: false,
                };
            }

            // Extract user info from token
            const displayName = this.extractDisplayName(token);

            // Create new household member
            const newMember = await this.memberRepo.create({
                householdId,
                identityId: userId,
                displayName,
                role: HouseholdMemberRole.MEMBER,
                visibility: HouseholdMemberVisibility.VISIBLE,
            });

            console.log("[KEYCLOAK_SYNC_SUCCESS]", {
                householdId,
                userId,
                memberId: newMember.id,
                displayName,
                timestamp: new Date().toISOString(),
            });

            return {
                success: true,
                memberId: newMember.id,
                isNew: true,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            console.error("[KEYCLOAK_SYNC_FAILED]", {
                householdId,
                userId: token.sub,
                error: errorMessage,
                timestamp: new Date().toISOString(),
            });

            return {
                success: false,
                isNew: false,
                error: errorMessage,
            };
        }
    }

    /**
     * Extract display name from Keycloak token
     * Priority: name > preferred_username > email > sub
     */
    private extractDisplayName(token: KeycloakToken): string {
        if (token.name) {
            return token.name;
        }

        if (token.preferred_username) {
            return token.preferred_username;
        }

        if (token.email) {
            return token.email.split("@")[0]; // Use email prefix as fallback
        }

        return token.sub || "Unknown User";
    }
}

/**
 * Factory function to create KeycloakUserSyncService
 */
export function createKeycloakUserSyncService(
    memberRepo: HouseholdMemberRepository
): KeycloakUserSyncService {
    return new KeycloakUserSyncService(memberRepo);
}
