export function csrfToken() { return typeof document === 'undefined' ? '' : decodeURIComponent(document.cookie.split('; ').find((entry) => entry.startsWith('wb_csrf='))?.slice(8) ?? ''); }
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (init.method && init.method !== 'GET') headers.set('x-csrf-token', csrfToken());
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin', cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? 'Request failed');
  return body as T;
}

