import type {MemorySummary} from './api';

/** Link-only previews are usable; unfinished sources belong in capture recovery. */
export function isUsableMemory(item: MemorySummary) {
  return item.kind === 'note' || item.processing_state === 'ready' ||
    item.processing_state === 'metadata_only';
}

export function isUnfinishedMemory(item: MemorySummary) {
  return !isUsableMemory(item) && (item.processing_state === 'queued' ||
    item.processing_state === 'processing' || item.processing_state === 'failed');
}

export type LibraryMode = 'loading' | 'error' | 'empty' | 'pending' | 'populated' | 'filtered';
export function libraryMode(store: {
  items: MemorySummary[]; archived: boolean; starredOnly: boolean;
  initialized: boolean; loading: boolean; error: string; hasMore: boolean;
}): LibraryMode {
  if (store.archived || store.starredOnly) return 'filtered';
  if (store.items.some(isUsableMemory)) return 'populated';
  if (store.error) return 'error';
  // A page of queued captures must not conceal an older usable item.
  if (!store.initialized || store.loading || store.hasMore) return 'loading';
  return store.items.some(isUnfinishedMemory) ? 'pending' : 'empty';
}
