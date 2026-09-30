/**
 * PPT Generator — Creates .pptx files using pptxgenjs.
 *
 * Generates presentation slides from structured content (title, bullets,
 * images) with Agentrix brand theming.
 *
 * @see .kiro/specs/creator-studio-mvp/design.md §Module 4
 */
import PptxGenJS from 'pptxgenjs';

// ============================================================
// Types
// ============================================================

export type SlideLayout = 'title' | 'content' | 'two-column' | 'image-full' | 'section';

export interface SlideContent {
  title: string;
  subtitle?: string;
  bullets?: string[];
  image?: string; // base64 data URL
  imageCaption?: string;
  layout: SlideLayout;
  notes?: string;
}

export interface PPTTheme {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  bgColor: string;
  textColor: string;
  textSecondaryColor: string;
  fontFamily: string;
  logoBase64?: string;
}

export interface PPTGenerateOptions {
  slides: SlideContent[];
  theme?: Partial<PPTTheme>;
  title?: string;
  author?: string;
  subject?: string;
}

// ============================================================
// Default Theme
// ============================================================

const DEFAULT_THEME: PPTTheme = {
  name: 'Agentrix Dark',
  primaryColor: '6C5CE7',
  secondaryColor: '22D3EE',
  bgColor: '0B1220',
  textColor: 'FFFFFF',
  textSecondaryColor: '9CA3AF',
  fontFamily: 'Inter',
};

// ============================================================
// Generator
// ============================================================

/**
 * Generate a .pptx file as ArrayBuffer.
 */
export async function generatePPT(options: PPTGenerateOptions): Promise<ArrayBuffer> {
  const theme: PPTTheme = { ...DEFAULT_THEME, ...options.theme };
  const pptx = new PptxGenJS();

  // Metadata
  pptx.author = options.author || 'Agentrix';
  pptx.subject = options.subject || options.title || 'Presentation';
  pptx.title = options.title || 'Agentrix Presentation';

  // Layout
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDE';

  // Generate slides
  for (const slideContent of options.slides) {
    const slide = pptx.addSlide();

    // Background
    slide.background = { color: theme.bgColor };

    switch (slideContent.layout) {
      case 'title':
        renderTitleSlide(slide, slideContent, theme);
        break;
      case 'section':
        renderSectionSlide(slide, slideContent, theme);
        break;
      case 'content':
        renderContentSlide(slide, slideContent, theme);
        break;
      case 'two-column':
        renderTwoColumnSlide(slide, slideContent, theme);
        break;
      case 'image-full':
        renderImageFullSlide(slide, slideContent, theme);
        break;
      default:
        renderContentSlide(slide, slideContent, theme);
    }

    // Notes
    if (slideContent.notes) {
      slide.addNotes(slideContent.notes);
    }
  }

  // Export
  const output = await pptx.write({ outputType: 'arraybuffer' });
  return output as ArrayBuffer;
}

/**
 * Save generated PPT to a file (triggers download in browser).
 */
export function downloadPPT(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.pptx') ? filename : `${filename}.pptx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================
// Slide Renderers
// ============================================================

function renderTitleSlide(
  slide: PptxGenJS.Slide,
  content: SlideContent,
  theme: PPTTheme,
): void {
  // Title
  slide.addText(content.title, {
    x: 1, y: 2.5, w: 11.33, h: 1.5,
    fontSize: 44, bold: true, color: theme.textColor,
    fontFace: theme.fontFamily, align: 'center', valign: 'middle',
  });

  // Subtitle
  if (content.subtitle) {
    slide.addText(content.subtitle, {
      x: 2, y: 4.2, w: 9.33, h: 1,
      fontSize: 20, color: theme.textSecondaryColor,
      fontFace: theme.fontFamily, align: 'center', valign: 'top',
    });
  }

  // Accent line
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 5.5, y: 4, w: 2.33, h: 0.05,
    fill: { color: theme.primaryColor },
  });
}

