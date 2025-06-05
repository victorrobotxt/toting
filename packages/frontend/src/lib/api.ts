export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

export function apiUrl(path: string) {
  return `${API_BASE}${path}`;
}

export function apiFetch(path: string, options?: RequestInit) {
  return fetch(apiUrl(path), options);
}

export async function jsonFetcher(input: string | [string, string]): Promise<any> {
  if (Array.isArray(input)) {
    const [path, token] = input;
    const res = await apiFetch(path, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  }
  const res = await apiFetch(input);
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}
