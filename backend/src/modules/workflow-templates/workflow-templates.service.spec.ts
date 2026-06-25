import { WorkflowTemplatesService } from './workflow-templates.service';

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function matchWhere<T extends Record<string, any>>(row: T, where: Record<string, any>) {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function createMockRepo<T extends Record<string, any>>() {
  const store = new Map<string, T>();

  return {
    create: jest.fn((input: Partial<T>) => ({ ...input } as T)),
    save: jest.fn(async (input: T) => {
      const saved = deepClone(input);
      store.set(String(saved.id), saved);
      return deepClone(saved);
    }),
    find: jest.fn(async (options?: { where?: Record<string, any>; order?: Record<string, 'ASC' | 'DESC'> }) => {
      let rows = Array.from(store.values()).map((row) => deepClone(row));
      if (options?.where) {
        rows = rows.filter((row) => matchWhere(row, options.where!));
      }
      if (options?.order?.startedAtMs === 'DESC') {
        rows.sort((left, right) => Number(right.startedAtMs || 0) - Number(left.startedAtMs || 0));
      }
      return rows;
    }),
    findOne: jest.fn(async (options: { where: Record<string, any> }) => {
      const rows = Array.from(store.values()).filter((row) => matchWhere(row, options.where));
      return rows[0] ? deepClone(rows[0]) : null;
    }),
  };
}

describe('WorkflowTemplatesService', () => {
  it('persists templates and async instance execution across service instances', async () => {
    const templateRepo = createMockRepo<any>();
    const instanceRepo = createMockRepo<any>();
    const service = new WorkflowTemplatesService(templateRepo as any, instanceRepo as any);

    const template = await service.createTemplate('user-1', {
      name: 'Daily brief',
      category: 'productivity',
      visibility: 'public',
      steps: [
        { kind: 'fetch', description: 'Collect headlines' },
        { kind: 'compose', description: 'Summarize' },
      ],
      required_skills: ['news.fetch'],
    });

    const instance = await service.install('user-2', template.id);
    expect(instance.status).toBe('queued');

    await new Promise((resolve) => setTimeout(resolve, 120));

    const fresh = new WorkflowTemplatesService(templateRepo as any, instanceRepo as any);
    const storedTemplate = await fresh.getTemplate(template.id);
    const storedInstance = await fresh.getInstance(instance.id);

    expect(storedTemplate.install_count).toBe(1);
    expect(storedInstance.status).toBe('done');
    expect(storedInstance.results).toHaveLength(2);
    expect(storedInstance.results[0].step_id).toBe('s0');
  });

  it('filters templates by visibility while keeping ownership rules', async () => {
    const templateRepo = createMockRepo<any>();
    const instanceRepo = createMockRepo<any>();
    const service = new WorkflowTemplatesService(templateRepo as any, instanceRepo as any);

    await service.createTemplate('user-1', {
      name: 'Private flow',
      visibility: 'private',
      steps: [{ kind: 'compose', description: 'Draft update' }],
    });
    await service.createTemplate('user-1', {
      name: 'Public flow',
      visibility: 'public',
      steps: [{ kind: 'send', description: 'Share update' }],
    });
    await service.createTemplate('user-2', {
      name: 'Other private flow',
      visibility: 'private',
      steps: [{ kind: 'fetch', description: 'Gather stats' }],
    });

    const fresh = new WorkflowTemplatesService(templateRepo as any, instanceRepo as any);
    const mine = await fresh.listTemplates('user-1', { visibility: 'private' });
    const publicForOther = await fresh.listTemplates('user-3');

    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe('Private flow');
    expect(publicForOther).toHaveLength(1);
    expect(publicForOther[0].name).toBe('Public flow');
  });
});
