import { CreationGameService } from './creation-game.service';
import { renderTemplate, pickTemplateByPrompt } from './game-templates';
import type { CreationGameBundleEntity } from '../entities/creation-game-bundle.entity';

/** 内存假仓储,模拟 Repository<CreationGameBundleEntity> 的 create/save/findOne。 */
class FakeRepo {
  rows: CreationGameBundleEntity[] = [];
  create(p: Partial<CreationGameBundleEntity>): CreationGameBundleEntity {
    return { id: 'gen-' + this.rows.length, createdAt: new Date(), ...p } as CreationGameBundleEntity;
  }
  async save(e: CreationGameBundleEntity): Promise<CreationGameBundleEntity> {
    this.rows.push(e);
    return e;
  }
  async findOne(opts: any): Promise<CreationGameBundleEntity | null> {
    const cid = opts?.where?.creationId;
    const mine = this.rows.filter((r) => r.creationId === cid).sort((a, b) => b.version - a.version);
    return mine[0] ?? null;
  }
}

function makeService(bedrock?: any) {
  const repo = new FakeRepo();
  const svc = new CreationGameService(repo as any, bedrock);
  return { svc, repo };
}

describe('CreationGameService', () => {
  describe('validateGameHtml', () => {
    const { svc } = makeService();
    it('接受合法内置模板', () => {
      const html = renderTemplate('2048');
      expect(svc.validateGameHtml(html).ok).toBe(true);
    });
    it('拒绝非字符串 / 过短 / 非 html', () => {
      expect(svc.validateGameHtml(null).ok).toBe(false);
      expect(svc.validateGameHtml('x').ok).toBe(false);
      expect(svc.validateGameHtml('<div>just a fragment, no html tag and short</div>').ok).toBe(false);
    });
    it('拒绝越权/外联 token(iframe / cookie / 外部 fetch)', () => {
      const pad = '/*'.padEnd(260, 'x') + '*/'; // 非空白填充,避免 trim 后过短
      const base = '<!doctype html><html><body><canvas></canvas><script>';
      expect(svc.validateGameHtml(base + 'var x=1;' + pad + '</script></html>').ok).toBe(true);
      expect(svc.validateGameHtml(base + 'document.cookie;' + pad + '</script></html>').ok).toBe(false);
      expect(svc.validateGameHtml('<!doctype html><html><iframe src="http://x"></iframe>' + pad + '</html>').ok).toBe(false);
      expect(svc.validateGameHtml(base + "fetch('https://evil.com');" + pad + '</script></html>').ok).toBe(false);
    });
  });

  describe('extractHtml', () => {
    const { svc } = makeService();
    it('去 markdown 围栏并截取 doctype..</html>', () => {
      const out = svc.extractHtml('好的,这是游戏:\n```html\n<!doctype html><html><body>g</body></html>\n```\n完成');
      expect(out).toBe('<!doctype html><html><body>g</body></html>');
    });
    it('无 html 返回 null', () => {
      expect(svc.extractHtml('抱歉我不能')).toBeNull();
    });
  });

  describe('pickTemplateByPrompt', () => {
    it('关键词匹配,无命中默认 2048', () => {
      expect(pickTemplateByPrompt('做个贪吃蛇')).toBe('snake');
      expect(pickTemplateByPrompt('打砖块弹球')).toBe('breakout');
      expect(pickTemplateByPrompt('2048 数字合并')).toBe('2048');
      expect(pickTemplateByPrompt('俄罗斯方块')).toBe('2048'); // 未命中 → 默认
    });
  });

  describe('generateForCreation', () => {
    it('无 LLM → 模板兜底,source=template,版本自增', async () => {
      const { svc } = makeService(undefined);
      const b1 = await svc.generateForCreation('c1', '贪吃蛇大作战', '一个贪吃蛇游戏');
      expect(b1.source).toBe('template');
      expect(b1.version).toBe(1);
      expect(b1.html).toContain('<html');
      const b2 = await svc.generateForCreation('c1', '贪吃蛇大作战', '一个贪吃蛇游戏');
      expect(b2.version).toBe(2);
    });

    it('LLM 产出合法 HTML → source=llm', async () => {
      const goodHtml = renderTemplate('breakout');
      const bedrock = { invokeModel: jest.fn().mockResolvedValue('```html\n' + goodHtml + '\n```') };
      const { svc } = makeService(bedrock);
      const b = await svc.generateForCreation('c2', '我的游戏', '随便做个游戏');
      expect(bedrock.invokeModel).toHaveBeenCalled();
      expect(b.source).toBe('llm');
    });

    it('LLM 产出非法 HTML → 回退模板', async () => {
      const bedrock = { invokeModel: jest.fn().mockResolvedValue('抱歉,这里有 <iframe src="http://x"> 不合法') };
      const { svc } = makeService(bedrock);
      const b = await svc.generateForCreation('c3', '塔防', '塔防游戏');
      expect(b.source).toBe('template');
    });

    it('LLM 抛错 → 回退模板,不崩', async () => {
      const bedrock = { invokeModel: jest.fn().mockRejectedValue(new Error('bedrock down')) };
      const { svc } = makeService(bedrock);
      const b = await svc.generateForCreation('c4', '游戏', 'snake 贪吃蛇');
      expect(b.source).toBe('template');
      expect(b.html).toContain('<html');
    });
  });
});
