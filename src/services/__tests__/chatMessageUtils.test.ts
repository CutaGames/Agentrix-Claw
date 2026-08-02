/**
 * Unit tests for chatMessage.utils.ts (A5 minimal extraction).
 *
 * These guard the pure-string helpers that drive message bubble rendering.
 * Failures here would visibly break AgentChatScreen — e.g. images not
 * recognized, markdown showing raw asterisks, URLs not stripped from
 * displayed text.
 */
import {
  dedupeUrls,
  extractUrlsFromMessage,
  getCopyableMessageText,
  stripInlineMarkdown,
  buildDisplayMessageText,
} from '../../screens/agent/chatMessage.utils';

describe('dedupeUrls', () => {
  it('removes exact duplicates', () => {
    expect(dedupeUrls(['a', 'b', 'a'])).toEqual(['a', 'b']);
  });
  it('preserves order of first occurrence', () => {
    expect(dedupeUrls(['c', 'a', 'b', 'a'])).toEqual(['c', 'a', 'b']);
  });
  it('handles empty', () => {
    expect(dedupeUrls([])).toEqual([]);
  });
});

describe('extractUrlsFromMessage', () => {
  it('picks up markdown image URLs', () => {
    const result = extractUrlsFromMessage('here is ![alt](https://cdn.example.com/a.png) cheer');
    expect(result.imageUrls).toContain('https://cdn.example.com/a.png');
  });
  it('classifies plain URLs by extension', () => {
    const text =
      'see https://x.com/a.jpg https://x.com/b.mp3 https://x.com/c.mp4 https://x.com/d.pdf';
    const r = extractUrlsFromMessage(text);
    expect(r.imageUrls).toEqual(['https://x.com/a.jpg']);
    expect(r.audioUrls).toEqual(['https://x.com/b.mp3']);
    expect(r.videoUrls).toEqual(['https://x.com/c.mp4']);
    expect(r.fileUrls).toEqual(['https://x.com/d.pdf']);
  });
  it('tolerates trailing punctuation', () => {
    const r = extractUrlsFromMessage('see https://x.com/a.png.');
    expect(r.imageUrls).toEqual(['https://x.com/a.png']);
  });
  it('recognises query-string variants', () => {
    const r = extractUrlsFromMessage('ping https://x.com/a.png?v=2');
    expect(r.imageUrls).toEqual(['https://x.com/a.png?v=2']);
  });
  it('treats /api/uploads/* without extension as file', () => {
    const r = extractUrlsFromMessage('doc: https://api.agentrix.top/api/uploads/abc123');
    expect(r.fileUrls).toContain('https://api.agentrix.top/api/uploads/abc123');
  });
  it('returns empty arrays on no URLs', () => {
    const r = extractUrlsFromMessage('plain text no links');
    expect(r.imageUrls).toEqual([]);
    expect(r.audioUrls).toEqual([]);
    expect(r.videoUrls).toEqual([]);
    expect(r.fileUrls).toEqual([]);
  });
});

describe('getCopyableMessageText', () => {
  it('joins content + attachment lines', () => {
    const out = getCopyableMessageText({
      content: 'Hello',
      attachments: [
        { originalName: 'photo.png', publicUrl: 'https://x/p.png' },
        { originalName: 'doc.pdf', localUri: 'file:///d.pdf' },
      ],
    });
    expect(out).toBe(
      'Hello\nphoto.png: https://x/p.png\ndoc.pdf: file:///d.pdf',
    );
  });
  it('skips blank content / empty attachments', () => {
    expect(getCopyableMessageText({ content: '   ' })).toBe('');
    expect(getCopyableMessageText({ content: 'only', attachments: [] })).toBe('only');
  });
  it('handles missing attachments field', () => {
    expect(getCopyableMessageText({ content: 'just text' })).toBe('just text');
  });
});

describe('stripInlineMarkdown', () => {
  it('strips bold', () => {
    expect(stripInlineMarkdown('hello **world**')).toBe('hello world');
  });
  it('strips italic', () => {
    expect(stripInlineMarkdown('*emphasis*')).toBe('emphasis');
  });
  it('strips inline code', () => {
    expect(stripInlineMarkdown('call `foo()` now')).toBe('call foo() now');
  });
  it('leaves plain text alone', () => {
    expect(stripInlineMarkdown('nothing to strip')).toBe('nothing to strip');
  });
});

describe('buildDisplayMessageText', () => {
  it('returns empty on empty input', () => {
    expect(buildDisplayMessageText('')).toBe('');
  });
  it('strips attached image markdown', () => {
    const result = buildDisplayMessageText(
      'look ![alt](https://cdn.example.com/a.png) cool',
    );
    expect(result).toContain('look');
    expect(result).toContain('cool');
    expect(result).not.toContain('https://cdn.example.com/a.png');
  });
  it('strips [User Attachments] block', () => {
    const result = buildDisplayMessageText(
      'Here is your reply\n[User Attachments]\nfoo.png: https://x/y',
    );
    expect(result).toBe('Here is your reply');
  });
  it('collapses excess blank lines', () => {
    const result = buildDisplayMessageText('a\n\n\n\nb');
    expect(result).toBe('a\n\nb');
  });
  it('keeps URL-free plain text intact', () => {
    expect(buildDisplayMessageText('simple')).toBe('simple');
  });
});
