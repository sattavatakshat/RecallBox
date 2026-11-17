import type {MemorySummary} from './api';

export function topicOf(item: MemorySummary) {
  return item.topic_override === 'Uncategorized' ? null :
    (item.topic_override ?? item.suggested_topic ?? null);
}

/** Enrichment readiness is independent of the durably saved original. */
export function isUsableMemory(item: MemorySummary) {
  if (!item.id || item.original_available === false) return false;
  if (item.kind === 'url' || item.kind === 'link') {
    return /^https?:\/\/[^\s/]+/i.test(item.source_url || item.preview);
  }
  // Existing API versions guarantee file bytes and their memory commit together.
  // These are server records, never local upload attempts or queued requests.
  return ['note', 'image', 'pdf'].includes(item.kind);
}

export function isUnfinishedMemory(item: MemorySummary) {
  return !isUsableMemory(item);
}

export type LibraryMode = 'loading' | 'error' | 'empty' | 'pending' | 'populated' | 'filtered';
export function libraryMode(store: {
  items: MemorySummary[]; archived: boolean; starredOnly: boolean; topic?: string | null;
  initialized: boolean; loading: boolean; error: string; hasMore: boolean;
}): LibraryMode {
  if (store.archived || store.starredOnly || store.topic) return 'filtered';
  if (store.items.some(isUsableMemory)) return 'populated';
  if (store.error) return 'error';
  if (!store.initialized || store.loading || store.hasMore) return 'loading';
  return store.items.some(isUnfinishedMemory) ? 'pending' : 'empty';
}
