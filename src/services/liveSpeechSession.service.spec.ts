import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildLiveSpeechStartOptions,
  createSpeechRecognitionSessionController,
  type SpeechRecognitionModuleLike,
} from './liveSpeechSession.service';

class FakeSpeechModule implements SpeechRecognitionModuleLike {
  public listeners = new Map<string, Array<(event?: any) => void>>();
  public startedOptions: any = null;
  public stopCalled = false;
  public abortCalled = false;

  addListener(eventName: string, listener: (event?: any) => void) {
    const current = this.listeners.get(eventName) || [];
    current.push(listener);
    this.listeners.set(eventName, current);
    return {
      remove: () => {
        const next = (this.listeners.get(eventName) || []).filter((item) => item !== listener);
        this.listeners.set(eventName, next);
      },
    };
  }

  start(options: any) {
    this.startedOptions = options;
  }

  stop() {
    this.stopCalled = true;
  }

  abort() {
    this.abortCalled = true;
  }

  getSpeechRecognitionServices() {
    return ['com.google.android.tts', 'com.samsung.android.bixby.agent'];
  }

  getDefaultRecognitionService() {
    return { packageName: 'com.samsung.android.bixby.agent' };
  }

  supportsRecording() {
    return true;
  }

  emit(eventName: string, event?: any) {
    for (const listener of this.listeners.get(eventName) || []) {
      listener(event);
    }
  }
}

describe('liveSpeechSession', () => {
  it('keeps listeners alive through stop so the final result is still delivered', async () => {
    const module = new FakeSpeechModule();
    const seen: string[] = [];
    const controller = createSpeechRecognitionSessionController({
      module,
      callbacks: {
        onFinalResult: (transcript) => seen.push(transcript),
      },
      startOptions: buildLiveSpeechStartOptions({
        lang: 'zh',
        contextualStrings: ['Agentrix'],
        mode: 'hold',
        platformOs: 'android',
        platformVersion: 34,
        module,
      }),
    });

    const stopPromise = controller.stop();
    assert.equal(module.stopCalled, true);
    module.emit('result', { isFinal: true, results: [{ transcript: '你好 Agentrix' }] });
    module.emit('end');

    assert.deepEqual(await stopPromise, {
      transcript: '你好 Agentrix',
      audioUri: null,
    });
    assert.deepEqual(seen, ['你好 Agentrix']);
  });

  it('uses a dictation-friendly Android config and prefers Google speech services', () => {
    const module = new FakeSpeechModule();
    const options = buildLiveSpeechStartOptions({
      lang: 'zh',
      contextualStrings: ['Agentrix'],
      mode: 'hold',
      platformOs: 'android',
      platformVersion: 34,
      module,
    });

    assert.equal(options.lang, 'zh-CN');
    assert.equal(options.continuous, false);
    assert.equal(options.androidRecognitionServicePackage, 'com.google.android.tts');
    assert.deepEqual(options.androidIntentOptions, {
      EXTRA_LANGUAGE_MODEL: 'free_form',
      EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 1200,
      EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 700,
    });
    assert.deepEqual(options.recordingOptions, {
      persist: true,
      outputFileName: 'hold-speech.wav',
    });
  });
});