function renderSectionSlide(
  slide: PptxGenJS.Slide,
  content: SlideContent,
  theme: PPTTheme,
): void {
  slide.addText(content.title, {
    x: 1, y: 3, w: 11.33, h: 1.5,
    fontSize: 36, bold: true, color: theme.secondaryColor,
    fontFace: theme.fontFamily, align: 'center', valign: 'middle',
  });
}

function renderContentSlide(
  slide: PptxGenJS.Slide,
  content: SlideContent,
  theme: PPTTheme,
): void {
  // Title
  slide.addText(content.title, {
    x: 0.8, y: 0.4, w: 11.73, h: 0.8,
    fontSize: 28, bold: true, color: theme.textColor,
    fontFace: theme.fontFamily, align: 'left', valign: 'bottom',
  });

  // Underline
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0.8, y: 1.25, w: 3, h: 0.04,
    fill: { color: theme.primaryColor },
  });

  // Bullets
  if (content.bullets && content.bullets.length > 0) {
    const bulletText = content.bullets.map((b) => ({
      text: b,
      options: {
        fontSize: 18,
        color: theme.textSecondaryColor,
        fontFace: theme.fontFamily,
        bullet: { type: 'bullet' as const },
        paraSpaceAfter: 8,
      },
    }));

    slide.addText(bulletText, {
      x: 0.8, y: 1.6, w: content.image ? 6 : 11.73, h: 5.2,
      valign: 'top',
    });
  }

  // Image (right side)
  if (content.image) {
    slide.addImage({
      data: content.image,
      x: 7.5, y: 1.5, w: 5, h: 5,
      rounding: true,
    });
  }
}

function renderTwoColumnSlide(
  slide: PptxGenJS.Slide,
  content: SlideContent,
  theme: PPTTheme,
): void {
  // Title
  slide.addText(content.title, {
    x: 0.8, y: 0.4, w: 11.73, h: 0.8,
    fontSize: 28, bold: true, color: theme.textColor,
    fontFace: theme.fontFamily, align: 'left', valign: 'bottom',
  });

  // Split bullets into two columns
  const bullets = content.bullets || [];
  const mid = Math.ceil(bullets.length / 2);
  const leftBullets = bullets.slice(0, mid);
  const rightBullets = bullets.slice(mid);

  if (leftBullets.length > 0) {
    slide.addText(
      leftBullets.map((b) => ({
        text: b,
        options: { fontSize: 16, color: theme.textSecondaryColor, fontFace: theme.fontFamily, bullet: { type: 'bullet' as const }, paraSpaceAfter: 6 },
      })),
      { x: 0.8, y: 1.6, w: 5.8, h: 5.2, valign: 'top' },
    );
  }

  if (rightBullets.length > 0) {
    slide.addText(
      rightBullets.map((b) => ({
        text: b,
        options: { fontSize: 16, color: theme.textSecondaryColor, fontFace: theme.fontFamily, bullet: { type: 'bullet' as const }, paraSpaceAfter: 6 },
      })),
      { x: 7, y: 1.6, w: 5.8, h: 5.2, valign: 'top' },
    );
  }
}

function renderImageFullSlide(
  slide: PptxGenJS.Slide,
  content: SlideContent,
  theme: PPTTheme,
): void {
  if (content.image) {
    slide.addImage({
      data: content.image,
      x: 0.5, y: 0.5, w: 12.33, h: 6.5,
    });
  }

  // Overlay title at bottom
  if (content.title) {
    slide.addText(content.title, {
      x: 0.8, y: 5.8, w: 11.73, h: 1,
      fontSize: 24, bold: true, color: theme.textColor,
      fontFace: theme.fontFamily, align: 'left', valign: 'bottom',
    });
  }
}

// pptxgenjs shapes reference (needed for addShape)
const pptx = { shapes: { RECTANGLE: 'rect' as any } };
