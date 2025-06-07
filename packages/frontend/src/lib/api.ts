// packages/frontend/src/lib/api.ts

/**
 * Prepends the backend API base URL to a given path.
 * @param path The relative path of the API endpoint (e.g., '/elections').
 * @returns The full URL for the API endpoint.
 */
export function apiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
  return `${base}${path}`;
}

/**
 * A fetcher function for use with SWR that handles JSON responses and auth tokens.
 * @param args An array where the first element is the path and the optional second is a JWT.
 * @returns The JSON response from the API.
 * @throws An error if the fetch response is not ok.
 */
export async function jsonFetcher([path, token]: [string, string?]): Promise<any> {
  const url = apiUrl(path);
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, { headers });

  if (!res.ok) {
    const error = new Error(
      res.status === 401
        ? 'Unauthorized'
        : 'An error occurred while fetching the data.'
    );
    try {
      (error as any).info = await res.json();
    } catch (e) {
      (error as any).info = { detail: res.statusText };
    }
    (error as any).status = res.status;
    throw error;
  }

  return res.json();
}
