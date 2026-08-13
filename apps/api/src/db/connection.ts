/**
 * PostgreSQL database connection and configuration
 */

import { Pool, PoolClient, types } from "pg";

// Configure BIGINT type (OID 20) to be parsed as JavaScript number
// By default, pg returns BIGINT as string to avoid precision loss,
// but since Money type is already in cents, numbers are safe
types.setTypeParser(20, (val: string) => {
    return val === null ? null : parseInt(val, 10);
});

const pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5434", 10),
    database: process.env.DB_NAME || "house_financial",
    user: process.env.DB_USER || "hf_admin",
    password: process.env.DB_PASSWORD || "hf_admin",
});

// Set schema search path for all connections
pool.on("connect", (client) => {
    client.query("SET search_path TO finhouse", (err) => {
        if (err) {
            console.error("Failed to set search_path", err);
        }
    });
});

pool.on("error", (err) => {
    console.error("Unexpected error on idle client", err);
});

export async function getClient(): Promise<PoolClient> {
    return pool.connect();
}

export async function query(text: string, params?: unknown[]) {
    return pool.query(text, params);
}

export async function runMigrations() {
    const client = await getClient();
    try {
        // Read and execute migration files
        // This would typically read from migrations directory
        console.log("Migrations running...");
    } finally {
        client.release();
    }
}

export async function closeConnection() {
    await pool.end();
}

export default pool;
