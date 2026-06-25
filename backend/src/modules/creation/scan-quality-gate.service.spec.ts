import {
  ScanQualityGateService,
  PlaceholderScanQualityCriterion,
  normalizeWorldAssetForGate,
} from './scan-quality-gate.service';
import type {
  QualityGateResult,
  ScanAssetGenResult,
  ScanQualityCriterion,
} from '../../../shared/types/creation-scan';

/**
 * Unit tests for ScanQualityGateService (world-creation-feed task 4.3).
 *
 * Validates:
 *  - 需求 2.12:扫描结果作为创作素材纳入,但受质量门槛约束;达标 → 纳入素材,
 *    未达门槛 → 不作为成品呈现(结构化拒绝)。
 *  - 需求 11.4:输出形象须经风格化;绝不直出原始扫描照片;不达标不出成品形象。
 *
 * 覆盖:
 *  - 达标(风格化 mesh / 风格化立绘)→ accepted + 仅风格化的素材与预览(绝不含原图);
 *  - 不达标(仅原图、mesh_failed、缺名、语义不完整)→ needs_restyle + 结构化 reasons,
 *    且不返回 material/preview;
 *  - 门槛判据可替换(注入自定义 criterion 改变判定);
 *  - normalizeWorldAssetForGate:把 WorldAsset(portrait=原始照片)保守归类为原图 → 被拦截。
 *
 * 纯逻辑 —— 无 DB / 无 Nest TestingModule(服务可独立 new,@Optional 注入回退占位判据)。
 */

/** 构造一个达标的扫描结果(风格化 mesh + 完整度齐全)。 */
function passingResult(overrides: Partial<ScanAssetGenResult> = {}): ScanAssetGenResult {
  return {
    assetId: 'asset_1',
    name: 'Mighty Toy',
    category: 'character',
    styleType: 'cartoon',
    generationStatus: 'complete',
    styledMeshUrl: 'https://cdn/styled/cartoon/asset_1.glb',
    styledPortraitUrl: null,
    rawPhotoUrl: 'https://cdn/raw/asset_1.jpg',
    rawMeshUrl: 'https://cdn/raw/asset_1.glb',
    semanticComplete: true,
    ...overrides,
  };
}

