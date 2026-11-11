import { invoke } from "@tauri-apps/api/core";

export interface ScreenCaptureResult {
  width: number;
  height: number;
  dataBase64: string;
  filePath: string | null;
}

export async function captureScreen(saveToFile = false): Promise<ScreenCaptureResult> {
  return invoke<ScreenCaptureResult>("desktop_bridge_capture_screen", { saveToFile });
}
