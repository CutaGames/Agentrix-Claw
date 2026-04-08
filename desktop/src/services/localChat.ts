import { appDataDir, join } from '@tauri-apps/api/path';
import { LocalLLMSidecar, LocalModelManager, type ChatMessage } from './localLLM';

export const DESKTOP_LOCAL_MODEL_ID = 'gemma-nano-2b-local';
export const DESKTOP_LOCAL_MODEL_LABEL = 'Gemma Nano 2B (Local)';
export const DESKTOP_LOCAL_MODEL_ALIASES = new Set([
  DESKTOP_LOCAL_MODEL_ID,
  'gemma-nano-2b',
  'gemma-4-2b',
  'gemma-4-4b',
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
    case 'gemma-4-4b':
      return 'Gemma 4 4B (Local)';
    case 'gemma-4-2b':
      return 'Gemma 4 2B (Local)';
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