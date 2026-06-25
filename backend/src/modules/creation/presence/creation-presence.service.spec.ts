import { CreationPresenceService } from './creation-presence.service';
import type { CreationEntity } from '../entities/creation.entity';

/**
 * Unit tests for CreationPresenceService (world-creation-feed task 8.2).
 *
 * 校验房间 id 派生:
 *  - stage / livestream → `aeon-live-<id>` 前缀(StageService.isStageRoom 识别为舞台房)+ isStage=true;
 *  - 其他类型 → `creation-<id>` 普通同框房 + isStage=false。
 * 纯逻辑:describe() 不依赖仓储。
 */
describe('CreationPresenceService (task 8.2)', () => {
  const svc = new CreationPresenceService({} as any);

  const make = (type: CreationEntity['type']): CreationEntity =>
    ({ id: 'c1', type } as CreationEntity);

  it('stage → aeon-live 前缀,isStage=true', () => {
    const d = svc.describe(make('stage'));
    expect(d.roomId).toBe('aeon-live-c1');
    expect(d.isStage).toBe(true);
    expect(d.namespace).toBe('/aeon');
  });

  it('livestream → aeon-live 前缀,isStage=true', () => {
    const d = svc.describe(make('livestream'));
    expect(d.roomId).toBe('aeon-live-c1');
    expect(d.isStage).toBe(true);
  });

  it('place/shop/game → creation- 前缀,isStage=false', () => {
    for (const ty of ['place', 'shop', 'game'] as const) {
      const d = svc.describe(make(ty));
      expect(d.roomId).toBe('creation-c1');
      expect(d.isStage).toBe(false);
    }
  });
});
