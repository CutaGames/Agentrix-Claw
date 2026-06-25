/**
 * Build artifact smoke test (Sprint P-1/P-2/P-3 verification).
 *
 * Unlike the other e2e files which connect via CDP to a live webview,
 * this one validates the *static* product bundle from a fresh build
 * lands the right files in the right places. It catches bundling
 * regressions (sprite assets dropped, version not bumped, GLB bloat
 * crept back, etc.) without needing a running Tauri exe.
 *
 * Run after `npm run tauri build` from `desktop/`.
 *
 *   cd desktop && npx playwright test tests/e2e/pet-build-smoke.spec.ts
 */
import { test, expect } from "@playwright/test";
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..", "..");
const SRC_TAURI = path.join(ROOT, "src-tauri");
const BUNDLE = path.join(SRC_TAURI, "target", "release", "bundle");
const SPRITES = path.join(ROOT, "public", "pets", "sprites", "default");

test.describe("§A bundle artifacts", () => {
  test("A-1: NSIS .exe is produced and ≥ 20 MB", () => {
    const nsisDir = path.join(BUNDLE, "nsis");
    expect(existsSync(nsisDir)).toBe(true);
    const exes = readdirSync(nsisDir).filter((f) => f.endsWith("-setup.exe"));
    expect(exes.length).toBeGreaterThan(0);
    // Pick the highest-version exe filename (lex sort works because
    // names look like `Agentrix Desktop_0.3.0_x64-setup.exe`).
    const latest = exes.sort().pop()!;
    const sizeMB = statSync(path.join(nsisDir, latest)).size / (1024 * 1024);
    expect(sizeMB).toBeGreaterThan(20);
    expect(sizeMB).toBeLessThan(50); // sanity ceiling — guard against
                                      // the 21 MB GLB sneaking back in
                                      // and bloating the installer
                                      // beyond a reasonable target.
  });

  test("A-2: MSI is produced and roughly tracks the NSIS size", () => {
    const msiDir = path.join(BUNDLE, "msi");
    expect(existsSync(msiDir)).toBe(true);
    const msis = readdirSync(msiDir).filter((f) => f.endsWith(".msi"));
    expect(msis.length).toBeGreaterThan(0);
    const latest = msis.sort().pop()!;
    const sizeMB = statSync(path.join(msiDir, latest)).size / (1024 * 1024);
    expect(sizeMB).toBeGreaterThan(20);
    expect(sizeMB).toBeLessThan(50);
  });

  test("A-3: latest exe filename matches version 0.4.5 (Sprint P-7 r8 menu root cause fix)", () => {
    const nsisDir = path.join(BUNDLE, "nsis");
    const exes = readdirSync(nsisDir).filter((f) => f.endsWith("-setup.exe"));
    const latest = exes.sort().pop()!;
    expect(latest).toContain("0.4.5");
  });
});

test.describe("§B sprite shipping", () => {
  test("B-1: all 13 sprites are present in public/pets/sprites/default", () => {
    const required = [
      "walk.png", "idle.png", "sleep.png", "sit.png", "jump.png", "eat.png",
      "listen.png", "talk.png",
      "pro-thinking.png", "pro-typing.png", "pro-done.png",
      "cu-mouse.png", "alert.png",
    ];
    for (const name of required) {
      const p = path.join(SPRITES, name);
      expect(existsSync(p), `${name} missing`).toBe(true);
      const sizeKB = statSync(p).size / 1024;
      // Each sprite should be ~80–700 KB. Below 50 KB suggests a
      // truncated download or a 1×1 placeholder.
      expect(sizeKB).toBeGreaterThan(50);
      expect(sizeKB).toBeLessThan(2000);
    }
  });

  test("B-2: sprites are RGBA PNG (not white-background RGB)", () => {
    // PNG signature + IHDR colorType byte at offset 25.
    // colorType 6 = RGBA; colorType 2 = RGB without alpha.
    for (const name of ["talk.png", "cu-mouse.png", "alert.png"]) {
      const buf = readFileSync(path.join(SPRITES, name));
      // Signature
      expect(buf[0]).toBe(0x89);
      expect(buf[1]).toBe(0x50); // 'P'
      expect(buf[2]).toBe(0x4e); // 'N'
      // IHDR colorType
      expect(buf[25], `${name} should be RGBA (colorType 6)`).toBe(6);
    }
  });

  test("B-3: flood-fill leaves interior body pixels opaque (no belly holes)", () => {
    // Sprint P-1.1 (2026-05-21) regression: v10 used a per-pixel
    // threshold which could mark interior-white-fur pixels alpha=0,
    // creating "black holes" on dark desktops. v11 uses corner-seed
    // flood fill so any white pixel not reachable from a corner stays
    // opaque. We probe the rough center of each idle frame to verify
    // it's NOT transparent.
    const buf = readFileSync(path.join(SPRITES, "idle.png"));
    const png = PNG.sync.read(buf);
    // idle is 4 frames × 256 px wide. The first frame center is at
    // roughly (128, 160) — inside the pet body. Sample a 6×6 patch
    // and assert majority is opaque (alpha ≥ 200).
    let opaque = 0;
    let total = 0;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const x = 128 + dx;
        const y = 160 + dy;
        const idx = (y * png.width + x) * 4 + 3;
        total++;
        if (png.data[idx] >= 200) opaque++;
      }
    }
    expect(opaque, `idle center patch ${opaque}/${total} opaque`).toBeGreaterThan(total * 0.7);
  });
});

test.describe("§C version metadata", () => {
  test("C-1: package.json + Cargo.toml + tauri.conf.json all on 0.4.5", () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf-8"));
    const cargo = readFileSync(path.join(SRC_TAURI, "Cargo.toml"), "utf-8");
    const tauri = JSON.parse(readFileSync(path.join(SRC_TAURI, "tauri.conf.json"), "utf-8"));
    expect(pkg.version).toBe("0.4.5");
    expect(cargo).toMatch(/^version\s*=\s*"0\.4\.5"/m);
    expect(tauri.version).toBe("0.4.5");
  });

  test("C-2: tauri.conf.json includes pet-companion in capabilities", () => {
    const cap = JSON.parse(
      readFileSync(path.join(SRC_TAURI, "capabilities", "default.json"), "utf-8"),
    );
    expect(cap.windows).toContain("pet-companion");
  });
});

test.describe("§D no GLB bloat regression", () => {
  test("D-1: bundled kitsune-default-v3.glb is the size we expect", () => {
    // The GLB itself stays in the bundle (~21 MB) but Sprint P-1 disabled
    // auto-seed at runtime. This test guards against accidentally
    // re-enabling auto-seed AND swapping to an even larger GLB without
    // the gltf-transform pipeline.
    const glb = path.join(ROOT, "public", "pets", "kitsune-default-v3.glb");
    if (!existsSync(glb)) {
      // OK if the GLB was removed entirely — even better.
      return;
    }
    const sizeMB = statSync(glb).size / (1024 * 1024);
    expect(sizeMB).toBeLessThan(30);
  });
});
