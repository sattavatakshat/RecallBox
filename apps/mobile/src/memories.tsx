import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ApiError, Memory, MemoryCreate, MemoryEdit, MemorySummary, memoriesApi } from './api';
import { useSession } from './session';
import {topicOf} from './library-state';

type Store = {
  items: MemorySummary[]; archived: boolean; starredOnly: boolean; initialized: boolean; loading: boolean; error: string; hasMore: boolean; notice: string;
  topic: string | null; order: 'newest' | 'oldest'; topics: string[];
  refresh: (archived?: boolean, starred?: boolean, topic?: string | null, order?: 'newest' | 'oldest') => Promise<void>; more: () => Promise<void>; sync: () => Promise<void>;
  get: (id: string) => Promise<Memory>;
  create: (body: MemoryCreate, key: string) => Promise<Memory>;
  edit: (id: string, body: MemoryEdit) => Promise<Memory>;
  remove: (id: string, version: number) => Promise<void>;
  finishCapture: (memory: Memory) => Promise<void>;
  captureRevision: number;
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
  const topicView = useRef<string | null>(null);
  const orderView = useRef<'newest' | 'oldest'>('newest');
  const [topic, setTopic] = useState<string | null>(null);
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  const [topics, setTopics] = useState<string[]>([]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const polling = useRef(false);
  const captureEpoch = useRef(0);
  const confirmationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [items, setItems] = useState<MemorySummary[]>([]);
  const [archived, setArchived] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [captureRevision,setCaptureRevision] = useState(0);

  // Serialize remote reads and writes. Confirmed captures publish immediately;
  // their epoch invalidates an older list response and versions protect merges. The provider is keyed by account ID and never writes disk.
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
      note.archived === view.current && (!starredView.current || note.starred) &&
      (!topicView.current || topicOf(note) === topicView.current))
      .sort((a, b) => (orderView.current === 'newest' ? -1 : 1) *
        (a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))));
  }
  function merge(note: MemorySummary) {
    const old = records.current.get(note.id);
    if (!old || note.version >= old.version) records.current.set(note.id, note);
  }
  async function updateTopics() {
    try {
      const result = await auth.current(token => memoriesApi.topics(token));
      if (alive.current) setTopics(result.items.map(item => item.topic));
    } catch { /* List availability must not depend on optional topic discovery. */ }
  }
  async function first(archive: boolean, stars: boolean, selectedTopic = topicView.current, selectedOrder = orderView.current) {
    view.current = archive; setArchived(archive);
    starredView.current = stars; setStarredOnly(stars);
    topicView.current = selectedTopic; setTopic(selectedTopic);
    orderView.current = selectedOrder; setOrder(selectedOrder);
    pageCursor.current = null; setHasMore(false);
    publish();
    if (alive.current) {setLoading(true); setError('');}
    const epoch = captureEpoch.current;
    try {
      const page = await auth.current(token => memoriesApi.list(token, archive, undefined, stars, selectedTopic, selectedOrder));
      if (!alive.current || epoch !== captureEpoch.current) return;
      records.current.clear();
      for (const note of page.items) merge(note);
      view.current = archive; setArchived(archive);
      starredView.current = stars; setStarredOnly(stars);
      pageCursor.current = page.next_cursor; setHasMore(Boolean(page.next_cursor));
      syncCursor.current = page.sync_cursor;
      publish();
      setInitialized(true);
      await updateTopics();
    } catch (cause) {
      if (alive.current) setError(errorMessage(cause));
      throw cause;
    } finally { if (alive.current) setLoading(false); }
  }
  const refresh = useCallback((archive?: boolean, stars?: boolean, selectedTopic?: string | null, selectedOrder?: 'newest' | 'oldest') => run(() =>
    first(archive ?? view.current, stars ?? starredView.current,
      selectedTopic === undefined ? topicView.current : selectedTopic, selectedOrder ?? orderView.current)), [run]);
  const more = useCallback(() => run(async () => {
    if (!pageCursor.current) return;
    setLoading(true); setError('');
    const epoch = captureEpoch.current;
    try {
      const page = await auth.current(token => memoriesApi.list(token, view.current, pageCursor.current!, starredView.current, topicView.current, orderView.current));
      if (!alive.current || epoch !== captureEpoch.current) return;
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
            if (page.changes.length) await updateTopics();
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
  const finishCapture = useCallback(async (memory: Memory) => {
    if (!alive.current) throw new ApiError(401, 'session_changed');
    captureEpoch.current += 1;
    merge(summary(memory));
    view.current=false;starredView.current=false;topicView.current=null;setTopic(null);setArchived(false);setStarredOnly(false);
    orderView.current='newest';setOrder('newest');
    pageCursor.current=null;setHasMore(false);
    publish();
    const message='Saved to your Library.';
    setNotice(message);
    setCaptureRevision(value=>value+1);
    if(confirmationTimer.current)clearTimeout(confirmationTimer.current);
    confirmationTimer.current=setTimeout(()=>setNotice(current=>current===message?'':current),6000);
    // A failed refresh must never turn an acknowledged save into a failed save.
    void refresh(false,false,null,'newest').catch(()=>undefined);
  },[refresh]);
  useEffect(() => {
    alive.current = true;
    void refresh().catch(() => undefined);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void sync(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void sync(); }, 30000);
    return () => { alive.current = false; records.current.clear(); syncCursor.current = null; pageCursor.current = null; listener.remove(); clearInterval(timer); if(confirmationTimer.current)clearTimeout(confirmationTimer.current); };
  }, [refresh, sync]);
  return <Context.Provider value={{topic, order, topics, items, archived, starredOnly, initialized, loading, error, notice, hasMore, refresh, more, sync, get, create, edit, remove, finishCapture, captureRevision}}>{children}</Context.Provider>;
}
