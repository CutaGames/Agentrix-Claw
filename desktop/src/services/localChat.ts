import { appDataDir, join } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import { LocalLLMSidecar, LocalModelManager, type ChatMessage } from './localLLM';

export const DESKTOP_LOCAL_MODEL_ID = 'gemma-4-e2b-local';
export const DESKTOP_LOCAL_MODEL_LABEL = 'Gemma 4 E2B (Local)';
export const DESKTOP_LOCAL_MODEL_ALIASES = new Set([
  DESKTOP_LOCAL_MODEL_ID,
  'gemma-nano-2b-local',
  'gemma-nano-2b',
  'gemma-4-e2b',
  'gemma-4-e4b',
  'gemma-4-2b',
  'gemma-4-4b',
  'gemma-4-26b-a4b',
  'gemma-4-31b',
]);

const MODEL_PATH_STORAGE_KEY = 'agentrix_local_model_path';
const MODELS_DIR_STORAGE_KEY = 'agentrix_local_models_dir';

export function isDesktopLocalModelId(modelId?: string | null): boolean {
  return !!modelId && DESKTOP_LOCAL_MODEL_ALIASES.has(modelId);
}

export function normalizeDesktopLocalModelId(modelId?: string | null): string {
  return isDesktopLocalModelId(modelId) ? DESKTOP_LOCAL_MODEL_ID : (modelId || DESKTOP_LOCAL_MODEL_ID);
}

export function getDesktopLocalModelLabel(modelId?: string | null): string {
  switch (modelId) {
    case 'gemma-4-e4b':
    case 'gemma-4-4b':
      return 'Gemma 4 E4B (Local)';
    case 'gemma-4-26b-a4b':
      return 'Gemma 4 26B-A4B (Local)';
    case 'gemma-4-31b':
      return 'Gemma 4 31B (Local)';
    case 'gemma-4-e2b':
    case 'gemma-4-2b':
    case 'gemma-nano-2b':
    case 'gemma-nano-2b-local':
    default:
      return DESKTOP_LOCAL_MODEL_LABEL;
  }
}

function getStoredPath(key: string): string | null {
  try {
    const value = localStorage.getItem(key)?.trim();
    return value || null;
  } catch {
    return null;
  }
}

async function resolveModelDirectories(): Promise<string[]> {
  const storedDir = getStoredPath(MODELS_DIR_STORAGE_KEY);
  const appData = await appDataDir();

  const candidates = [
    storedDir,
    await join(appData, 'models'),
    await join(appData, 'llm', 'models'),
    await join(appData, 'Agentrix Desktop', 'models'),
  ].filter((value): value is string => Boolean(value));

  return [...new Set(candidates)];
}

export async function resolveDesktopLocalModelPath(): Promise<string | null> {
  const storedPath = getStoredPath(MODEL_PATH_STORAGE_KEY);
  if (storedPath) {
    return storedPath;
  }

  const directories = await resolveModelDirectories();
  for (const directory of directories) {
    const manager = new LocalModelManager(directory);
    const modelPath = await manager.getDefaultModelPath();
    if (modelPath) {
      return modelPath;
    }
  }

  return null;
}

export interface LocalModelReadiness {
  ready: boolean;
  hasModel: boolean;
  hasBinary: boolean;
  modelPath: string | null;
  message?: string;
}

export async function checkDesktopLocalModelReady(): Promise<LocalModelReadiness> {
  const modelPath = await resolveDesktopLocalModelPath();
  const hasModel = !!modelPath;

  if (!hasModel) {
    return {
      ready: false,
      hasModel: false,
      hasBinary: false,
      modelPath: null,
      message: '未找到本地 GGUF 模型。请在设置 → 本地模型中下载。',
    };
  }

  // Check if llama-server binary is actually available
  let hasBinary = false;
  try {
    const status = await invoke<{ available: boolean; path: string | null; message: string | null }>(
      'desktop_bridge_check_llama_server'
    );
    hasBinary = status.available;
  } catch {
    hasBinary = false;
  }

  if (!hasBinary) {
    return {
      ready: false,
      hasModel: true,
      hasBinary: false,
      modelPath,
      message: '未找到推理引擎 llama-server。请在设置 → 本地模型中下载安装。',
    };
  }

  return { ready: true, hasModel: true, hasBinary: true, modelPath };
}

export async function ensureDesktopLocalSidecar(sidecar: LocalLLMSidecar): Promise<string> {
  const modelPath = await resolveDesktopLocalModelPath();
  if (!modelPath) {
    throw new Error('No local GGUF model was found. Place a Gemma Nano GGUF under the app data models directory or set agentrix_local_model_path.');
  }

  if (!sidecar.isRunning) {
    await sidecar.start({
      modelPath,
      contextSize: 4096,
      nGpuLayers: 0,
    });
  }

  return modelPath;
}

export async function* streamDesktopLocalChat(
  sidecar: LocalLLMSidecar,
  messages: ChatMessage[],
): AsyncGenerator<string> {
  await ensureDesktopLocalSidecar(sidecar);
  for await (const chunk of sidecar.chatStream(messages)) {
    if (chunk) {
      yield chunk;
    }
  }
}