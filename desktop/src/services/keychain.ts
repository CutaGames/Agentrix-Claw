import { invoke } from "@tauri-apps/api/core";

export async function keychainSet(service: string, key: string, value: string): Promise<void> {
  return invoke<void>("desktop_bridge_keychain_set", { service, key, value });
}

export async function keychainGet(service: string, key: string): Promise<string | null> {
  return invoke<string | null>("desktop_bridge_keychain_get", { service, key });
}

export async function keychainDelete(service: string, key: string): Promise<void> {
  return invoke<void>("desktop_bridge_keychain_delete", { service, key });
}
