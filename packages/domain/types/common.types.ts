/**
 * Common Domain Types
 * 
 * Shared type definitions used across the domain layer.
 */

/**
 * Entity ID - A unique identifier for domain entities
 * In this application, uses UUID v4 format
 */
export type EntityId = string;

/**
 * User identifier from Keycloak
 */
export type UserId = string;

/**
 * Household identifier
 */
export type HouseholdId = string;
