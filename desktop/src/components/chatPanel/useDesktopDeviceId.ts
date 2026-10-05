import { useEffect, useState } from "react";
import { getDesktopDeviceId } from "../../services/desktop";
import { DEVICE_ENROLLMENT_CHANGED_EVENT } from "../../services/deviceEnrollment";

/**
 * This computer's desktop-sync id, as the chat panel matches tasks and
 * approvals against it. Binding the computer switches the id to `dev_…`
 * mid-session (deviceEnrollment publishes the change); a value read once at
 * mount would keep missing approvals addressed to the new id until a restart
 * (REQ-mobile-094).
 */
export function useDesktopDeviceId(): string {
  const [id, setId] = useState(() => getDesktopDeviceId());
  useEffect(() => {
    const refresh = () => setId(getDesktopDeviceId());
    window.addEventListener(DEVICE_ENROLLMENT_CHANGED_EVENT, refresh);
    // Bound between the first render and this effect.
    refresh();
    return () => window.removeEventListener(DEVICE_ENROLLMENT_CHANGED_EVENT, refresh);
  }, []);
  return id;
}
