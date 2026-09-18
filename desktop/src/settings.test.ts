import { describe, expect, it } from "vitest";

import { defaults, parseSettings } from "./settings";

describe("portable settings", () => {
  it("roundtrips preferences without device paths or arbitrary app state", () => {
    const parsed = parseSettings({
      ...defaults,
      directory: "C:/private",
      drawing: {
        currentItemStrokeWidthKey: "bold",
        currentItemStrokeColor: "#abcd",
        currentItemOpacity: 55,
        fileHandle: "private",
        width: 900,
      },
    });
    const exported = JSON.parse(JSON.stringify(parsed));
    expect(exported.directory).toBeUndefined();
    expect(exported.drawing).toEqual({
      currentItemStrokeWidthKey: "bold",
      currentItemStrokeColor: "#abcd",
      currentItemOpacity: 55,
    });
    expect(parseSettings(exported)).toEqual(parsed);
  });

  it("migrates unversioned preferences but rejects future versions", () => {
    expect(parseSettings({ ...defaults, version: undefined }).version).toBe(1);
    expect(() => parseSettings({ ...defaults, version: 2 })).toThrow();
  });

  it.each([
    { holdMs: 0 },
    { holdMs: Infinity },
    { theme: "anything" },
    { drawing: { currentItemOpacity: NaN } },
    { drawing: { currentItemRoughness: Infinity } },
    { drawing: { currentItemStrokeColor: "#12345" } },
    { drawing: { currentItemStrokeColor: "url(https://example.org)" } },
    { drawing: { currentItemStrokeWidthKey: "huge" } },
  ])("rejects invalid settings: %j", (patch) => {
    expect(() => parseSettings({ ...defaults, ...patch })).toThrow();
  });
});
