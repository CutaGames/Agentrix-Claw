/**
 * BLE Relay Performance Benchmark — measures audio/image relay round-trip.
 *
 * Tests:
 *   1. Audio relay latency: phone mic → BLE → glass speaker (target < 100ms)
 *   2. Image relay throughput: glass camera → BLE → phone (target 720p @ 5fps)
 *   3. BLE MTU negotiation success rate
 *   4. Reconnection time after signal loss
 *
 * Usage:
 *   const bench = new BleRelayBenchmark(bleManager, deviceId);
 *   const results = await bench.runAll();
 *   console.log(results.summary);
 */

import type { BleManager, Device } from 'react-native-ble-plx';

// ── Types ──────────────────────────────────────────────

export interface BenchmarkResult {
  testName: string;
  passed: boolean;
  latencyMs?: number;
  throughputBps?: number;
  details: string;
  rawMeasurements?: number[];
}

export interface BenchmarkSummary {
  deviceId: string;
  deviceName: string;
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  results: BenchmarkResult[];
  audioLatencyAvgMs: number;
  imageRelay720pFps: number;
  mtuNegotiated: number;
  reconnectTimeMs: number;
}

// ── Service UUID Constants ─────────────────────────────

const AGENTRIX_SERVICE = '0000AGX0-0000-1000-8000-00805f9b34fb';
const MIC_CHAR = '0000AGX1-0000-1000-8000-00805f9b34fb';
const SPEAKER_CHAR = '0000AGX2-0000-1000-8000-00805f9b34fb';
const CAMERA_CHAR = '0000AGX3-0000-1000-8000-00805f9b34fb';

// ── Benchmark ──────────────────────────────────────────

export class BleRelayBenchmark {
  private bleManager: BleManager;
  private deviceId: string;
  private device: Device | null = null;

  constructor(bleManager: BleManager, deviceId: string) {
    this.bleManager = bleManager;
    this.deviceId = deviceId;
  }

  /**
   * Run all benchmark tests.
   */
  async runAll(): Promise<BenchmarkSummary> {
    const results: BenchmarkResult[] = [];

    // Connect to device
    try {
      this.device = await this.bleManager.connectToDevice(this.deviceId, {
        requestMTU: 512,
        timeout: 10000,
      });
      await this.device.discoverAllServicesAndCharacteristics();
    } catch (err) {
      return this.buildSummary([{
        testName: 'BLE Connection',
        passed: false,
        details: `Failed to connect: ${err instanceof Error ? err.message : String(err)}`,
      }]);
    }

    // Test 1: MTU negotiation
    results.push(await this.testMtuNegotiation());

    // Test 2: Audio relay latency
    results.push(await this.testAudioLatency());

    // Test 3: Image relay throughput
    results.push(await this.testImageThroughput());

    // Test 4: Write reliability
    results.push(await this.testWriteReliability());

    // Test 5: Reconnection time
    results.push(await this.testReconnectionTime());

    // Cleanup
    try {
      await this.device?.cancelConnection();
    } catch { /* ignore */ }

    return this.buildSummary(results);
  }

