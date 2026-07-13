/**
 * Jest mock for `react-native-mmkv` — MMKV's JSI bridge can't load
 * outside of a React Native runtime, so we provide a small in-memory
 * implementation that's API-compatible enough for any service that
 * imports `mmkv.getString` / `mmkv.set` / `mmkv.delete`.
 */
class InMemoryMMKV {
  private store = new Map<string, string>();
  getString(key: string): string | undefined {
    return this.store.get(key);
  }
  set(key: string, value: string | number | boolean): void {
    this.store.set(key, String(value));
  }
  delete(key: string): void {
    this.store.delete(key);
  }
  contains(key: string): boolean {
    return this.store.has(key);
  }
  getAllKeys(): string[] {
    return Array.from(this.store.keys());
  }
  clearAll(): void {
    this.store.clear();
  }
  getNumber(key: string): number | undefined {
    const v = this.store.get(key);
    return v === undefined ? undefined : Number(v);
  }
  getBoolean(key: string): boolean | undefined {
    const v = this.store.get(key);
    return v === undefined ? undefined : v === 'true';
  }
}

export class MMKV {
  private inner = new InMemoryMMKV();
  constructor(_opts?: any) {}
  getString = (k: string) => this.inner.getString(k);
  set = (k: string, v: any) => this.inner.set(k, v);
  delete = (k: string) => this.inner.delete(k);
  contains = (k: string) => this.inner.contains(k);
  getAllKeys = () => this.inner.getAllKeys();
  clearAll = () => this.inner.clearAll();
  getNumber = (k: string) => this.inner.getNumber(k);
  getBoolean = (k: string) => this.inner.getBoolean(k);
}

export default { MMKV };
