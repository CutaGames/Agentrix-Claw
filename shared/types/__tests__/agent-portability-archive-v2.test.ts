import {
  GENERIC_ARCHIVE_ITEMS_SCHEMA_V1,
  GENERIC_ARCHIVE_ITEMS_SCHEMA_V2,
  createGenericArchiveItemV2,
  isGenericArchiveItemsDocument,
  isGenericArchiveItemsDocumentV1,
  parseGenericArchiveItemsDocument,
  type GenericArchiveItemV2,
} from '../agent-portability-archive-v2';

function sourceRef(objectType: string, id: string) {
  return {
    namespace: 'fixture.generic-archive',
    objectType,
    id,
  };
}

function preferenceV2(
  id: string,
  key: string,
  value: string,
): Omit<Extract<GenericArchiveItemV2, { itemType: 'preference' }>, 'sourceDigest'> {
  return {
    itemType: 'preference',
    sourceRef: sourceRef('preference', id),
    sensitivity: 'owner',
    confidence: 1,
    lossiness: 'lossless',
    retention: 'owner_managed',
    payload: { key, value },
  };
}

describe('generic archive items v2 contract', () => {
  test('parses a v1 archive as preference items', () => {
    const document = {
      schemaVersion: GENERIC_ARCHIVE_ITEMS_SCHEMA_V1,
      items: [
        {
          sourceObjectRef: sourceRef('preference', 'pref-1'),
          itemType: 'preference',
          payload: { key: 'tone', value: 'concise' },
        },
        {
          sourceObjectRef: sourceRef('preference', 'pref-2'),
          itemType: 'preference',
          payload: { key: 'city', value: 'Shanghai' },
        },
      ],
    };

    expect(isGenericArchiveItemsDocumentV1(document)).toBe(true);
    const parsed = parseGenericArchiveItemsDocument(document);
    expect(parsed.valid).toBe(true);
    expect(parsed.schemaVersion).toBe(GENERIC_ARCHIVE_ITEMS_SCHEMA_V1);
    expect(parsed.items.map((item) => item.itemType)).toEqual(['preference', 'preference']);
    expect(parsed.items.map((item) => item.payload)).toEqual([
      { key: 'tone', value: 'concise' },
      { key: 'city', value: 'Shanghai' },
    ]);
    expect(parsed.unsupported).toEqual([]);
  });

  test('parses a v2 archive with first-wave typed items', () => {
    const items = [
      createGenericArchiveItemV2(preferenceV2('pref-1', 'tone', 'concise')),
      createGenericArchiveItemV2({
        itemType: 'instruction',
        sourceRef: sourceRef('instruction', 'rule-1'),
        sensitivity: 'owner',
        confidence: 1,
        lossiness: 'lossless',
        retention: 'owner_managed',
        payload: { text: 'Ask before side effects.', filename: 'CLAUDE.md' },
      }),
      createGenericArchiveItemV2({
        itemType: 'memory',
        sourceRef: sourceRef('memory', 'mem-1'),
        sensitivity: 'owner',
        confidence: 1,
        lossiness: 'lossless',
        retention: 'owner_managed',
        payload: { content: 'User prefers concise answers' },
      }),
      createGenericArchiveItemV2({
        itemType: 'conversation',
        sourceRef: sourceRef('conversation', 'chat-1'),
        sensitivity: 'owner',
        confidence: 0.8,
        lossiness: 'summary_only',
        retention: 'archived_only',
        payload: { title: 'Trip', excerpt: 'user: Plan Kyoto', messageCount: 2 },
      }),
      createGenericArchiveItemV2({
        itemType: 'project',
        sourceRef: sourceRef('project', 'proj-1'),
        sensitivity: 'owner',
        confidence: 1,
        lossiness: 'lossless',
        retention: 'owner_managed',
        payload: { title: 'Kyoto weekend', instructions: 'Keep the itinerary together.', fileNames: ['itinerary.md'] },
      }),
      createGenericArchiveItemV2({
        itemType: 'knowledge',
        sourceRef: sourceRef('knowledge', 'doc-1'),
        sensitivity: 'owner',
        confidence: 1,
        lossiness: 'lossless',
        retention: 'owner_managed',
        payload: { title: 'README.md', content: 'Just docs about the Kyoto weekend.', citation: 'repo/README.md' },
      }),
      createGenericArchiveItemV2({
        itemType: 'mcp_config',
        sourceRef: sourceRef('mcp_config', 'mcp-1'),
        sensitivity: 'owner',
        confidence: 1,
        lossiness: 'partial',
        retention: 'owner_managed',
        payload: { name: 'github', command: 'npx -y @modelcontextprotocol/server-github', envKeys: ['GITHUB_TOKEN'], redactedKeys: ['GITHUB_TOKEN'] },
      }),
      createGenericArchiveItemV2({
        itemType: 'workflow',
        sourceRef: sourceRef('workflow', 'wf-1'),
        sensitivity: 'owner',
        confidence: 1,
        lossiness: 'partial',
        retention: 'owner_managed',
        payload: { name: 'Morning digest', triggerType: 'schedule' },
      }),
    ];

    const parsed = parseGenericArchiveItemsDocument({
      schemaVersion: GENERIC_ARCHIVE_ITEMS_SCHEMA_V2,
      items,
    });
    expect(isGenericArchiveItemsDocument({ schemaVersion: GENERIC_ARCHIVE_ITEMS_SCHEMA_V2, items })).toBe(true);
    expect(parsed.valid).toBe(true);
    expect(parsed.schemaVersion).toBe(GENERIC_ARCHIVE_ITEMS_SCHEMA_V2);
    expect(parsed.items.map((item) => item.itemType)).toEqual([
      'preference',
      'instruction',
      'memory',
      'conversation',
      'project',
      'knowledge',
      'mcp_config',
      'workflow',
    ]);
    expect(parsed.unsupported).toEqual([]);
  });

  test('unknown item types safe-degrade instead of crashing', () => {
    const parsed = parseGenericArchiveItemsDocument({
      schemaVersion: GENERIC_ARCHIVE_ITEMS_SCHEMA_V2,
      items: [
        createGenericArchiveItemV2(preferenceV2('pref-1', 'tone', 'concise')),
        {
          itemType: 'vendor_custom_skill',
          sourceRef: sourceRef('skill', 'skill-1'),
          sourceDigest: createGenericArchiveItemV2(preferenceV2('pref-1', 'tone', 'concise')).sourceDigest,
          sensitivity: 'owner',
          confidence: 1,
          lossiness: 'unknown',
          retention: 'unknown',
          payload: { vendorField: 'kept only in staged bytes' },
        },
      ],
    });

    expect(parsed.valid).toBe(true);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].itemType).toBe('preference');
    expect(parsed.unsupported).toEqual([
      {
        itemIndex: 1,
        reasonCode: 'unknown_item_type',
        itemType: 'vendor_custom_skill',
        sourceRef: sourceRef('skill', 'skill-1'),
      },
    ]);
  });

  test('rejects secret-bearing payloads without throwing', () => {
    const parsed = parseGenericArchiveItemsDocument({
      schemaVersion: GENERIC_ARCHIVE_ITEMS_SCHEMA_V2,
      items: [
        createGenericArchiveItemV2(
          preferenceV2('pref-secret', 'api', 'sk-abcdefghijklmnopqrstuvwxyz0123456789'),
        ),
      ],
    });

    expect(parsed.valid).toBe(true);
    expect(parsed.items).toEqual([]);
    expect(parsed.unsupported[0]?.reasonCode).toBe('secret_prohibited');
  });

  test('unknown schema versions fail closed', () => {
    const parsed = parseGenericArchiveItemsDocument({
      schemaVersion: 'agentrix.generic-archive-items/9',
      items: [],
    });
    expect(parsed.valid).toBe(false);
    expect(parsed.items).toEqual([]);
    expect(parsed.issues.some((entry) => entry.code === 'unknown_schema')).toBe(true);
  });
});
