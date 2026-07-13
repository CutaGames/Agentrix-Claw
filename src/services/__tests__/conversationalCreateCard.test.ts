/**
 * ConversationalCreateCard 四态派生 + 解析纯逻辑单测
 * （world-growth-mobile-experience · task 8.3）。
 *
 * spec: .kiro/specs/world-growth-mobile-experience/{requirements,design}.md
 *   §Components and Interfaces 7（Conversational_Create_Card）
 *   - R6.1：`create_shop`/`create_place` 成功 ⇒ created 态露出封面 + 分享/进入入口。
 *   - R6.2：展示 shareCode 对应 landingUrl + deepLink + 一键分享入口。
 *   - R6.4：need_more_info 态露出 missingRequired 追问列表，而非成功卡片。
 *   - R6.5：rejected/failed 态露出可读 reason，而非成功卡片。
 *
 * ── harness 约束（RN 组件渲染受限） ─────────────────────────────────────────
 * mobile 根 jest 为 **pure-logic only**（`jest.config.js`：node env，无 jest-expo）。
 * `ConversationalCreateCard` 是 RN 组件，`react-native` 原生渲染无法在本 harness 执行，
 * 故**不产出**不可运行的 RN render spec。改为测试驱动四态渲染的**纯派生逻辑**
 * `conversationalCreateCardViewModel(...)`（组件已接线消费，行为等价）——它决定每一态
 * 露出哪些 affordances（分享链接/进入入口/追问项/理由）；并测试两条 chat 路径 meta
 * 载荷的解析 `extractConversationalCreate(...)`。RN 组件的像素级渲染断言留待 Phase 2
 * 的 jest-expo 套件（harness-limited / 见下方 skipped 说明）。
 */
import {
  conversationalCreateCardViewModel,
  conversationalCreateKindEmoji,
  extractConversationalCreate,
  mapAuthoringResultToConversationalCreate,
  CONVERSATIONAL_CREATE_META_KIND,
  CREATE_SHOP_TOOL_NAME,
  CREATE_PLACE_TOOL_NAME,
  type ConversationalCreateResult,
} from '../../../shared/types/conversational-create';

