import { SkillStatus } from '../../entities/skill.entity';
import { SkillService } from './skill.service';

describe('SkillService.findAll', () => {
  const buildService = () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    const skillRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    const service = new SkillService(
      skillRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return {
      service,
      skillRepository,
      queryBuilder,
    };
  };

  it('uses summary selection by default', async () => {
    const { service, queryBuilder } = buildService();

    await service.findAll();

    expect(queryBuilder.select).toHaveBeenCalledTimes(1);
    expect(queryBuilder.getMany).toHaveBeenCalledTimes(1);
  });

  it('skips summary selection for full view', async () => {
    const { service, queryBuilder } = buildService();

    await service.findAll(undefined, 'full' as any);

    expect(queryBuilder.select).not.toHaveBeenCalled();
    expect(queryBuilder.getMany).toHaveBeenCalledTimes(1);
  });

  it('applies status filters before querying', async () => {
    const { service, queryBuilder } = buildService();

    await service.findAll(SkillStatus.PUBLISHED);

    expect(queryBuilder.where).toHaveBeenCalledWith('skill.status = :status', {
      status: SkillStatus.PUBLISHED,
    });
  });
});