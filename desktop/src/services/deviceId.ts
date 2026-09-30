/** Stable desktop device identifier (persisted in localStorage). */
let _deviceId = "";

export function getDeviceId(): string {
  if (_deviceId) return _deviceId;
  let id = localStorage.getItem("agentrix_desktop_device_id");
  if (!id) {
    id = `desktop-${crypto.randomUUID()}`;
    localStorage.setItem("agentrix_desktop_device_id", id);
  }
  _deviceId = id;
  return id;
}
