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
  id: string; kind: 'note' | 'link' | 'url' | 'image' | 'pdf'; title: string; content: string; version: number;
  starred: boolean; archived: boolean; created_at: string; updated_at: string;
  source_url: string | null; extracted_text: string; processing_state: 'queued' | 'processing' | 'ready' | 'metadata_only' | 'failed';
  processing_error: string | null; labels: string[]; collection: string;
  topic_override?: string | null; tags_override?: string[] | null;
  suggested_topic?: string | null; suggested_topic_reason?: string | null;
};
export type MemorySummary = Omit<Memory, 'content'> & {preview: string};
export type MemoryPage = {items: MemorySummary[]; next_cursor: string | null; sync_cursor: string};
export type MemoryCreate = {title: string; content: string; kind?: 'note' | 'link'};
export type MemoryEdit = {expected_version: number; title?: string; content?: string; starred?: boolean; archived?: boolean; collection?: string; topic_override?: string | null; tags_override?: string[] | null};
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
  collections: (access: string) => request<{items:{collection:string;count:number}[]}>('/collection-labels','GET',undefined,access),
  list: (access: string, archived: boolean, cursor?: string, starredOnly = false) => request<MemoryPage>(
    `/memories?archived=${archived}&limit=20${starredOnly ? '&starred=true' : ''}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, 'GET', undefined, access),
  get: (access: string, id: string) => request<Memory>(`/memories/${encodeURIComponent(id)}`, 'GET', undefined, access),
  create: (access: string, body: MemoryCreate, key: string) => request<Memory>(
    '/memories', 'POST', body, access, {'Idempotency-Key': key}),
  edit: (access: string, id: string, body: MemoryEdit) => request<Memory>(
    `/memories/${encodeURIComponent(id)}`, 'PATCH', body, access),
  remove: (access: string, id: string, version: number) => request<void>(
    `/memories/${encodeURIComponent(id)}?expected_version=${version}`, 'DELETE', undefined, access),
  sync: (access: string, cursor: string) => request<SyncPage>(
    `/sync?limit=20&cursor=${encodeURIComponent(cursor)}`, 'GET', undefined, access),
};

export type Collection = {
  id: string; name: string; version: number; created_at: string;
  updated_at: string; item_count?: number;
};
export type CollectionsPage = {items: Collection[]; has_more: boolean};
export type CollectionDetail = Collection & {items: MemorySummary[]; has_more: boolean};
export const collectionsApi = {
  forMemory: (access: string, id: string) => request<{items: Collection[]}>(
    `/memories/${encodeURIComponent(id)}/collections`, 'GET', undefined, access),
  list: (access: string) => request<CollectionsPage>('/collections?limit=100', 'GET', undefined, access),
  get: (access: string, id: string) => request<CollectionDetail>(
    `/collections/${encodeURIComponent(id)}?limit=100`, 'GET', undefined, access),
  create: (access: string, name: string) => request<Collection>(
    '/collections', 'POST', {name}, access),
  rename: (access: string, id: string, name: string, version: number) => request<Collection>(
    `/collections/${encodeURIComponent(id)}`, 'PATCH', {name, expected_version: version}, access),
  remove: (access: string, id: string, version: number) => request<void>(
    `/collections/${encodeURIComponent(id)}?expected_version=${version}`, 'DELETE', undefined, access),
  add: (access: string, collectionId: string, memoryId: string) => request<void>(
    `/collections/${encodeURIComponent(collectionId)}/memories/${encodeURIComponent(memoryId)}`,
    'PUT', undefined, access),
  removeItem: (access: string, collectionId: string, memoryId: string) => request<void>(
    `/collections/${encodeURIComponent(collectionId)}/memories/${encodeURIComponent(memoryId)}`,
    'DELETE', undefined, access),
};
