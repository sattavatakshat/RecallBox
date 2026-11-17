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
  original_available?: boolean;
  source_url: string | null; extracted_text: string; processing_state: 'queued' | 'processing' | 'ready' | 'metadata_only' | 'failed';
  processing_error: string | null; labels: string[]; collection: string;
  topic_override?: string | null; tags_override?: string[] | null;
  suggested_topic?: string | null; suggested_topic_reason?: string | null;
};
export type SearchEvidence = {field: string; segments: {text: string; matched: boolean}[]};
export type MemorySummary = Omit<Memory, 'content'> & {preview: string; collection_added_at?: string; match_evidence?: SearchEvidence | null};
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
    if(!response.ok) {
      const data=await response.json().catch(()=>null);
      throw new ApiError(response.status,data?.error?.code ?? 'upload_failed');
    }
    return response.json();
  },
  search: (access: string, q: string, mode='keyword', collection?: string, starred=false, kind='all', order='best') => request<{items: MemorySummary[]; pending_index: number; limited?: boolean}>(
    `/search?q=${encodeURIComponent(q)}&mode=${mode}&starred=${starred}&kind=${kind}&order=${order}${collection ? `&collection=${encodeURIComponent(collection)}`:''}`, 'GET', undefined, access),
  collections: (access: string) => request<{items:{collection:string;count:number}[]}>('/collection-labels','GET',undefined,access),
  topics: (access: string) => request<{items: {topic: string; count: number}[]}>('/memory-topics', 'GET', undefined, access),
  list: (access: string, archived: boolean, cursor?: string, starredOnly = false, topic: string | null = null, order: 'newest' | 'oldest' = 'newest') => request<MemoryPage>(
    `/memories?archived=${archived}&limit=20&order=${order}${topic ? `&topic=${encodeURIComponent(topic)}` : ''}${starredOnly ? '&starred=true' : ''}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, 'GET', undefined, access),
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
export type CollectionDetail = Collection & {items: MemorySummary[]; has_more: boolean; next_cursor?: string | null};
export const collectionsApi = {
  forMemory: (access: string, id: string) => request<{items: Collection[]}>(
    `/memories/${encodeURIComponent(id)}/collections`, 'GET', undefined, access),
  list: (access: string) => request<CollectionsPage>('/collections?limit=100', 'GET', undefined, access),
  get: (access: string, id: string, cursor?: string) => request<CollectionDetail>(
    `/collections/${encodeURIComponent(id)}?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, 'GET', undefined, access),
  status: (access: string, id: string, memory_ids: string[]) => request<{items: MemorySummary[]}>(
    `/collections/${encodeURIComponent(id)}/membership-status`, 'POST', {memory_ids}, access),
  candidates: (access: string, id: string, q: string, cursor?: string) => request<{
    name: string; items: (MemorySummary & {already_added: boolean})[]; next_cursor: string | null;
  }>(`/collections/${encodeURIComponent(id)}/candidates?q=${encodeURIComponent(q)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, 'GET', undefined, access),
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

export type ActionOption = {kind:'shopping'|'trip'|'learning';label:string;reason:string;evidence_lines:string[]};
export const actionOptionsApi = {
  forMemory: (access:string,id:string) => request<{items:ActionOption[]; source_version?: number}>(
    `/memories/${encodeURIComponent(id)}/action-options`,'GET',undefined,access),
};
export type ShoppingItem = {id:string;text:string;checked:boolean;
  origin:'source'|'user';source_quote:string|null};
export type ShoppingList = {id:string;source_memory_id:string;title:string;
  source_title:string;source_url:string|null;items:ShoppingItem[];version:number;
  created_at:string;updated_at:string};
export type ShoppingDraft = {expected_source_version: number; title: string; items: ShoppingItem[]};
export const shoppingApi = {
  forSource:(access:string,memoryId:string)=>request<{item:ShoppingList|null}>(
    `/memories/${encodeURIComponent(memoryId)}/shopping-list`,'GET',undefined,access),
  create:(access:string,memoryId:string,body?:ShoppingDraft)=>request<ShoppingList>(
    `/memories/${encodeURIComponent(memoryId)}/shopping-list`,'POST',body,access),
  get:(access:string,id:string)=>request<ShoppingList>(
    `/shopping-lists/${encodeURIComponent(id)}`,'GET',undefined,access),
  edit:(access:string,id:string,body:{expected_version:number;
    title?:string;items?:ShoppingItem[]})=>request<ShoppingList>(
    `/shopping-lists/${encodeURIComponent(id)}`,'PATCH',body,access),
};

export type TripItem = {id:string;label:string;note:string;day:number|null;
  source_memory_id:string|null;origin:'source'|'user'};
export type TripShortlist = {id:string;source_memory_id:string;name:string;
  source_title:string;source_url:string|null;start_date:string|null;end_date:string|null;
  items:TripItem[];version:number;created_at:string;updated_at:string};
export const tripApi = {
  create:(access:string,memoryId:string)=>request<TripShortlist>(
    `/memories/${encodeURIComponent(memoryId)}/trip-shortlist`,'POST',undefined,access),
  get:(access:string,id:string)=>request<TripShortlist>(
    `/trip-shortlists/${encodeURIComponent(id)}`,'GET',undefined,access),
  edit:(access:string,id:string,body:{expected_version:number;name?:string;
    start_date?:string|null;end_date?:string|null;items?:TripItem[]})=>
    request<TripShortlist>(`/trip-shortlists/${encodeURIComponent(id)}`,'PATCH',body,access),
};

export type LearningStatus = 'not_started' | 'in_progress' | 'completed';
export type LearningItem = {
  id:string;source_memory_id:string;source_title:string;source_url:string|null;
  status:LearningStatus;sort_order:number;version:number;created_at:string;updated_at:string;
};
export const learningApi = {
  list:(access:string)=>request<{items:LearningItem[];has_more:boolean}>(
    '/learning-items','GET',undefined,access),
  get:(access:string,id:string)=>request<LearningItem>(
    `/learning-items/${encodeURIComponent(id)}`,'GET',undefined,access),
  create:(access:string,memoryId:string)=>request<LearningItem>(
    `/memories/${encodeURIComponent(memoryId)}/learning-item`,'POST',undefined,access),
  edit:(access:string,id:string,body:{expected_version:number;
    status?:LearningStatus;move?:'up'|'down'})=>request<LearningItem>(
    `/learning-items/${encodeURIComponent(id)}`,'PATCH',body,access),
  remove:(access:string,id:string,version:number)=>request<void>(
    `/learning-items/${encodeURIComponent(id)}?expected_version=${version}`,
    'DELETE',undefined,access),
};

export type Reminder = {
  id:string;source_memory_id:string;source_title:string|null;source_url:string|null;
  due_at:string;time_zone:string;status:'scheduled'|'completed';version:number;
  created_at:string;updated_at:string;
};
export const remindersApi = {
  list:(access:string)=>request<{items:Reminder[];has_more:boolean}>(
    '/reminders','GET',undefined,access),
  create:(access:string,memoryId:string,body:{request_key:string;
    due_at:string;time_zone:string})=>request<Reminder>(
    `/memories/${encodeURIComponent(memoryId)}/reminders`,'POST',body,access),
  complete:(access:string,id:string,version:number)=>request<Reminder>(
    `/reminders/${encodeURIComponent(id)}`,'PATCH',
    {expected_version:version,status:'completed'},access),
  remove:(access:string,id:string,version:number)=>request<void>(
    `/reminders/${encodeURIComponent(id)}?expected_version=${version}`,
    'DELETE',undefined,access),
};