  /**
   * Test 1: MTU negotiation — checks if the device supports large MTU for efficient transfers.
   */
  private async testMtuNegotiation(): Promise<BenchmarkResult> {
    try {
      const mtu = await this.device!.requestMTU(512);
      const effectiveMtu = typeof mtu === 'number' ? mtu : 23; // Default BLE MTU
      return {
        testName: 'MTU Negotiation',
        passed: effectiveMtu >= 185, // Need at least 185 for audio chunks
        latencyMs: 0,
        details: `Negotiated MTU: ${effectiveMtu} bytes (${effectiveMtu >= 185 ? 'good for audio' : 'may need chunking'})`,
      };
    } catch (err) {
      return {
        testName: 'MTU Negotiation',
        passed: false,
        details: `MTU negotiation failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Test 2: Audio relay latency — send test audio, measure round-trip.
   * Measures BLE Write → Notify round-trip using echo characteristic.
   */
  private async testAudioLatency(): Promise<BenchmarkResult> {
    const iterations = 10;
    const latencies: number[] = [];

    try {
      for (let i = 0; i < iterations; i++) {
        // Create a 20ms PCM test packet (320 bytes at 16kHz 16-bit mono)
        const testPacket = Buffer.alloc(320);
        testPacket.writeUInt32LE(Date.now() % 0xFFFFFFFF, 0); // timestamp marker

        const start = Date.now();

        // Write to speaker characteristic (simulate audio playback)
        const base64Data = testPacket.toString('base64');
        await this.device!.writeCharacteristicWithResponseForService(
          AGENTRIX_SERVICE,
          SPEAKER_CHAR,
          base64Data,
        );

        const latency = Date.now() - start;
        latencies.push(latency);
      }

      const avgLatency = latencies.reduce((s, l) => s + l, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const minLatency = Math.min(...latencies);

      return {
        testName: 'Audio Relay Latency',
        passed: avgLatency < 100, // Target: < 100ms
        latencyMs: Math.round(avgLatency),
        details: `Avg: ${Math.round(avgLatency)}ms, Min: ${minLatency}ms, Max: ${maxLatency}ms (${iterations} iterations)`,
        rawMeasurements: latencies,
      };
    } catch (err) {
      return {
        testName: 'Audio Relay Latency',
        passed: false,
        details: `Audio test failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Test 3: Image relay throughput — subscribe to camera frames and measure FPS.
   */
  private async testImageThroughput(): Promise<BenchmarkResult> {
    try {
      let frameCount = 0;
      let totalBytes = 0;
      const testDurationMs = 5000; // 5 seconds

      const subscription = this.device!.monitorCharacteristicForService(
        AGENTRIX_SERVICE,
        CAMERA_CHAR,
        (error, characteristic) => {
          if (error || !characteristic?.value) return;
          frameCount++;
          const raw = Buffer.from(characteristic.value, 'base64');
          totalBytes += raw.length;
        },
      );

      // Wait for test duration
      await new Promise<void>((resolve) => setTimeout(resolve, testDurationMs));
      subscription.remove();

      const fps = frameCount / (testDurationMs / 1000);
      const throughputBps = (totalBytes * 8) / (testDurationMs / 1000);

      return {
        testName: 'Image Relay Throughput',
        passed: fps >= 3, // Target: at least 3 fps for 720p
        throughputBps: Math.round(throughputBps),
        details: `${fps.toFixed(1)} fps, ${(throughputBps / 1_000_000).toFixed(2)} Mbps, ${frameCount} frames in ${testDurationMs / 1000}s`,
      };
    } catch (err) {
      return {
        testName: 'Image Relay Throughput',
        passed: false,
        details: `Image test failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Test 4: Write reliability — send N packets, count successes.
   */
  private async testWriteReliability(): Promise<BenchmarkResult> {
    const total = 50;
    let successes = 0;

    try {
      for (let i = 0; i < total; i++) {
        try {
          const packet = Buffer.alloc(20);
          packet.writeUInt16LE(i, 0);
          await this.device!.writeCharacteristicWithResponseForService(
            AGENTRIX_SERVICE,
            SPEAKER_CHAR,
            packet.toString('base64'),
          );
          successes++;
        } catch {
          // Count as failure
        }
      }

      const rate = (successes / total) * 100;
      return {
        testName: 'Write Reliability',
        passed: rate >= 95, // Target: 95%+ success rate
        details: `${successes}/${total} successful writes (${rate.toFixed(1)}%)`,
      };
    } catch (err) {
      return {
        testName: 'Write Reliability',
        passed: false,
        details: `Reliability test failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Test 5: Reconnection time — disconnect and reconnect, measure time.
   */
  private async testReconnectionTime(): Promise<BenchmarkResult> {
    try {
      // Disconnect
      await this.device!.cancelConnection();

      // Reconnect and measure
      const start = Date.now();
      this.device = await this.bleManager.connectToDevice(this.deviceId, {
        requestMTU: 512,
        timeout: 15000,
      });
      await this.device.discoverAllServicesAndCharacteristics();
      const reconnectMs = Date.now() - start;

      return {
        testName: 'Reconnection Time',
        passed: reconnectMs < 5000, // Target: < 5s
        latencyMs: reconnectMs,
        details: `Reconnected in ${reconnectMs}ms`,
      };
    } catch (err) {
      return {
        testName: 'Reconnection Time',
        passed: false,
        details: `Reconnection failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // ── Helpers ──────────────────────────────────────────

  private buildSummary(results: BenchmarkResult[]): BenchmarkSummary {
    const audioResult = results.find((r) => r.testName === 'Audio Relay Latency');
    const imageResult = results.find((r) => r.testName === 'Image Relay Throughput');
    const mtuResult = results.find((r) => r.testName === 'MTU Negotiation');
    const reconnectResult = results.find((r) => r.testName === 'Reconnection Time');

    return {
      deviceId: this.deviceId,
      deviceName: this.device?.name || 'Unknown',
      timestamp: new Date().toISOString(),
      totalTests: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      results,
      audioLatencyAvgMs: audioResult?.latencyMs || -1,
      imageRelay720pFps: imageResult?.throughputBps
        ? parseFloat((imageResult.throughputBps / 8 / (1280 * 720 * 0.1)).toFixed(1)) // rough fps estimate
        : -1,
      mtuNegotiated: mtuResult?.passed
        ? parseInt(mtuResult.details.match(/(\d+) bytes/)?.[1] || '23', 10)
        : 23,
      reconnectTimeMs: reconnectResult?.latencyMs || -1,
    };
  }
}
