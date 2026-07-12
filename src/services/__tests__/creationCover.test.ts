/**
 * isRenderableCover 纯逻辑单测（world-growth-mobile-experience · task 1.1）。
 *
 * spec: .kiro/specs/world-growth-mobile-experience/{requirements,design}.md
 *   - R2.1/2.2：仅 `https://` 图片算真封面；`generated://` 占位句柄 / 空 / http:// / 非字符串
 *     一律不算。共享纯函数为后端质量门与移动端 Feed/验收指标的单一口径。
 *
 * 无 RN 依赖（纯字符串检查），故随 mobile 根 jest 的 pure-logic 套件运行。
 */
import { isRenderableCover } from '../../../shared/types/creation-cover';

describe('isRenderableCover — 封面可渲染性判定（单一口径）', () => {
  it('https:// 开头的真实图片 URL → true', () => {
    expect(isRenderableCover('https://cdn.agentrix.top/covers/abc.png')).toBe(true);
    expect(isRenderableCover('https://example.com/x.jpg')).toBe(true);
    // 仅前缀即可（不校验扩展名/路径）
    expect(isRenderableCover('https://a')).toBe(true);
  });

  it('generated:// 占位句柄（Cover_Handle）→ false', () => {
    expect(isRenderableCover('generated://cover/tpl-coffee@1')).toBe(false);
    expect(isRenderableCover('generated://cover/xyz@2')).toBe(false);
  });

  it('空串 → false', () => {
    expect(isRenderableCover('')).toBe(false);
  });

  it('http:// （非安全、按口径不算真封面）→ false', () => {
    expect(isRenderableCover('http://example.com/x.png')).toBe(false);
  });

  it('undefined / null → false', () => {
    expect(isRenderableCover(undefined)).toBe(false);
    expect(isRenderableCover(null)).toBe(false);
  });

  it('非字符串输入（number / object / boolean）→ false', () => {
    // 运行时可能收到非字符串（如后端读库或 JSON 反序列化异常），须稳健处理
    expect(isRenderableCover(123 as unknown as string)).toBe(false);
    expect(isRenderableCover({} as unknown as string)).toBe(false);
    expect(isRenderableCover(true as unknown as string)).toBe(false);
    expect(isRenderableCover([] as unknown as string)).toBe(false);
  });

  it('前后有空白 / 大小写混淆的伪 https 前缀 → false（严格前缀匹配）', () => {
    expect(isRenderableCover(' https://example.com/x.png')).toBe(false);
    expect(isRenderableCover('HTTPS://example.com/x.png')).toBe(false);
    expect(isRenderableCover('xhttps://example.com/x.png')).toBe(false);
  });
});
