/**
 * Jest mock for `@react-native-async-storage/async-storage` — referenced by
 * `jest.config.js` `moduleNameMapper` but missing until 2026-09-16. In-memory,
 * promise-based, covers the subset the app's services use.
 */
const store = new Map<string, string>();

async function getItem(key: string): Promise<string | null> {
  return store.has(key) ? (store.get(key) as string) : null;
}

async function setItem(key: string, value: string): Promise<void> {
  store.set(key, String(value));
}

async function removeItem(key: string): Promise<void> {
  store.delete(key);
}

async function mergeItem(key: string, value: string): Promise<void> {
  const current = store.get(key);
  if (!current) {
    store.set(key, value);
    return;
  }
  try {
    store.set(key, JSON.stringify({ ...JSON.parse(current), ...JSON.parse(value) }));
  } catch {
    store.set(key, value);
  }
}

async function clear(): Promise<void> {
  store.clear();
}

async function getAllKeys(): Promise<readonly string[]> {
  return Array.from(store.keys());
}

async function multiGet(keys: readonly string[]): Promise<readonly [string, string | null][]> {
  return keys.map((key) => [key, store.has(key) ? (store.get(key) as string) : null] as [string, string | null]);
}

async function multiSet(pairs: readonly [string, string][]): Promise<void> {
  for (const [key, value] of pairs) store.set(key, String(value));
}

async function multiRemove(keys: readonly string[]): Promise<void> {
  for (const key of keys) store.delete(key);
}

const AsyncStorage = {
  getItem,
  setItem,
  removeItem,
  mergeItem,
  clear,
  getAllKeys,
  multiGet,
  multiSet,
  multiRemove,
};

export { getItem, setItem, removeItem, mergeItem, clear, getAllKeys, multiGet, multiSet, multiRemove };
export default AsyncStorage;
