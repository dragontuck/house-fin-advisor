/**
 * API utilities for making authenticated requests to the backend
 * Automatically includes Keycloak authentication token
 */

/**
 * Fetch wrapper that automatically adds Keycloak token to requests
 */
export async function authenticatedFetch(
    url: string,
    options: RequestInit = {},
    getAccessToken: () => string | null
): Promise<Response> {
    const token = getAccessToken();

    const headers = new Headers(options.headers || {});

    // Add authorization header if token is available
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    // Add correlation ID for tracking
    headers.set('x-correlation-id', generateCorrelationId());

    const response = await fetch(url, {
        ...options,
        headers,
    });

    return response;
}

/**
 * Generate a correlation ID for request tracing
 */
function generateCorrelationId(): string {
    return `web-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Parse API error response
 */
export interface ApiError {
    error?: string;
    message?: string;
    userMessage?: string;
    errorCode?: string;
    correlationId?: string;
    timestamp?: string;
}

/**
 * Parse error response from API
 */
export async function parseApiError(response: Response): Promise<ApiError> {
    try {
        return await response.json();
    } catch {
        return {
            message: `HTTP ${response.status}: ${response.statusText}`,
            errorCode: 'HTTP_ERROR',
        };
    }
}

/**
 * Handle API error response
 */
export async function handleApiError(response: Response): Promise<never> {
    const error = await parseApiError(response);

    const message = error.userMessage || error.message || 'An error occurred';
    const errorCode = error.errorCode || 'UNKNOWN_ERROR';

    const err = new Error(message) as Error & { code?: string; statusCode?: number };
    err.code = errorCode;
    (err as any).statusCode = response.status;

    throw err;
}
