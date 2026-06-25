/**
 * Sprint P-7 phases 3-5 (2026-05-22) — petVariant resolver tests.
 *
 * Mirrors the desktop bus test pattern: pure JS unit tests that don't
 * pull in React or the sprite renderer.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  buildVariantCandidates,
  getPetVariant,
  setPetVariant,
  subscribePetVariant,
  _internalResetForTests,
} from "../services/petVariant";

beforeEach(() => {
  _internalResetForTests();
});

describe("buildVariantCandidates", () => {
  it("returns just default when variant is empty", () => {
    expect(buildVariantCandidates("idle", {})).toEqual([
      "/pets/sprites/default/idle.png",
    ]);
  });

  it("prepends clan candidate when only clan is set", () => {
    expect(buildVariantCandidates("idle", { clan: "A_office" })).toEqual([
      "/pets/sprites/A_office/idle.png",
      "/pets/sprites/default/idle.png",
    ]);
  });

  it("prepends skin candidate when only skin is set", () => {
    expect(buildVariantCandidates("idle", { skin: "academy" })).toEqual([
      "/pets/sprites/academy/idle.png",
      "/pets/sprites/default/idle.png",
    ]);
  });

  it("prepends festival candidate when only festival is set", () => {
    expect(buildVariantCandidates("idle", { festival: "spring" })).toEqual([
      "/pets/sprites/default/spring/idle.png",
      "/pets/sprites/default/idle.png",
    ]);
  });

  it("most-specific to least-specific when all three are set", () => {
    expect(
      buildVariantCandidates("talk", {
        clan: "A_office",
        skin: "academy",
        festival: "spring",
      }),
    ).toEqual([
      "/pets/sprites/A_office/academy/spring/talk.png",
      "/pets/sprites/A_office/academy/talk.png",
      "/pets/sprites/A_office/spring/talk.png",
      "/pets/sprites/A_office/talk.png",
      "/pets/sprites/academy/spring/talk.png",
      "/pets/sprites/academy/talk.png",
      "/pets/sprites/default/spring/talk.png",
      "/pets/sprites/default/talk.png",
    ]);
  });
});

describe("petVariant store", () => {
  it("starts empty", () => {
    expect(getPetVariant()).toEqual({});
  });

  it("setPetVariant patches and notifies subscribers", () => {
    const seen: any[] = [];
    subscribePetVariant((v) => seen.push(v));
    setPetVariant({ clan: "A_office" });
    expect(getPetVariant()).toEqual({ clan: "A_office" });
    setPetVariant({ skin: "academy" });
    expect(getPetVariant()).toEqual({ clan: "A_office", skin: "academy" });
    expect(seen).toEqual([{ clan: "A_office" }, { clan: "A_office", skin: "academy" }]);
  });

  it("strips undefined fields when serializing", () => {
    setPetVariant({ clan: "A_office", skin: undefined, festival: "spring" });
    expect(getPetVariant()).toEqual({ clan: "A_office", festival: "spring" });
  });

  it("unsubscribe stops further callbacks", () => {
    const seen: any[] = [];
    const off = subscribePetVariant((v) => seen.push(v));
    setPetVariant({ clan: "A_office" });
    off();
    setPetVariant({ skin: "academy" });
    expect(seen.length).toBe(1);
  });
});
