/**
 * Creator Agent — Headless execution of creative tasks dispatched from
 * mobile/web via DesktopSync commands.
 *
 * Listens for `agentrix:creator-task` events (dispatched by desktopAgentSync
 * when a creator-type command arrives) and executes them without requiring
 * the user to manually open any UI panel.
 *
 * Supported task types:
 *   - generate_poster: Creates a poster PNG from params
 *   - generate_ppt: Creates a .pptx from params
 *   - generate_pet_variants: Generates multi-form variants for a pet
 *
 * Results are uploaded to the backend and pushed back to the requesting device.
 *
 * @see .kiro/specs/creator-studio-mvp/design.md
 */
import {
  generatePoster,
  POSTER_TEMPLATES,
  POSTER_SIZES,
  type PosterContent,
} from "./posterGenerator";
import { generatePPT, downloadPPT, type SlideContent, type PPTGenerateOptions } from "./pptGenerator";
import { submitPetTask, type PetSubmitInput } from "./petCreator";
import { API_BASE, useAuthStore } from "./store";
import { DEFAULT_VARIANT_PROMPT_MODIFIERS, PET_VARIANT_MODE_LABELS, type PetVariantMode } from "../../../shared/types/pet-skin-variant";

// ============================================================
// Types
// ============================================================

export type CreatorTaskType = 'generate_poster' | 'generate_ppt' | 'generate_pet_variants';

export interface CreatorTaskPayload {
  type: CreatorTaskType;
  taskId: string;
  sessionId?: string;
  params: Record<string, unknown>;
}