// ─────────────────────────────────────────────────────────────────────────────
// conversationalCreateCardViewModel —— 四态派生（驱动卡片渲染）
// ─────────────────────────────────────────────────────────────────────────────
describe('conversationalCreateCardViewModel — 四态派生（8.3）', () => {
  // ── created 态：封面 + 分享链接 + 进入入口（R6.1/6.2） ──
  describe('created —— 已开店🎉 / 已建成🎉', () => {
    const created: ConversationalCreateResult = {
      status: 'created',
      creationId: 'c-123',
      title: '手冲咖啡小店',
      coverUrl: 'https://cdn.agentrix.top/covers/coffee.png',
      shareCode: 'AB12CD',
      landingUrl: 'https://agentrix.top/w/AB12CD',
      deepLink: 'agentrix://world/creation/AB12CD',
    };

    it('暴露 shareCode / landingUrl / deepLink 与可渲染封面（R6.2）', () => {
      const vm = conversationalCreateCardViewModel(created, 'shop');
      expect(vm.variant).toBe('created');
      expect(vm.shareCode).toBe('AB12CD');
      expect(vm.landingUrl).toBe('https://agentrix.top/w/AB12CD');
      expect(vm.deepLink).toBe('agentrix://world/creation/AB12CD');
      expect(vm.hasRenderableCover).toBe(true);
      expect(vm.coverUrl).toBe('https://cdn.agentrix.top/covers/coffee.png');
      expect(vm.title).toBe('手冲咖啡小店');
    });

    it('分享入口目标优先 landingUrl；canShare=true（R6.2）', () => {
      const vm = conversationalCreateCardViewModel(created, 'shop');
      expect(vm.shareUrl).toBe('https://agentrix.top/w/AB12CD');
      expect(vm.canShare).toBe(true);
    });

    it('无 landingUrl 时分享回退 deepLink（R6.2）', () => {
      const vm = conversationalCreateCardViewModel(
        { ...created, landingUrl: undefined },
        'shop',
      );
      expect(vm.shareUrl).toBe('agentrix://world/creation/AB12CD');
      expect(vm.canShare).toBe(true);
    });

    it('无 landingUrl 且无 deepLink 时不露出分享入口（canShare=false）', () => {
      const vm = conversationalCreateCardViewModel(
        { ...created, landingUrl: undefined, deepLink: undefined },
        'shop',
      );
      expect(vm.shareUrl).toBe('');
      expect(vm.canShare).toBe(false);
    });

    it('携带 creationId ⇒ 可默认导航「进入」（hasCreationId=true）（R6.3）', () => {
      const vm = conversationalCreateCardViewModel(created, 'shop');
      expect(vm.hasCreationId).toBe(true);
    });

    it('无 creationId ⇒ hasCreationId=false', () => {
      const vm = conversationalCreateCardViewModel(
        { ...created, creationId: undefined },
        'shop',
      );
      expect(vm.hasCreationId).toBe(false);
    });

    it('非 https 封面（占位句柄/空）⇒ hasRenderableCover=false（回退渐变，绝不黑屏）', () => {
      expect(
        conversationalCreateCardViewModel(
          { ...created, coverUrl: 'generated://cover/tpl-coffee@1' },
          'shop',
        ).hasRenderableCover,
      ).toBe(false);
      expect(
        conversationalCreateCardViewModel({ ...created, coverUrl: '' }, 'shop').hasRenderableCover,
      ).toBe(false);
      expect(
        conversationalCreateCardViewModel({ ...created, coverUrl: undefined }, 'shop')
          .hasRenderableCover,
      ).toBe(false);
    });

    it('业态 kind 决定 emoji（shop=🏪 / place=🏛️）', () => {
      expect(conversationalCreateCardViewModel(created, 'shop').emoji).toBe('🏪');
      expect(conversationalCreateCardViewModel(created, 'place').emoji).toBe('🏛️');
      // 缺省 kind 按 shop
      expect(conversationalCreateCardViewModel(created).kind).toBe('shop');
      expect(conversationalCreateCardViewModel(created).emoji).toBe('🏪');
    });

    it('created 态不携带追问项/理由', () => {
      const vm = conversationalCreateCardViewModel(created, 'shop');
      expect(vm.missingRequired).toEqual([]);
      expect(vm.isRejected).toBe(false);
      expect(vm.reason).toBeUndefined();
    });
  });

  // ── need_more_info 态：追问 missingRequired（R6.4） ──
  describe('need_more_info —— 追问缺失必填槽位', () => {
    it('暴露 missingRequired 追问列表', () => {
      const vm = conversationalCreateCardViewModel(
        { status: 'need_more_info', missingRequired: ['店名', '主营商品'] },
        'shop',
      );
      expect(vm.variant).toBe('need_more_info');
      expect(vm.missingRequired).toEqual(['店名', '主营商品']);
    });

    it('missingRequired 缺省为空数组（组件回退到通用追问文案）', () => {
      const vm = conversationalCreateCardViewModel({ status: 'need_more_info' }, 'shop');
      expect(vm.missingRequired).toEqual([]);
    });

    it('返回的 missingRequired 是拷贝，不共享原引用', () => {
      const src: ConversationalCreateResult = {
        status: 'need_more_info',
        missingRequired: ['a'],
      };
      const vm = conversationalCreateCardViewModel(src, 'shop');
      vm.missingRequired.push('b');
      expect(src.missingRequired).toEqual(['a']);
    });

    it('need_more_info 态不呈现成功卡的封面/分享（不误渲染成功）', () => {
      const vm = conversationalCreateCardViewModel(
        { status: 'need_more_info', missingRequired: ['店名'] },
        'shop',
      );
      expect(vm.hasRenderableCover).toBe(false);
      expect(vm.canShare).toBe(false);
    });
  });

  // ── rejected / failed 态：可读 reason（R6.5） ──
  describe('rejected / failed —— 可读理由 + 补齐引导', () => {
    it('rejected：isRejected=true 且透出 reason', () => {
      const vm = conversationalCreateCardViewModel(
        { status: 'rejected', reason: '还没达到发布标准' },
        'shop',
      );
      expect(vm.variant).toBe('rejected');
      expect(vm.isRejected).toBe(true);
      expect(vm.reason).toBe('还没达到发布标准');
    });

    it('failed：isRejected=false 且透出 reason', () => {
      const vm = conversationalCreateCardViewModel(
        { status: 'failed', reason: '生成超时' },
        'place',
      );
      expect(vm.variant).toBe('failed');
      expect(vm.isRejected).toBe(false);
      expect(vm.reason).toBe('生成超时');
    });

    it('无 reason 时为 undefined（组件回退到默认理由文案）', () => {
      expect(conversationalCreateCardViewModel({ status: 'rejected' }, 'shop').reason).toBeUndefined();
      expect(conversationalCreateCardViewModel({ status: 'failed' }, 'shop').reason).toBeUndefined();
    });

    it('rejected/failed 态不呈现成功卡的分享入口（不误渲染成功）', () => {
      const vm = conversationalCreateCardViewModel({ status: 'failed', reason: 'x' }, 'shop');
      expect(vm.canShare).toBe(false);
      expect(vm.missingRequired).toEqual([]);
    });
  });

  it('conversationalCreateKindEmoji 独立可用', () => {
    expect(conversationalCreateKindEmoji('shop')).toBe('🏪');
    expect(conversationalCreateKindEmoji('place')).toBe('🏛️');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractConversationalCreate —— 两条 chat 路径 meta 载荷解析（R6.6）
// ─────────────────────────────────────────────────────────────────────────────
describe('extractConversationalCreate — 两条 chat 路径 meta 解析（8.3 / R6.6）', () => {
  const created: ConversationalCreateResult = {
    status: 'created',
    creationId: 'c-1',
    title: '咖啡店',
    coverUrl: 'https://cdn.agentrix.top/covers/c.png',
    shareCode: 'S1',
    landingUrl: 'https://agentrix.top/w/S1',
    deepLink: 'agentrix://world/creation/S1',
  };

  it('结构化 meta envelope（两条路径共用形状）→ 解出 created', () => {
    const payload = {
      type: 'meta',
      kind: CONVERSATIONAL_CREATE_META_KIND,
      conversationalCreate: created,
    };
    const parsed = extractConversationalCreate(payload);
    expect(parsed).not.toBeNull();
    expect(parsed!.result).toEqual(created);
  });

  it('直挂字段 { conversationalCreate } → 解出结果', () => {
    const parsed = extractConversationalCreate({ conversationalCreate: created });
    expect(parsed!.result.status).toBe('created');
    expect(parsed!.result.shareCode).toBe('S1');
  });

  it('载荷本身即 4-state 结果 → 直接解出', () => {
    const parsed = extractConversationalCreate(created);
    expect(parsed!.result).toEqual(created);
  });

  it('嵌套 { meta: {...} } → 递归解出', () => {
    const parsed = extractConversationalCreate({
      meta: { kind: CONVERSATIONAL_CREATE_META_KIND, conversationalCreate: created },
    });
    expect(parsed!.result).toEqual(created);
  });

  it('非流式 toolCalls[] 命中 create_shop → 经映射转 4-state 并带出 kind=shop', () => {
    const payload = {
      toolCalls: [
        {
          name: CREATE_SHOP_TOOL_NAME,
          output: {
            status: 'published',
            creationId: 'c-9',
            title: '手冲店',
            coverUrl: 'https://cdn.agentrix.top/covers/x.png',
            shareCode: 'Z9',
            landingUrl: 'https://agentrix.top/w/Z9',
            deepLink: 'agentrix://world/creation/Z9',
          },
        },
      ],
    };
    const parsed = extractConversationalCreate(payload);
    expect(parsed!.kind).toBe('shop');
    expect(parsed!.result.status).toBe('created');
    expect(parsed!.result.shareCode).toBe('Z9');
  });

  it('toolCalls[] 命中 create_place（tool_calls + function.name + 字符串 output）→ kind=place', () => {
    const payload = {
      tool_calls: [
        {
          function: { name: CREATE_PLACE_TOOL_NAME },
          output: JSON.stringify({ status: 'need_more_info', missingRequired: ['选址'] }),
        },
      ],
    };
    const parsed = extractConversationalCreate(payload);
    expect(parsed!.kind).toBe('place');
    expect(parsed!.result.status).toBe('need_more_info');
    expect(parsed!.result.missingRequired).toEqual(['选址']);
  });

  it('toolCalls[] 中非会话式创作工具 → 忽略，返回 null', () => {
    const parsed = extractConversationalCreate({
      toolCalls: [{ name: 'search_web', output: { status: 'published' } }],
    });
    expect(parsed).toBeNull();
  });

  it('无法识别的载荷 / 空值 → null', () => {
    expect(extractConversationalCreate(null)).toBeNull();
    expect(extractConversationalCreate(undefined)).toBeNull();
    expect(extractConversationalCreate({})).toBeNull();
    expect(extractConversationalCreate({ foo: 'bar' })).toBeNull();
    expect(extractConversationalCreate('plain text')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapAuthoringResultToConversationalCreate —— 5-state → 4-state 状态映射
// （驱动四态卡片的上游收敛；两条路径共用，保证字段一致 R6.6）
// ─────────────────────────────────────────────────────────────────────────────
describe('mapAuthoringResultToConversationalCreate — 5→4 状态映射（8.3）', () => {
  it('published → created（齐备成功字段）', () => {
    const r = mapAuthoringResultToConversationalCreate({
      status: 'published',
      creationId: 'c-1',
      title: 't',
      coverUrl: 'https://cdn.agentrix.top/c.png',
      shareCode: 'S',
      landingUrl: 'https://agentrix.top/w/S',
      deepLink: 'agentrix://world/creation/S',
    });
    expect(r.status).toBe('created');
    expect(r.coverUrl).toBe('https://cdn.agentrix.top/c.png');
    expect(r.landingUrl).toBe('https://agentrix.top/w/S');
  });

  it('published 但封面非 https ⇒ created 但丢弃不可渲染 coverUrl（绝不黑屏源头）', () => {
    const r = mapAuthoringResultToConversationalCreate({
      status: 'published',
      creationId: 'c-1',
      coverUrl: 'generated://cover/x@1',
    });
    expect(r.status).toBe('created');
    expect(r.coverUrl).toBeUndefined();
  });

  it('need_more_info → need_more_info（透出 missingRequired）', () => {
    const r = mapAuthoringResultToConversationalCreate({
      status: 'need_more_info',
      missingRequired: ['店名'],
    });
    expect(r.status).toBe('need_more_info');
    expect(r.missingRequired).toEqual(['店名']);
  });

  it('quality_rejected → rejected（透出 message 作 reason）', () => {
    const r = mapAuthoringResultToConversationalCreate({
      status: 'quality_rejected',
      message: '未过质量门',
    });
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('未过质量门');
  });

  it('generation_failed / error → failed', () => {
    expect(
      mapAuthoringResultToConversationalCreate({ status: 'generation_failed', message: 'x' }).status,
    ).toBe('failed');
    expect(mapAuthoringResultToConversationalCreate({ status: 'error', message: 'y' }).status).toBe(
      'failed',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// harness-limited（RN 组件像素级渲染）—— 记录为 skipped 并说明原因，不产出不可运行 spec
// ─────────────────────────────────────────────────────────────────────────────
describe('ConversationalCreateCard RN 渲染断言（harness-limited）', () => {
  // 见文件顶部说明：mobile 根 jest 为 pure-logic only（node env，无 jest-expo），
  // 无法渲染 react-native 组件树 / 断言 testID 节点。上方纯派生 + 解析单测已覆盖
  // 四态的 affordance 判定（分享链接/进入入口/追问项/理由）；RN render 断言待 jest-expo。
  it.skip('created 态渲染封面 + 一键分享 + 进入按钮（需 jest-expo）', () => {});
  it.skip('need_more_info 态渲染 missingRequired 追问列表（需 jest-expo）', () => {});
  it.skip('rejected/failed 态渲染可读理由（需 jest-expo）', () => {});
});
