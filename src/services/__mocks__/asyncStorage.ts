/**
 * Jest mock for `@react-native-async-storage/async-storage`.
 * Native storage is unavailable in the Node test runtime, so keep the common
 * AsyncStorage surface in memory while preserving its Promise-based contract.
 */
const store = new Map<string, string>();

async function getItem(key: string): Promise<string | null> {
  return store.has(key) ? (store.get(key) as string) : null;
}

async function setItem(key: string, value: string): Promise<void> {
  store.set(key, value);
}

async function removeItem(key: string): Promise<void> {
  store.delete(key);
}

async function clear(): Promise<void> {
  store.clear();
}

async function getAllKeys(): Promise<string[]> {
  return Array.from(store.keys());
}

async function multiGet(keys: readonly string[]): Promise<[string, string | null][]> {
  return Promise.all(keys.map(async (key) => [key, await getItem(key)] as [string, string | null]));
}

async function multiSet(entries: readonly (readonly [string, string])[]): Promise<void> {
  for (const [key, value] of entries) store.set(key, value);
}

async function multiRemove(keys: readonly string[]): Promise<void> {
  for (const key of keys) store.delete(key);
}

const AsyncStorage = {
  getItem,
  setItem,
  removeItem,
  clear,
  getAllKeys,
  multiGet,
  multiSet,
  multiRemove,
};

export { getItem, setItem, removeItem, clear, getAllKeys, multiGet, multiSet, multiRemove };
export default AsyncStorage;