export interface CreatorTaskResult {
  taskId: string;
  type: CreatorTaskType;
  success: boolean;
  resultUrl?: string;
  localPath?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================
// Task Handlers
// ============================================================

async function handleGeneratePoster(params: Record<string, unknown>): Promise<CreatorTaskResult & { blob?: Blob }> {
  const title = String(params.title || 'Agentrix');
  const subtitle = String(params.subtitle || '');
  const bullets = Array.isArray(params.bullets) ? params.bullets.map(String) : [];
  const cta = String(params.cta || '');
  const templateId = String(params.template || 'pitch-dark');
  const sizeLabel = String(params.size || 'phone');

  const template = POSTER_TEMPLATES.find(t => t.id === templateId) || POSTER_TEMPLATES[0];
  const size = POSTER_SIZES.find(s => s.label.includes(sizeLabel)) || POSTER_SIZES[0];

  const content: PosterContent = {
    title,
    subtitle,
    bullets,
    cta,
    colors: {
      primary: String(params.primaryColor || '#6C5CE7'),
      secondary: '#22D3EE',
      bg: template.defaultBg,
      text: '#FFFFFF',
      textSecondary: '#9CA3AF',
    },
  };

  const blob = await generatePoster(template, content, size);

  return {
    taskId: '',
    type: 'generate_poster',
    success: true,
    blob,
    metadata: { template: templateId, size: `${size.width}x${size.height}` },
  };
}

async function handleGeneratePPT(params: Record<string, unknown>): Promise<CreatorTaskResult & { buffer?: ArrayBuffer }> {
  const topic = String(params.topic || params.title || 'Presentation');
  const pageCount = Number(params.pages || params.pageCount || 8);
  const style = String(params.style || 'pitch');

  // Generate slide content using structured params or defaults
  let slides: SlideContent[] = [];

  if (Array.isArray(params.slides)) {
    // Direct slide content provided
    slides = (params.slides as any[]).map(s => ({
      title: String(s.title || ''),
      subtitle: s.subtitle ? String(s.subtitle) : undefined,
      bullets: Array.isArray(s.bullets) ? s.bullets.map(String) : undefined,
      layout: (s.layout as SlideContent['layout']) || 'content',
    }));
  } else {
    // Generate default structure based on topic
    slides = [
      { title: topic, subtitle: String(params.subtitle || ''), layout: 'title' },
      ...Array.from({ length: Math.min(pageCount - 2, 8) }, (_, i) => ({
        title: `第 ${i + 2} 页`,
        bullets: [`要点 ${i * 3 + 1}`, `要点 ${i * 3 + 2}`, `要点 ${i * 3 + 3}`],
        layout: 'content' as const,
      })),
      { title: '谢谢', subtitle: 'Q&A', layout: 'title' as const },
    ];
  }

  const options: PPTGenerateOptions = {
    slides,
    title: topic,
    author: 'Agentrix Creator Studio',
  };

  const buffer = await generatePPT(options);

  return {
    taskId: '',
    type: 'generate_ppt',
    success: true,
    buffer,
    metadata: { topic, pages: slides.length },
  };
}

async function handleGeneratePetVariants(params: Record<string, unknown>): Promise<CreatorTaskResult> {
  const basePrompt = String(params.prompt || params.basePrompt || '');
  const provider = String(params.provider || 'meshy') as 'meshy' | 'hunyuan3d';
  const style = String(params.style || 'chibi');
  const modes: PetVariantMode[] = Array.isArray(params.modes)
    ? params.modes as PetVariantMode[]
    : ['living', 'pro', 'economy'];

  if (!basePrompt) {
    return { taskId: '', type: 'generate_pet_variants', success: false, error: 'Missing base prompt' };
  }

  const taskIds: string[] = [];

  for (const mode of modes) {
    const modifier = DEFAULT_VARIANT_PROMPT_MODIFIERS[mode];
    const variantPrompt = `${basePrompt}. Form variant: ${PET_VARIANT_MODE_LABELS[mode].en}. Style: ${modifier}`;

    try {
      const result = await submitPetTask({
        mode: 'text',
        provider,
        style: style as any,
        prompt: variantPrompt,
        enableAnimation: true,
      });
      const tid = result?.taskId || result?.task?.taskId;
      if (tid) taskIds.push(tid);
    } catch (err: any) {
      console.warn(`[CreatorAgent] variant ${mode} failed:`, err?.message);
    }
  }

  return {
    taskId: '',
    type: 'generate_pet_variants',
    success: taskIds.length > 0,
    metadata: { taskIds, modes, basePrompt },
  };
}

// ============================================================
// Upload helper
// ============================================================

async function uploadCreatorResult(
  blob: Blob | ArrayBuffer,
  filename: string,
  mimeType: string,
): Promise<string | null> {
  try {
    const token = useAuthStore.getState().token;
    if (!token) return null;

    const formData = new FormData();
    const file = blob instanceof Blob ? blob : new Blob([blob], { type: mimeType });
    formData.append('file', file, filename);

    const res = await fetch(`${API_BASE}/v1/creator/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      return data.url || data.fileUrl || null;
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================
// Main dispatcher
// ============================================================

async function executeCreatorTask(payload: CreatorTaskPayload): Promise<CreatorTaskResult> {
  const { type, taskId, params } = payload;

  try {
    switch (type) {
      case 'generate_poster': {
        const result = await handleGeneratePoster(params);
        result.taskId = taskId;

        // Try to upload
        if (result.blob) {
          const url = await uploadCreatorResult(
            result.blob,
            `poster-${Date.now()}.png`,
            'image/png',
          );
          if (url) result.resultUrl = url;

          // Also trigger local download as fallback
          const localUrl = URL.createObjectURL(result.blob);
          const a = document.createElement('a');
          a.href = localUrl;
          a.download = `agentrix-poster-${Date.now()}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(localUrl);
        }
        return result;
      }

      case 'generate_ppt': {
        const result = await handleGeneratePPT(params);
        result.taskId = taskId;

        if (result.buffer) {
          const url = await uploadCreatorResult(
            result.buffer,
            `presentation-${Date.now()}.pptx`,
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          );
          if (url) result.resultUrl = url;

          // Local download
          downloadPPT(result.buffer, `agentrix-${Date.now()}.pptx`);
        }
        return result;
      }

      case 'generate_pet_variants': {
        const result = await handleGeneratePetVariants(params);
        result.taskId = taskId;
        return result;
      }

      default:
        return { taskId, type, success: false, error: `Unknown creator task type: ${type}` };
    }
  } catch (err: any) {
    return { taskId, type, success: false, error: err?.message || 'Execution failed' };
  }
}

// ============================================================
// Event listener — receives tasks from DesktopAgentSync
// ============================================================

function reportTaskResult(result: CreatorTaskResult): void {
  // Dispatch result event for DesktopAgentSync to pick up and report back
  window.dispatchEvent(new CustomEvent('agentrix:creator-task-result', { detail: result }));

  // Also show a desktop notification
  if (result.success) {
    window.dispatchEvent(new CustomEvent('agentrix:toast', {
      detail: {
        type: 'success',
        title: `✅ ${result.type} 完成`,
        body: result.resultUrl ? '文件已生成并上传' : '文件已生成（本地保存）',
      },
    }));
  }
}

/**
 * Boot the Creator Agent. Listens for `agentrix:creator-task` events
 * dispatched by the DesktopSync command handler.
 */
let _booted = false;

export function bootCreatorAgent(): void {
  if (_booted) return;
  _booted = true;

  window.addEventListener('agentrix:creator-task', async (e: Event) => {
    const payload = (e as CustomEvent).detail as CreatorTaskPayload | undefined;
    if (!payload || !payload.type) return;

    console.log(`[CreatorAgent] Received task: ${payload.type} (${payload.taskId})`);
    const result = await executeCreatorTask(payload);
    reportTaskResult(result);
  });

  console.log('[CreatorAgent] Booted — listening for creator tasks');
}

// Auto-boot when imported
bootCreatorAgent();

// Export for direct invocation (e.g., from Agent chat tool calls)
export { executeCreatorTask };
