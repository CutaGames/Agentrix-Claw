import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getLocalLlamaModelPathCandidates,
  resolveLocalLlamaContextInitOptions,
} from './llamaContextConfig.service';

describe('llamaContextConfig', () => {
  it('keeps Android local contexts CPU-first to avoid unsupported OpenCL loads', () => {
    assert.deepEqual(resolveLocalLlamaContextInitOptions('text', 'primary', 'android'), {
      n_ctx: 2048,
      n_gpu_layers: 0,
      use_mlock: false,
    });

    assert.deepEqual(resolveLocalLlamaContextInitOptions('multimodal', 'fallback', 'android'), {
      n_ctx: 3072,
      n_gpu_layers: 0,
      use_mlock: false,
      ctx_shift: false,
    });
  });

  it('keeps iOS on the larger primary profile and falls back conservatively', () => {
    assert.deepEqual(resolveLocalLlamaContextInitOptions('text', 'primary', 'ios'), {
      n_ctx: 2048,
      n_gpu_layers: 99,
      use_mlock: true,
    });

    assert.deepEqual(resolveLocalLlamaContextInitOptions('speech', 'fallback', 'ios'), {
      n_ctx: 3072,
      n_gpu_layers: 0,
      use_mlock: false,
      ctx_shift: false,
    });
  });

  it('tries both file-uri and raw-path candidates for local model files', () => {
    assert.deepEqual(
      getLocalLlamaModelPathCandidates('file:///data/user/0/app/files/models/gemma.gguf'),
      [
        'file:///data/user/0/app/files/models/gemma.gguf',
        '/data/user/0/app/files/models/gemma.gguf',
      ],
    );
  });
});