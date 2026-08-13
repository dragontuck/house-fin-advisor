/**
 * API Client for Financial Pulse
 * Provides type-safe access to backend endpoints
 */

export interface AccountBalance {
    name: string;
    balance: number;
    type: string;
}

export interface FinancialPulseData {
    householdId: string;
    householdName: string;
    asOf: string;
    healthStatus: "HEALTHY" | "ATTENTION" | "AT_RISK";
    healthMessage: string;
    keyMetrics: {
        netWorth: number;
        cashAvailable: number;
        monthlyIncome: number;
        monthlyExpenses: number;
        monthlySurplus: number;
        totalDebt: number;
    };
    accountsSummary: {
        cash: AccountBalance[];
        retirement: AccountBalance[];
        investments: AccountBalance[];
        debt: AccountBalance[];
    };
    statusMessage: string;
}

// Use relative URL to leverage vite proxy in dev mode, or environment variable in production
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const HOUSEHOLD_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

/**
 * Common headers for all API requests
 * Includes householdId for context-aware operations
 */
function getApiHeaders(): HeadersInit {
    return {
        "Content-Type": "application/json",
        "x-household-id": HOUSEHOLD_ID,
    };
}

export async function fetchFinancialPulse(): Promise<FinancialPulseData> {
    try {
        const response = await fetch(`${API_BASE_URL}/financial-pulse`, {
            method: "GET",
            headers: getApiHeaders(),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.userMessage || "Failed to fetch financial pulse");
        }

        return await response.json();
    } catch (error) {
        console.error("API Error:", error);
        throw error;
    }
}

export async function fetchHousehold() {
    try {
        const response = await fetch(`${API_BASE_URL}/household`, {
            method: "GET",
            headers: getApiHeaders(),
        });

        if (!response.ok) {
            throw new Error("Failed to fetch household");
        }

        return await response.json();
    } catch (error) {
        console.error("API Error:", error);
        throw error;
    }
}
