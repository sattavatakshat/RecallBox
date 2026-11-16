import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ApiError, Memory, MemoryCreate, MemoryEdit, MemorySummary, memoriesApi } from './api';
import { useSession } from './session';

type Store = {
  items: MemorySummary[]; archived: boolean; starredOnly: boolean; loading: boolean; error: string; hasMore: boolean; notice: string;
  refresh: (archived?: boolean, starred?: boolean) => Promise<void>; more: () => Promise<void>; sync: () => Promise<void>;
  get: (id: string) => Promise<Memory>;
  create: (body: MemoryCreate, key: string) => Promise<Memory>;
  edit: (id: string, body: MemoryEdit) => Promise<Memory>;
  remove: (id: string, version: number) => Promise<void>;
};
const Context = createContext<Store | null>(null);
export function useMemories() {
  const store = useContext(Context);
  if (!store) throw new Error('Memory store missing');
  return store;
}
function summary(note: Memory): MemorySummary {
  const {content, ...metadata} = note;
  return {...metadata, preview: content.slice(0, 200)};
}
export function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session ended. Sign in again.';
    if (error.code === 'version_conflict') return 'This memory changed elsewhere. Your draft is still here.';
    if (error.code === 'memory_not_found' || error.code === 'memory_deleted') return 'This memory was deleted or is unavailable.';
    if (error.code === 'idempotency_expired') return 'This save attempt expired. Check your library before saving again.';
    if (error.code === 'idempotency_mismatch') return 'This save key belongs to a different draft. Check the inbox before saving again.';
    if (error.status === 413 || error.status === 422) return 'Check the text and file size, then try again.';
  }
  return 'Could not reach your RecallBox. Check your connection and try again.';
}

export function MemoryProvider({children}: React.PropsWithChildren) {
  const {authorized} = useSession();
  const auth = useRef(authorized); auth.current = authorized;
  const alive = useRef(true);
  const records = useRef(new Map<string, MemorySummary>());
  const pageCursor = useRef<string | null>(null);
  const syncCursor = useRef<string | null>(null);
  const view = useRef(false);
  const starredView = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const polling = useRef(false);
  const [items, setItems] = useState<MemorySummary[]>([]);
  const [archived, setArchived] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [hasMore, setHasMore] = useState(false);

  // Serialize list, sync and local writes, so an older response cannot overwrite
  // a newer mutation. The provider is keyed by account ID and never writes disk.
  const run = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const job = queue.current.then(async () => {
      if (!alive.current) throw new ApiError(401, 'session_changed');
      return operation();
    });
    queue.current = job.catch(() => undefined);
    return job;
  }, []);
  function publish() {
    if (!alive.current) return;
    setItems([...records.current.values()].filter(note =>
      note.archived === view.current && (!starredView.current || note.starred))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)));
  }
  function merge(note: MemorySummary) {
    const old = records.current.get(note.id);
    if (!old || note.version >= old.version) records.current.set(note.id, note);
  }
  async function first(archive: boolean, stars: boolean) {
    if (alive.current) {setLoading(true); setError('');}
    try {
      const page = await auth.current(token => memoriesApi.list(token, archive, undefined, stars));
      if (!alive.current) return;
      records.current.clear();
      for (const note of page.items) merge(note);
      view.current = archive; setArchived(archive);
      starredView.current = stars; setStarredOnly(stars);
      pageCursor.current = page.next_cursor; setHasMore(Boolean(page.next_cursor));
      syncCursor.current = page.sync_cursor;
      publish();
    } catch (cause) {
      if (alive.current) setError(errorMessage(cause));
      throw cause;
    } finally { if (alive.current) setLoading(false); }
  }
  const refresh = useCallback((archive?: boolean, stars?: boolean) => run(() =>
    first(archive ?? view.current, stars ?? starredView.current)), [run]);
  const more = useCallback(() => run(async () => {
    if (!pageCursor.current) return;
    setLoading(true); setError('');
    try {
      const page = await auth.current(token => memoriesApi.list(token, view.current, pageCursor.current!, starredView.current));
      if (!alive.current) return;
      for (const note of page.items) merge(note);
      pageCursor.current = page.next_cursor; setHasMore(Boolean(page.next_cursor));
      // Keep the FIRST page's sync cursor: later list requests must not skip changes.
      publish();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 410) await first(view.current, starredView.current);
      else { if (alive.current) setError(errorMessage(cause)); throw cause; }
    } finally { if (alive.current) setLoading(false); }
  }), [run]);
  const sync = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      // One network page per queued operation. A foreground open/edit/save
      // already waiting on the queue can run between sync pages instead of
      // being blocked by up to ten serial network calls.
      for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
        const hasMore = await run(async () => {
          if (!syncCursor.current) return false;
          try {
            const page = await auth.current(token => memoriesApi.sync(token, syncCursor.current!));
            if (!alive.current) return false;
            for (const change of page.changes) {
              if (change.operation === 'delete') records.current.delete(change.id);
              else merge(change.memory);
            }
            syncCursor.current = page.next_cursor;
            publish();
            setError('');
            return page.has_more;
          } catch (cause) {
            if (cause instanceof ApiError && cause.status === 410) {
              setNotice('Your library was refreshed to bring back the latest saves. Open drafts are unchanged.');
              await first(view.current, starredView.current);
            } else if (alive.current) {
              setError(errorMessage(cause));
            }
            return false;
          }
        });
        if (!hasMore || !alive.current) return;
      }
    } catch (cause) {
      if (alive.current) setError(errorMessage(cause));
    } finally {
      polling.current = false;
    }
  }, [run]);
  const get = useCallback((id: string) => run(() => auth.current(token => memoriesApi.get(token, id))), [run]);
  const create = useCallback((body: MemoryCreate, key: string) => run(async () => {
    const note = await auth.current(token => memoriesApi.create(token, body, key));
    if (alive.current) { merge(summary(note)); publish(); }
    return note;
  }), [run]);
  const edit = useCallback((id: string, body: MemoryEdit) => run(async () => {
    const note = await auth.current(token => memoriesApi.edit(token, id, body));
    if (alive.current) { merge(summary(note)); publish(); }
    return note;
  }), [run]);
  const remove = useCallback((id: string, version: number) => run(async () => {
    await auth.current(token => memoriesApi.remove(token, id, version));
    if (alive.current) { records.current.delete(id); publish(); }
  }), [run]);
  useEffect(() => {
    alive.current = true;
    void refresh().catch(() => undefined);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void sync(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void sync(); }, 30000);
    return () => { alive.current = false; records.current.clear(); syncCursor.current = null; pageCursor.current = null; listener.remove(); clearInterval(timer); };
  }, [refresh, sync]);
  return <Context.Provider value={{items, archived, starredOnly, loading, error, notice, hasMore, refresh, more, sync, get, create, edit, remove}}>{children}</Context.Provider>;
}
