import { apiURL } from './config';
export type Tokens = {access_token: string; refresh_token: string; expires_in: number; token_type: 'Bearer'};
export type Account = {id: string; display_name: string | null; created_at: string};
export type Exchange = {provider: string; code: string; code_verifier: string; nonce: string; client_device_id: string; platform: 'ios' | 'android'};
export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
async function request<T>(path: string, method: string, body?: object, access?: string): Promise<T> {
  const response = await fetch(`${apiURL()}/v1${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(access ? { Authorization: `Bearer ${access}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(response.status, data?.error?.code ?? 'request_failed');
  }
  return response.status === 204 ? undefined as T : response.json();
}
export const api = {
  exchange: (body: Exchange) => request<Tokens>('/auth/exchange', 'POST', body),
  refresh: (refresh_token: string) => request<Tokens>('/auth/refresh', 'POST', {refresh_token}),
  me: (access: string) => request<Account>('/me', 'GET', undefined, access),
  logout: (access: string) => request<void>('/auth/logout', 'POST', undefined, access),
};
