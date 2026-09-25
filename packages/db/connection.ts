/**
 * Database Connection Module
 * 
 * Provides query and transaction support for PostgreSQL operations.
 * Used by all repository implementations.
 */

import { Pool, QueryResult, PoolClient } from 'pg';

// Initialize connection pool
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5434', 10),
    database: process.env.DB_NAME || 'house_financial',
    user: process.env.DB_USER || 'hf_admin',
    password: process.env.DB_PASSWORD || 'hf_admin',
    max: parseInt(process.env.DB_POOL_SIZE || '20', 10),
});

/**
 * Execute a query on the connection pool
 */
export async function query<T extends Record<string, any> = any>(
    sql: string,
    params?: any[],
): Promise<QueryResult<T>> {
    return pool.query<T>(sql, params);
}

/**
 * Get a client for transaction management
 */
export async function getClient(): Promise<PoolClient> {
    return pool.connect();
}

/**
 * Close the connection pool (graceful shutdown)
 */
export async function closePool(): Promise<void> {
    await pool.end();
}

/**
 * Get the connection pool directly (for initialization of other services)
 */
export function getPool(): Pool {
    return pool;
}
