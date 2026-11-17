import * as SecureStore from 'expo-secure-store';

// Matches GET /v1/search. History is encrypted device-local data, never synced,
// logged, or sent to analytics. Account IDs are encoded without key collisions.
export const SEARCH_QUERY_LIMIT = 200;
const HISTORY_LIMIT = 10;
const options = {keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
const queues = new Map<string, Promise<unknown>>();
const keyFor = (accountId: string) => `recallbox.search.v1.${Array.from(accountId)
  .map(char => char.codePointAt(0)!.toString(16)).join('-')}`;

function serialize<T>(accountId: string, action: (key: string) => Promise<T>): Promise<T> {
  const key = keyFor(accountId);
  const job = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(() => action(key));
  queues.set(key, job);
  void job.finally(() => {if (queues.get(key) === job) queues.delete(key);}).catch(() => undefined);
  return job;
}
async function read(key: string): Promise<string[]> {
  const stored = await SecureStore.getItemAsync(key);
  if (stored === null) return [];
  const queries: unknown = JSON.parse(stored);
  if (!Array.isArray(queries) || queries.length > HISTORY_LIMIT ||
    !queries.every(q => typeof q === 'string' && q.trim() === q && q.length > 0 && q.length <= SEARCH_QUERY_LIMIT)) {
    throw new Error('Invalid local search history');
  }
  return [...new Set(queries as string[])];
}
export const searchHistory = {
  load: (accountId: string) => serialize(accountId, read),
  remember: (accountId: string, query: string) => serialize(accountId, async key => {
    const q = query.trim();
    if (!q || q.length > SEARCH_QUERY_LIMIT) throw new Error('Invalid search query');
    const previous = await read(key);
    const next = [q, ...previous.filter(item => item.toLowerCase() !== q.toLowerCase())].slice(0, HISTORY_LIMIT);
    await SecureStore.setItemAsync(key, JSON.stringify(next), options);
    return next;
  }),
  clear: (accountId: string) => serialize(accountId, key => SecureStore.deleteItemAsync(key)),
};
