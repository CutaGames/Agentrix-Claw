/**
 * Poster Generator — Canvas-based poster creation engine.
 *
 * Renders text + images + shapes onto an OffscreenCanvas/Canvas,
 * exports as PNG blob. Used by PosterWorkshop component.
 *
 * @see .kiro/specs/creator-studio-mvp/design.md §Module 3
 */

// ============================================================
// Types
// ============================================================

export type PosterCategory = 'pitch' | 'social' | 'product' | 'holiday' | 'minimal';

export interface PosterTemplate {
  id: string;
  name: string;
  nameZh: string;
  category: PosterCategory;
  /** Aspect ratio description */
  aspect: '9:16' | '1:1' | '4:3' | '16:9';
  /** Default background gradient */
  defaultBg: string[];
  /** Layout regions */
  layout: PosterLayout;
}

export interface PosterLayout {
  title: { x: number; y: number; maxWidth: number; fontSize: number; align: CanvasTextAlign };
  subtitle?: { x: number; y: number; maxWidth: number; fontSize: number; align: CanvasTextAlign };
  body?: { x: number; y: number; maxWidth: number; fontSize: number; lineHeight: number };
  cta?: { x: number; y: number; width: number; height: number; fontSize: number };
  image?: { x: number; y: number; width: number; height: number };
  logo?: { x: number; y: number; size: number };
}

export interface PosterContent {
  title: string;
  subtitle?: string;
  bullets?: string[];
  cta?: string;
  petScreenshot?: string; // base64 data URL
  logoUrl?: string;
  colors: {
    primary: string;
    secondary: string;
    bg: string[];
    text: string;
    textSecondary: string;
  };
}

export interface PosterSize {
  width: number;
  height: number;
  label: string;
}

// ============================================================
// Preset Templates
// ============================================================

export const POSTER_SIZES: PosterSize[] = [
  { width: 1080, height: 1920, label: '手机壁纸 (1080×1920)' },
  { width: 1080, height: 1080, label: '社交方图 (1080×1080)' },
  { width: 1920, height: 1080, label: '横屏 (1920×1080)' },
  { width: 2480, height: 3508, label: 'A4 打印 (2480×3508)' },
];

export const POSTER_TEMPLATES: PosterTemplate[] = [
  {
    id: 'pitch-dark',
    name: 'Pitch Dark',
    nameZh: '路演深色',
    category: 'pitch',
    aspect: '9:16',
    defaultBg: ['#0B1220', '#1a1a3e'],
    layout: {
      title: { x: 0.5, y: 0.15, maxWidth: 0.8, fontSize: 0.06, align: 'center' },
      subtitle: { x: 0.5, y: 0.22, maxWidth: 0.7, fontSize: 0.03, align: 'center' },
      image: { x: 0.15, y: 0.28, width: 0.7, height: 0.35 },
      body: { x: 0.1, y: 0.68, maxWidth: 0.8, fontSize: 0.025, lineHeight: 1.6 },
      cta: { x: 0.2, y: 0.88, width: 0.6, height: 0.06, fontSize: 0.03 },
      logo: { x: 0.5, y: 0.96, size: 0.04 },
    },
  },
  {
    id: 'social-gradient',
    name: 'Social Gradient',
    nameZh: '社交渐变',
    category: 'social',
    aspect: '1:1',
    defaultBg: ['#6C5CE7', '#a29bfe'],
    layout: {
      title: { x: 0.5, y: 0.12, maxWidth: 0.85, fontSize: 0.07, align: 'center' },
      image: { x: 0.2, y: 0.2, width: 0.6, height: 0.5 },
      subtitle: { x: 0.5, y: 0.78, maxWidth: 0.8, fontSize: 0.035, align: 'center' },
      cta: { x: 0.25, y: 0.87, width: 0.5, height: 0.07, fontSize: 0.035 },
    },
  },
  {
    id: 'product-clean',
    name: 'Product Clean',
    nameZh: '产品简洁',
    category: 'product',
    aspect: '16:9',
    defaultBg: ['#ffffff', '#f0f0f5'],
    layout: {
      title: { x: 0.05, y: 0.15, maxWidth: 0.45, fontSize: 0.06, align: 'left' },
      body: { x: 0.05, y: 0.35, maxWidth: 0.4, fontSize: 0.025, lineHeight: 1.8 },
      image: { x: 0.52, y: 0.1, width: 0.44, height: 0.8 },
      cta: { x: 0.05, y: 0.8, width: 0.35, height: 0.08, fontSize: 0.03 },
    },
  },
  {
    id: 'holiday-festive',
    name: 'Holiday Festive',
    nameZh: '节日庆祝',
    category: 'holiday',
    aspect: '9:16',
    defaultBg: ['#1a0a2e', '#4a1942'],
    layout: {
      title: { x: 0.5, y: 0.08, maxWidth: 0.9, fontSize: 0.065, align: 'center' },
      image: { x: 0.1, y: 0.15, width: 0.8, height: 0.5 },
      subtitle: { x: 0.5, y: 0.7, maxWidth: 0.8, fontSize: 0.035, align: 'center' },
      body: { x: 0.1, y: 0.78, maxWidth: 0.8, fontSize: 0.022, lineHeight: 1.5 },
      cta: { x: 0.2, y: 0.9, width: 0.6, height: 0.06, fontSize: 0.03 },
    },
  },
  {
    id: 'minimal-mono',
    name: 'Minimal Mono',
    nameZh: '极简单色',
    category: 'minimal',
    aspect: '1:1',
    defaultBg: ['#111111', '#111111'],
    layout: {
      title: { x: 0.5, y: 0.4, maxWidth: 0.8, fontSize: 0.08, align: 'center' },
      subtitle: { x: 0.5, y: 0.55, maxWidth: 0.7, fontSize: 0.03, align: 'center' },
      logo: { x: 0.5, y: 0.9, size: 0.05 },
    },
  },
];

