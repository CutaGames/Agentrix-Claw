/**
 * Stable desktop device identifier (persisted in localStorage). Read every
 * time, not cached: binding this computer switches it to `dev_…` mid-session
 * (deviceEnrollment), and session sync must follow (REQ-mobile-094).
 */
export function getDeviceId(): string {
  let id = localStorage.getItem("agentrix_desktop_device_id");
  if (!id) {
    id = `desktop-${crypto.randomUUID()}`;
    localStorage.setItem("agentrix_desktop_device_id", id);
  }
  return id;
}
