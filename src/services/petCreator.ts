import * as FileSystem from 'expo-file-system';
import { API_BASE } from '../config/env';
import { apiFetch, getApiConfig } from './api';

export type PetMode = 'scan';
export type PetProvider = 'meshy' | 'hunyuan3d';
export type PetStyle =
  | 'anime'
  | 'realistic'
  | 'chibi'
  | 'sculpture'
  | 'pbr'
  | 'cartoon';

export interface UploadedPetImage {
  url: string;
  publicUrl: string;
  localUri: string;
  fileName: string;
  originalName: string;
  mimetype: string;
  size: number;
}

export interface PetTaskSummary {
  taskId: string;
  status: string;
  provider: string;
  mode: string;
  style?: string | null;
  title?: string | null;
  prompt?: string | null;
  outputUrl?: string | null;
  vrmUrl?: string | null;
  thumbnailUrl?: string | null;
  referenceImageUrl?: string | null;
  error?: string | null;
  createdAt?: string;
  completedAt?: string | null;
}

export interface PetSubmitInput {
  mode: PetMode;
  prompt?: string;
  provider?: PetProvider;
  style?: PetStyle;
  scanImageUrls: string[];
  enableAnimation?: boolean;
  targetPolycount?: number;
  sessionId?: string;
  deviceId?: string;
}

function buildPublicUrl(path: string): string {
  const publicBase = (getApiConfig().baseUrl || API_BASE).replace(/\/api\/?$/, '');
  return path.startsWith('http') ? path : `${publicBase}${path}`;
}

async function normalizeUploadPayload(file: {
  uri: string;
  name: string;
  type: string;
}) {
  const uri = file.uri || '';
  if (!uri.startsWith('content://') && !uri.startsWith('ph://')) {
    return file;
  }

  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return {
      uri: `data:${file.type || 'image/jpeg'};base64,${base64}`,
      name: file.name,
      type: file.type,
    };
  } catch (error: any) {
    console.warn(`[petCreator] failed to normalize image payload: ${error?.message || error}`);
    return file;
  }
}

export async function uploadPetScanImage(file: {
  uri: string;
  name: string;
  type: string;
}): Promise<UploadedPetImage> {
  const payload = await normalizeUploadPayload(file);
  const formData = new FormData();
  formData.append('file', payload as any);

  const uploaded = await apiFetch<Omit<UploadedPetImage, 'publicUrl' | 'localUri'>>('/upload/image', {
    method: 'POST',
    body: formData,
  });

  return {
    ...uploaded,
    publicUrl: buildPublicUrl(uploaded.url),
    localUri: file.uri,
  };
}

export async function submitPetTask(input: PetSubmitInput): Promise<any> {
  return apiFetch('/pet-generation/submit', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getPetTask(taskId: string): Promise<any> {
  return apiFetch(`/pet-generation/tasks/${encodeURIComponent(taskId)}`);
}

export async function listPetTasks(limit = 12): Promise<PetTaskSummary[]> {
  const data = await apiFetch<{ tasks?: PetTaskSummary[] }>(`/pet-generation/tasks?limit=${limit}`);
  return Array.isArray(data?.tasks) ? data.tasks : [];
}