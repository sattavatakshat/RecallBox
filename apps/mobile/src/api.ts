import { apiURL } from './config';
import { fetch as fileFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
export type Tokens = {access_token: string; refresh_token: string; expires_in: number; token_type: 'Bearer'};
export type Account = {id: string; display_name: string | null; created_at: string};
export type Exchange = {provider: string; code: string; code_verifier: string; nonce: string; client_device_id: string; platform: 'ios' | 'android'};
export class ApiError extends Error {
  constructor(public status: number, public code: string, public current?: Memory) { super(code); }
}
async function request<T>(path: string, method: string, body?: object, access?: string, headers?: Record<string, string>): Promise<T> {
  const response = await fetch(`${apiURL()}/v1${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...headers, ...(access ? { Authorization: `Bearer ${access}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(response.status, data?.error?.code ?? 'request_failed', data?.error?.current);
  }
  return response.status === 204 ? undefined as T : response.json();
}
export const api = {
  exchange: (body: Exchange) => request<Tokens>('/auth/exchange', 'POST', body),
  refresh: (refresh_token: string) => request<Tokens>('/auth/refresh', 'POST', {refresh_token}),
  me: (access: string) => request<Account>('/me', 'GET', undefined, access),
  logout: (access: string) => request<void>('/auth/logout', 'POST', undefined, access),
};

export type Memory = {
  id: string; kind: 'note' | 'url' | 'image' | 'pdf'; title: string; content: string; version: number;
  starred: boolean; archived: boolean; created_at: string; updated_at: string;
  source_url: string | null; extracted_text: string; processing_state: 'queued' | 'processing' | 'ready' | 'metadata_only' | 'failed';
  processing_error: string | null; labels: string[]; collection: string;
};
export type MemorySummary = Omit<Memory, 'content'> & {preview: string};
export type MemoryPage = {items: MemorySummary[]; next_cursor: string | null; sync_cursor: string};
export type MemoryEdit = {expected_version: number; title?: string; content?: string; starred?: boolean; archived?: boolean; collection?: string};
export type SyncChange = {sequence: string} & (
  {operation: 'upsert'; memory: MemorySummary} | {operation: 'delete'; id: string; version: number}
);
export type SyncPage = {changes: SyncChange[]; has_more: boolean; next_cursor: string};
export const memoriesApi = {
  capture: (access: string, url: string, key: string) => request<Memory>('/captures','POST',{url},access,{'Idempotency-Key':key}),
  retry: (access: string, id: string) => request<Memory>(`/memories/${encodeURIComponent(id)}/retry`,'POST',undefined,access),
  upload: async (access: string, uri: string, mime: string, name: string, key: string): Promise<Memory> => {
    const file = new File(uri);
    if (!file.size || file.size > 8 * 1024 * 1024) throw new ApiError(413,'file_too_large');
    const response = await fileFetch(`${apiURL()}/v1/uploads?filename=${encodeURIComponent(name)}`, {
      method:'POST', headers:{Authorization:`Bearer ${access}`,'Content-Type':mime,'Idempotency-Key':key},body:file,
      signal:AbortSignal.timeout(60000),
    });
    if(!response.ok) throw new ApiError(response.status,'upload_failed');
    return response.json();
  },
  search: (access: string, q: string, mode='keyword', collection?: string, starred=false) => request<{items: MemorySummary[]; pending_index: number}>(
    `/search?q=${encodeURIComponent(q)}&mode=${mode}&starred=${starred}${collection ? `&collection=${encodeURIComponent(collection)}`:''}`, 'GET', undefined, access),
  collections: (access: string) => request<{items:{collection:string;count:number}[]}>('/collections','GET',undefined,access),
  list: (access: string, archived: boolean, cursor?: string) => request<MemoryPage>(
    `/memories?archived=${archived}&limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, 'GET', undefined, access),
  get: (access: string, id: string) => request<Memory>(`/memories/${encodeURIComponent(id)}`, 'GET', undefined, access),
  create: (access: string, body: {title: string; content: string}, key: string) => request<Memory>(
    '/memories', 'POST', body, access, {'Idempotency-Key': key}),
  edit: (access: string, id: string, body: MemoryEdit) => request<Memory>(
    `/memories/${encodeURIComponent(id)}`, 'PATCH', body, access),
  remove: (access: string, id: string, version: number) => request<void>(
    `/memories/${encodeURIComponent(id)}?expected_version=${version}`, 'DELETE', undefined, access),
  sync: (access: string, cursor: string) => request<SyncPage>(
    `/sync?limit=20&cursor=${encodeURIComponent(cursor)}`, 'GET', undefined, access),
};