// ============================================================
// Generator
// ============================================================

/**
 * Generate a poster as a PNG Blob.
 */
export async function generatePoster(
  template: PosterTemplate,
  content: PosterContent,
  size: PosterSize,
): Promise<Blob> {
  const { width, height } = size;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Background gradient
  const bgColors = content.colors.bg.length > 0 ? content.colors.bg : template.defaultBg;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  bgColors.forEach((color, i) => {
    gradient.addColorStop(i / Math.max(1, bgColors.length - 1), color);
  });
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Pet screenshot / image
  if (content.petScreenshot && template.layout.image) {
    try {
      const img = await loadImage(content.petScreenshot);
      const { x, y, width: w, height: h } = resolveRegion(template.layout.image, width, height);
      ctx.drawImage(img, x, y, w, h);
    } catch {
      // Image load failed — skip silently
    }
  }

  // Title
  if (content.title && template.layout.title) {
    const l = template.layout.title;
    const fontSize = l.fontSize * height;
    ctx.font = `bold ${fontSize}px "Inter", "Noto Sans SC", sans-serif`;
    ctx.fillStyle = content.colors.text;
    ctx.textAlign = l.align;
    ctx.textBaseline = 'top';
    const x = l.x * width;
    const y = l.y * height;
    const maxW = l.maxWidth * width;
    wrapText(ctx, content.title, x, y, maxW, fontSize * 1.2);
  }

  // Subtitle
  if (content.subtitle && template.layout.subtitle) {
    const l = template.layout.subtitle;
    const fontSize = l.fontSize * height;
    ctx.font = `${fontSize}px "Inter", "Noto Sans SC", sans-serif`;
    ctx.fillStyle = content.colors.textSecondary;
    ctx.textAlign = l.align;
    ctx.textBaseline = 'top';
    const x = l.x * width;
    const y = l.y * height;
    const maxW = l.maxWidth * width;
    wrapText(ctx, content.subtitle, x, y, maxW, fontSize * 1.4);
  }

  // Body / bullets
  if (content.bullets && content.bullets.length > 0 && template.layout.body) {
    const l = template.layout.body;
    const fontSize = l.fontSize * height;
    ctx.font = `${fontSize}px "Inter", "Noto Sans SC", sans-serif`;
    ctx.fillStyle = content.colors.textSecondary;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const x = l.x * width;
    let y = l.y * height;
    const maxW = l.maxWidth * width;
    for (const bullet of content.bullets) {
      wrapText(ctx, `• ${bullet}`, x, y, maxW, fontSize * l.lineHeight);
      y += fontSize * l.lineHeight * Math.ceil(ctx.measureText(`• ${bullet}`).width / maxW + 0.5);
    }
  }

  // CTA button
  if (content.cta && template.layout.cta) {
    const l = template.layout.cta;
    const bx = l.x * width;
    const by = l.y * height;
    const bw = l.width * width;
    const bh = l.height * height;
    const fontSize = l.fontSize * height;

    // Button background
    ctx.fillStyle = content.colors.primary;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, bh * 0.3);
    ctx.fill();

    // Button text
    ctx.font = `bold ${fontSize}px "Inter", "Noto Sans SC", sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(content.cta, bx + bw / 2, by + bh / 2, bw * 0.9);
  }

  // Export
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      },
      'image/png',
      1.0,
    );
  });
}

// ============================================================
// Helpers
// ============================================================

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function resolveRegion(
  region: { x: number; y: number; width: number; height: number },
  canvasW: number,
  canvasH: number,
) {
  return {
    x: region.x * canvasW,
    y: region.y * canvasH,
    width: region.width * canvasW,
    height: region.height * canvasH,
  };
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split('');
  let line = '';
  let currentY = y;

  for (const char of words) {
    const testLine = line + char;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line.length > 0) {
      ctx.fillText(line, x, currentY);
      line = char;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, currentY);
  }
}