describe('ScanQualityGateService (task 4.3)', () => {
  let service: ScanQualityGateService;

  beforeEach(() => {
    // 缺省注入 → @Optional 回退占位判据 PlaceholderScanQualityCriterion。
    service = new ScanQualityGateService();
  });

  // ============================================================
  // 达标 → accepted(需求 2.12)
  // ============================================================

  describe('passing asset → accepted', () => {
    it('accepts an asset with a stylized mesh and surfaces a stylized preview', () => {
      const res = service.intake(passingResult());

      expect(res.accepted).toBe(true);
      expect(res.status).toBe('accepted');
      expect(res.reasons).toBeUndefined();
      expect(res.material).toMatchObject({
        sourceAssetId: 'asset_1',
        name: 'Mighty Toy',
        category: 'character',
        styledMeshUrl: 'https://cdn/styled/cartoon/asset_1.glb',
        styleType: 'cartoon',
      });
      // 预览(无风格化立绘 → 用风格化 mesh 首帧),绝不含原图。
      expect(res.preview).toEqual({
        kind: 'first_frame',
        url: 'https://cdn/styled/cartoon/asset_1.glb',
      });
    });

    it('prefers a stylized portrait as the cover preview when present', () => {
      const res = service.intake(
        passingResult({ styledPortraitUrl: 'https://cdn/styled/portrait_1.png' }),
      );

      expect(res.accepted).toBe(true);
      expect(res.preview).toEqual({
        kind: 'cover',
        url: 'https://cdn/styled/portrait_1.png',
      });
    });

    it('NEVER surfaces the raw scan photo as the finished image (需求 11.4)', () => {
      const res = service.intake(passingResult({ styledPortraitUrl: 'https://cdn/styled/p.png' }));

      const rawPhoto = 'https://cdn/raw/asset_1.jpg';
      expect(res.preview?.url).not.toBe(rawPhoto);
      expect(res.material?.styledPortraitUrl).not.toBe(rawPhoto);
      // 素材不携带任何原图/原始 mesh 字段。
      expect(res.material).not.toHaveProperty('rawPhotoUrl');
      expect(res.material).not.toHaveProperty('rawMeshUrl');
    });

    it('accepts a stylized portrait even without a styled mesh', () => {
      const res = service.intake(
        passingResult({ styledMeshUrl: null, styledPortraitUrl: 'https://cdn/styled/only_portrait.png' }),
      );

      expect(res.accepted).toBe(true);
      expect(res.preview?.kind).toBe('cover');
    });
  });

  // ============================================================
  // 不达标 → needs_restyle + reasons(需求 2.12 / 11.4)
  // ============================================================

  describe('low-quality / raw asset → rejected with reasons', () => {
    it('rejects an asset that has only a raw scan photo (no stylization)', () => {
      const res = service.intake(
        passingResult({ styledMeshUrl: null, styledPortraitUrl: null }),
      );

      expect(res.accepted).toBe(false);
      expect(res.status).toBe('needs_restyle');
      expect(res.material).toBeUndefined();
      expect(res.preview).toBeUndefined();
      expect(res.reasons && res.reasons.length).toBeGreaterThan(0);
      expect(res.reasons?.join(' ')).toContain('原始扫描产物');
    });

    it('rejects when there is no visual at all', () => {
      const res = service.intake({
        assetId: 'a',
        name: 'X',
        generationStatus: 'card_ready',
        semanticComplete: true,
      });

      expect(res.accepted).toBe(false);
      expect(res.reasons?.join(' ')).toContain('缺少风格化形象');
    });

    it('rejects a mesh_failed asset (completeness)', () => {
      const res = service.intake(
        passingResult({ generationStatus: 'mesh_failed' }),
      );

      expect(res.accepted).toBe(false);
      expect(res.reasons?.join(' ')).toContain('mesh_failed');
    });

    it('rejects an asset missing a name', () => {
      const res = service.intake(passingResult({ name: '   ' }));

      expect(res.accepted).toBe(false);
      expect(res.reasons?.join(' ')).toContain('名称');
    });

    it('rejects an asset with incomplete semantics', () => {
      const res = service.intake(passingResult({ semanticComplete: false }));

      expect(res.accepted).toBe(false);
      expect(res.reasons?.join(' ')).toContain('语义');
    });

    it('aggregates multiple failure reasons', () => {
      const res = service.intake({
        assetId: 'bad',
        name: '',
        generationStatus: 'mesh_failed',
        semanticComplete: false,
        rawPhotoUrl: 'https://cdn/raw/bad.jpg',
      });

      expect(res.accepted).toBe(false);
      expect((res.reasons ?? []).length).toBeGreaterThanOrEqual(3);
    });
  });

  // ============================================================
  // qualityGate() 钩子直接返回 pass|fail(需求 2.12)
  // ============================================================

  describe('qualityGate() hook', () => {
    it('returns { pass: true } for a compliant asset', () => {
      expect(service.qualityGate(passingResult())).toEqual({ pass: true });
    });

    it('returns { pass: false, reasons } for a raw-only asset', () => {
      const gate = service.qualityGate(passingResult({ styledMeshUrl: null }));
      expect(gate.pass).toBe(false);
      expect(gate.reasons?.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // 判据可替换(design §Creation Authoring — qualityGate 钩子可替换)
  // ============================================================

  describe('replaceable criterion (injected hook)', () => {
    it('uses a stricter injected criterion that rejects an otherwise-passing asset', () => {
      // 自定义严格判据:要求必须有风格化立绘(比占位判据更严)。
      const stricter: ScanQualityCriterion = {
        evaluate: (r: ScanAssetGenResult): QualityGateResult =>
          r.styledPortraitUrl
            ? { pass: true }
            : { pass: false, reasons: ['stricter: 必须有风格化立绘'] },
      };
      const strictService = new ScanQualityGateService(stricter);

      // 占位判据下达标(有 styledMeshUrl),严格判据下被拒。
      const res = strictService.intake(passingResult({ styledPortraitUrl: null }));
      expect(res.accepted).toBe(false);
      expect(res.reasons).toEqual(['stricter: 必须有风格化立绘']);
    });

    it('uses a lenient injected criterion that accepts anything', () => {
      const lenient: ScanQualityCriterion = {
        evaluate: (): QualityGateResult => ({ pass: true }),
      };
      const lenientService = new ScanQualityGateService(lenient);

      // 仅有原图,占位判据会拒;宽松判据放行(证明判据驱动判定)。
      const res = lenientService.intake({
        name: 'Raw',
        category: 'character',
        rawPhotoUrl: 'https://cdn/raw/x.jpg',
      });
      expect(res.accepted).toBe(true);
    });
  });
});

// ============================================================
// PlaceholderScanQualityCriterion(占位判据)直测
// ============================================================

describe('PlaceholderScanQualityCriterion (task 4.3)', () => {
  const criterion = new PlaceholderScanQualityCriterion();

  it('passes with a stylized mesh + complete metadata', () => {
    expect(
      criterion.evaluate({
        name: 'A',
        styledMeshUrl: 'https://cdn/styled.glb',
        generationStatus: 'complete',
        semanticComplete: true,
      }),
    ).toEqual({ pass: true });
  });

  it('fails for raw-only input with a dedicated raw-photo reason', () => {
    const r = criterion.evaluate({
      name: 'A',
      rawPhotoUrl: 'https://cdn/raw.jpg',
      semanticComplete: true,
    });
    expect(r.pass).toBe(false);
    expect(r.reasons?.[0]).toContain('原始扫描产物');
  });
});

// ============================================================
// normalizeWorldAssetForGate — WorldAsset 投影(需求 11.4 保守拦截原图)
// ============================================================

describe('normalizeWorldAssetForGate (task 4.3)', () => {
  it('classifies WorldAsset.portraitUrl as a raw photo (not stylized)', () => {
    const normalized = normalizeWorldAssetForGate({
      id: 'asset_1',
      name: 'Mighty Toy',
      category: 'character',
      styleType: 'cartoon',
      generationStatus: 'card_ready',
      meshUrl: null,
      styledMeshUrl: null,
      portraitUrl: 'https://cdn/scan/raw_photo.jpg',
      semanticDescription: { objectCategory: 'toy' },
    });

    expect(normalized.rawPhotoUrl).toBe('https://cdn/scan/raw_photo.jpg');
    expect(normalized.styledPortraitUrl).toBeNull();
    expect(normalized.styledMeshUrl).toBeNull();
    expect(normalized.semanticComplete).toBe(true);
  });

  it('a card_ready WorldAsset with only a raw portrait is rejected by the gate (需求 11.4)', () => {
    const service = new ScanQualityGateService();
    const normalized = normalizeWorldAssetForGate({
      id: 'asset_1',
      name: 'Mighty Toy',
      generationStatus: 'card_ready',
      meshUrl: null,
      styledMeshUrl: null,
      portraitUrl: 'https://cdn/scan/raw_photo.jpg',
      semanticDescription: { objectCategory: 'toy' },
    });

    const res = service.intake(normalized);
    expect(res.accepted).toBe(false);
    expect(res.status).toBe('needs_restyle');
  });

  it('a complete WorldAsset with a styled mesh is accepted', () => {
    const service = new ScanQualityGateService();
    const normalized = normalizeWorldAssetForGate({
      id: 'asset_2',
      name: 'Iron Mug',
      generationStatus: 'complete',
      meshUrl: 'https://cdn/raw/asset_2.glb',
      styledMeshUrl: 'https://cdn/styled/cartoon/asset_2.glb',
      portraitUrl: 'https://cdn/scan/raw_photo_2.jpg',
      semanticDescription: { objectCategory: 'mug' },
    });

    const res = service.intake(normalized);
    expect(res.accepted).toBe(true);
    expect(res.preview?.url).toBe('https://cdn/styled/cartoon/asset_2.glb');
  });

  it('treats an empty semantic description as incomplete', () => {
    const normalized = normalizeWorldAssetForGate({
      id: 'a',
      name: 'X',
      styledMeshUrl: 'https://cdn/styled.glb',
      generationStatus: 'complete',
      semanticDescription: {},
    });
    expect(normalized.semanticComplete).toBe(false);
  });
});
