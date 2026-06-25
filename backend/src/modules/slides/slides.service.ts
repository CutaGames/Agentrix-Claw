import { Injectable, Logger } from '@nestjs/common';

/**
 * AI Slides Generator (P0-#3)
 *
 * Deterministic, dependency-free Marp Markdown synthesizer. Produces a Marp deck
 * from a structured outline (title + sections). Designed so an upstream LLM can
 * call this tool with a generated outline and immediately get a renderable deck.
 *
 * Marp ref: https://marp.app/  — the produced markdown is valid Marp source.
 */

export type SlidesTheme = 'default' | 'gaia' | 'uncover';

export interface SlidesSection {
  heading: string;
  bullets?: string[];
  body?: string;
  notes?: string;
}

export interface GenerateSlidesInput {
  title: string;
  subtitle?: string;
  author?: string;
  sections: SlidesSection[];
  theme?: SlidesTheme;
  paginate?: boolean;
}

export interface GenerateSlidesResult {
  markdown: string;
  slideCount: number;
  theme: SlidesTheme;
  title: string;
  /** Optional rendered preview HTML (minimal, no Marp dependency). */
  previewHtml: string;
}

@Injectable()
export class SlidesService {
  private readonly logger = new Logger(SlidesService.name);

  generate(input: GenerateSlidesInput): GenerateSlidesResult {
    const theme: SlidesTheme = input.theme ?? 'default';
    const paginate = input.paginate ?? true;

    if (!input.title?.trim()) throw new Error('title is required');
    if (!Array.isArray(input.sections) || input.sections.length === 0) {
      throw new Error('at least one section is required');
    }

    const frontMatter = [
      '---',
      'marp: true',
      `theme: ${theme}`,
      `paginate: ${paginate ? 'true' : 'false'}`,
      '---',
    ].join('\n');

    const titleSlide = [
      `# ${input.title.trim()}`,
      input.subtitle ? `\n## ${input.subtitle.trim()}` : '',
      input.author ? `\n_by ${input.author.trim()}_` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const bodySlides = input.sections.map((s) => this.renderSection(s));

    const closingSlide = ['## Thank You', '', input.author ? `— ${input.author.trim()}` : ''].join('\n');

    const markdown = [frontMatter, titleSlide, ...bodySlides, closingSlide].join('\n\n---\n\n');
    const slideCount = 2 + bodySlides.length;

    const previewHtml = this.renderPreviewHtml(input, slideCount, theme);

    this.logger.log(`generated deck: title="${input.title}" slides=${slideCount} theme=${theme}`);

    return { markdown, slideCount, theme, title: input.title, previewHtml };
  }

  private renderSection(s: SlidesSection): string {
    if (!s.heading?.trim()) throw new Error('section heading is required');
    const out: string[] = [`## ${s.heading.trim()}`];
    if (s.body?.trim()) {
      out.push('', s.body.trim());
    }
    if (s.bullets && s.bullets.length > 0) {
      out.push('');
      for (const b of s.bullets) {
        if (typeof b === 'string' && b.trim()) {
          out.push(`- ${b.trim()}`);
        }
      }
    }
    if (s.notes?.trim()) {
      out.push('', `<!-- ${this.escapeHtmlComment(s.notes.trim())} -->`);
    }
    return out.join('\n');
  }

  private escapeHtmlComment(text: string): string {
    return text.replace(/--/g, '–');
  }

  /**
   * Minimal standalone HTML preview — one card per slide. Not Marp-compiled
   * (avoids adding a heavy Chromium/marp-cli dependency on the server) but
   * sufficient for a first-glance preview on web/desktop.
   */
  private renderPreviewHtml(input: GenerateSlidesInput, slideCount: number, theme: SlidesTheme): string {
    const escape = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const slides: string[] = [];
    slides.push(
      `<section class="slide title"><h1>${escape(input.title)}</h1>${
        input.subtitle ? `<h2>${escape(input.subtitle)}</h2>` : ''
      }${input.author ? `<p class="author">by ${escape(input.author)}</p>` : ''}</section>`,
    );
    for (const s of input.sections) {
      const bullets = (s.bullets ?? [])
        .filter((b) => b && b.trim())
        .map((b) => `<li>${escape(b)}</li>`)
        .join('');
      slides.push(
        `<section class="slide"><h2>${escape(s.heading)}</h2>${
          s.body ? `<p>${escape(s.body)}</p>` : ''
        }${bullets ? `<ul>${bullets}</ul>` : ''}</section>`,
      );
    }
    slides.push(`<section class="slide closing"><h2>Thank You</h2></section>`);

    return [
      `<!doctype html><html><head><meta charset="utf-8"><title>${escape(input.title)}</title>`,
      `<style>body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#0f172a;color:#e2e8f0}`,
      `.deck{max-width:960px;margin:0 auto;display:flex;flex-direction:column;gap:16px}`,
      `.slide{background:#1e293b;border-radius:12px;padding:32px;min-height:240px;border:1px solid #334155}`,
      `.title{background:linear-gradient(135deg,#1e40af,#7c3aed);text-align:center;padding:48px}`,
      `.title h1{font-size:36px;margin:0 0 12px}.title h2{font-size:20px;color:#cbd5e1;font-weight:400;margin:0}`,
      `.author{margin-top:16px;opacity:.8}`,
      `h2{margin:0 0 16px;color:#f1f5f9}ul{padding-left:20px;line-height:1.7}p{line-height:1.6}`,
      `.closing{text-align:center;background:#0f172a}`,
      `.meta{opacity:.6;font-size:12px;text-align:center;padding:8px}`,
      `</style></head><body><div class="deck">`,
      slides.join(''),
      `<div class="meta">${slideCount} slides · theme: ${theme}</div>`,
      `</div></body></html>`,
    ].join('');
  }
}
