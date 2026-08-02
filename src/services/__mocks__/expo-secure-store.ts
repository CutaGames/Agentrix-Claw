/**
 * Jest mock for `expo-secure-store`. The native keystore is unavailable outside
 * a device runtime, so this provides an in-memory, API-compatible stand-in for
 * the getItemAsync / setItemAsync / deleteItemAsync surface used by services.
 */
const store = new Map<string, string>();

export async function getItemAsync(key: string): Promise<string | null> {
  return store.has(key) ? (store.get(key) as string) : null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  store.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  store.delete(key);
}

export async function isAvailableAsync(): Promise<boolean> {
  return true;
}

export default { getItemAsync, setItemAsync, deleteItemAsync, isAvailableAsync };
