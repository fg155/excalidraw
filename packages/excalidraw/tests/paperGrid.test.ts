import { describe, expect, it, vi } from "vitest";

import { serializeAsJSON } from "../data/json";
import { restoreAppState } from "../data/restore";
import { exportToSvg, exportToCanvas } from "../index";
import {
  PAPER_GRID_STYLES,
  normalizePaperGrid,
  paperInk,
  paperPattern,
  visitPaperGrid,
  renderPaperGrid,
} from "../paperGrid";

import { API } from "./helpers/api";

describe("paper backgrounds", () => {
  it.each(PAPER_GRID_STYLES)(
    "round-trips %s without changing snapping or pen preferences",
    (paperGrid) => {
      const original = restoreAppState(
        { paperGrid, penMode: true, gridModeEnabled: false },
        null,
      );
      const json = JSON.parse(serializeAsJSON([], original, {}, "local"));
      const restored = restoreAppState(json.appState, original);
      expect(restored.paperGrid).toBe(paperGrid);
      expect(restored.gridModeEnabled).toBe(false);
      expect(restored.penMode).toBe(true);
    },
  );

  it("opens older files and rejects invalid styles", () => {
    expect(restoreAppState({}, null).paperGrid).toBe("none");
    for (const value of [undefined, null, {}, 1, "__proto__", "unknown"]) {
      expect(normalizePaperGrid(value)).toBe("none");
    }
    expect(
      restoreAppState({ paperGrid: "bad" as "none" }, null).paperGrid,
    ).toBe("none");
  });

  it("anchors positive and negative pans to the same world lattice", () => {
    const line = vi.fn();
    visitPaperGrid("square", 64, 64, -7, 9, line, vi.fn());
    expect(line).toHaveBeenCalledWith(25, 0, 25, 64, 0.18);
    expect(line).toHaveBeenCalledWith(0, 9, 64, 9, 0.18);
    const dot = vi.fn();
    visitPaperGrid("dots", 48, 48, -7, 9, vi.fn(), dot);
    expect(dot.mock.calls).toEqual([
      [17, 9],
      [17, 33],
      [41, 9],
      [41, 33],
    ]);
  });

  it("distinguishes density, major lines and diagonal families", () => {
    expect(paperPattern("graph").width).toBeLessThan(
      paperPattern("square").width,
    );
    expect(paperPattern("narrow").height).toBeLessThan(
      paperPattern("ruled").height,
    );
    expect(
      new Set(paperPattern("mixed").families.map((line) => line.opacity)).size,
    ).toBe(2);
    expect(paperPattern("diamond").families).toHaveLength(2);
    expect(paperPattern("triangle").families).toHaveLength(3);
  });

  it("contrasts with both white and black paper, including dark theme", () => {
    expect(paperInk("#ffffff")).toBe("#000000");
    expect(paperInk("#202020")).toBe("#ffffff");
    expect(paperInk("#ffffff", true)).toBe("#ffffff");
  });

  it("bounds work at extreme zoom-out and restores canvas state", () => {
    const context = document.createElement("canvas").getContext("2d")!;
    const stroke = vi.spyOn(context, "stroke");
    const arc = vi.spyOn(context, "arc");
    renderPaperGrid(context, {
      style: "dots",
      background: "#fff",
      width: 100000,
      height: 100000,
      zoom: 0.01,
    });
    expect(arc).not.toHaveBeenCalled();
    expect(stroke).not.toHaveBeenCalled();
    context.globalAlpha = 0.7;
    renderPaperGrid(context, {
      style: "square",
      background: "#fff",
      width: 100,
      height: 100,
    });
    expect(stroke).toHaveBeenCalled();
    expect(context.globalAlpha).toBe(0.7);
  });

  it.each(PAPER_GRID_STYLES.filter((style) => style !== "none"))(
    "exports %s to SVG only when background is included",
    async (paperGrid) => {
      const elements = [
        API.createElement({
          type: "rectangle",
          x: -23,
          y: 15,
          width: 140,
          height: 90,
        }),
      ];
      const svg = await exportToSvg({
        elements,
        files: {},
        appState: { paperGrid, exportBackground: true },
      });
      const pattern = svg.querySelector("pattern")!;
      expect(pattern).not.toBeNull();
      expect(pattern.getAttribute("patternUnits")).toBe("userSpaceOnUse");
      expect(pattern.children.length).toBeGreaterThan(0);
      const transparent = await exportToSvg({
        elements,
        files: {},
        appState: { paperGrid, exportBackground: false },
      });
      expect(transparent.querySelector("pattern")).toBeNull();
    },
  );

  it("exports paper to raster without contaminating transparent exports", async () => {
    const elements = [
      API.createElement({ type: "rectangle", width: 140, height: 90 }),
    ];
    const arc = vi.spyOn(CanvasRenderingContext2D.prototype, "arc");
    await exportToCanvas({
      elements,
      files: {},
      appState: { paperGrid: "dots", exportBackground: true },
    });
    expect(arc).toHaveBeenCalled();
    arc.mockClear();
    await exportToCanvas({
      elements,
      files: {},
      appState: { paperGrid: "dots", exportBackground: false },
    });
    expect(arc).not.toHaveBeenCalled();
    arc.mockRestore();
  });
});
