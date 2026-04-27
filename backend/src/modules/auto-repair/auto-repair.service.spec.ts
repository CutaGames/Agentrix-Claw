import { AutoRepairService } from './auto-repair.service';

describe('AutoRepairService', () => {
  let service: AutoRepairService;

  beforeEach(() => {
    service = new AutoRepairService();
  });

  it('parses TypeScript and Rust diagnostics into normalized locations', () => {
    const diagnostics = service.parseDiagnostics({
      exitCode: 1,
      stdout: [
        'src/app.ts(12,8): error TS2304: Cannot find name \'foo\'.',
        'error[E0425]: cannot find value `foo` in this scope',
        '  --> src/main.rs:7:13',
      ].join('\n'),
    });

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'typescript',
        file: 'src/app.ts',
        line: 12,
        column: 8,
        code: 'TS2304',
      }),
      expect.objectContaining({
        source: 'rust',
        file: 'src/main.rs',
        line: 7,
        column: 13,
        code: 'E0425',
      }),
    ]));
  });

  it('runs command, generates a patch, applies it, and retries until passing', async () => {
    let runCount = 0;
    const appliedPatches: string[] = [];

    const result = await service.runRepairLoop({
      command: 'npm test',
      maxAttempts: 3,
      runCommand: async () => {
        runCount += 1;
        if (runCount === 1) {
          return {
            exitCode: 1,
            stdout: 'src/repair.ts(4,12): error TS2322: Type \'string\' is not assignable to type \'number\'.',
          };
        }
        return { exitCode: 0, stdout: 'ok' };
      },
      generatePatch: async ({ diagnostics, repairPrompt }) => ({
        summary: `Fix ${diagnostics[0].code}`,
        patches: [{
          file: diagnostics[0].file || 'unknown',
          description: repairPrompt.includes('TS2322') ? 'Correct type mismatch' : 'Unknown fix',
          unifiedDiff: '--- a/src/repair.ts\n+++ b/src/repair.ts',
        }],
      }),
      applyPatch: async patchPlan => {
        appliedPatches.push(patchPlan.summary);
      },
    });

    expect(result.status).toBe('passed');
    expect(result.attempts.map(attempt => attempt.status)).toEqual(['patched', 'passed']);
    expect(appliedPatches).toEqual(['Fix TS2322']);
  });

  it('returns a repair prompt when no patch generator is wired', async () => {
    const result = await service.runRepairLoop({
      command: 'cargo check',
      runCommand: async () => ({
        exitCode: 1,
        stderr: 'error[E0425]: cannot find value `x` in this scope\n  --> src/lib.rs:2:5',
      }),
    });

    expect(result.status).toBe('needs_patch_generator');
    expect(result.finalDiagnostics[0]).toEqual(expect.objectContaining({ source: 'rust', code: 'E0425' }));
  });
});