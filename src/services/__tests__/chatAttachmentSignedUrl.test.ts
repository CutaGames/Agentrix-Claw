/**
 * L8 1a A1: a chat attachment uploaded while the owner switch is on comes back with a signed query string
 * (`?e=<unix seconds>&s=<signature>`). The app treats `url` as an opaque string, so pictures, audio, video and files
 * must still be recognised and the link must still be stripped from the shown text.
 */
import { buildDisplayMessageText, extractUrlsFromMessage } from '../../screens/agent/chatMessage.utils';

const BASE = 'https://api.agentrix.top/api/uploads/chat/aaaaaaaa-0000-4000-8000-000000000001';
const SIG = `e=1900000000&s=${'A'.repeat(43)}`;
const link = (ext: string) => `${BASE}.${ext}?${SIG}`;

describe('signed chat attachment links in a message', () => {
  it('a signed picture is still a picture, audio is audio, video is video, anything else under /api/uploads/ is a file', () => {
    const text = `[Attachment 1: a] URL: ${link('png')}\n${link('mp3')}\n${link('mp4')}\n${link('pdf')}\n${link('docx')}`;
    const r = extractUrlsFromMessage(text);
    expect(r.imageUrls).toEqual([link('png')]);
    expect(r.audioUrls).toEqual([link('mp3')]);
    expect(r.videoUrls).toEqual([link('mp4')]);
    expect(r.fileUrls).toEqual([link('pdf'), link('docx')]);
  });

  it('the signature survives extraction untouched (nothing is trimmed off the query string)', () => {
    expect(extractUrlsFromMessage(`see ${link('jpg')}.`).imageUrls).toEqual([link('jpg')]);
    expect(extractUrlsFromMessage(`(${link('webp')})`).imageUrls).toEqual([link('webp')]);
  });

  it('the shown text drops the signed link like any other attachment link', () => {
    expect(buildDisplayMessageText(`look at this ${link('png')}`)).toBe('look at this');
    expect(buildDisplayMessageText(`${link('pdf')}`)).toBe('');
  });
});
