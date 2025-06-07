// packages/frontend/src/lib/api.ts

/**
 * Constructs a full URL to the backend API.
 * @param path The path to the API endpoint (e.g., '/elections').
 * @returns The full URL.
 */
export const apiUrl = (path: string): string => {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
    return `${apiBase}${path}`;
};

/**
 * A generic JSON fetcher for use with SWR.
 * Handles authentication headers and throws an error on non-ok responses.
 * @param url The API endpoint path.
 * @param token The JWT for authorization.
 * @returns The JSON response data.
 */
export const jsonFetcher = async ([url, token]: [string, string?]): Promise<any> => {
    const fullUrl = url.startsWith('http') ? url : apiUrl(url);

    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(fullUrl, { headers });

    if (!res.ok) {
        const error = new Error('An error occurred while fetching the data.');
        // Attach extra info to the error object.
        try {
            const info = await res.json();
            (error as any).info = info;
            error.message = info.detail || res.statusText;
        } catch (e) {
            // The response was not JSON.
            error.message = res.statusText;
        }
        (error as any).status = res.status;
        throw error;
    }

    return res.json();
};
