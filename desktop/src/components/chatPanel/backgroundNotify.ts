/** A system notification when the chat window is not focused (moved out of ChatPanelImpl.tsx unchanged). */
export async function notifyIfBackground(title: string, body: string) {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const focused = await win.isFocused();
    if (!focused) {
      const { sendNotification, isPermissionGranted, requestPermission } =
        await import("@tauri-apps/plugin-notification");
      let permitted = await isPermissionGranted();
      if (!permitted) permitted = (await requestPermission()) === "granted";
      if (permitted) sendNotification({ title, body: body.slice(0, 100) });
    }
  } catch {}
}
