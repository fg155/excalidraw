import { ROUNDNESS, viewportCoordsToSceneCoords } from "@excalidraw/common";
import { pointFrom } from "@excalidraw/math";
import { ShapeCache, getFreedrawStrokeWidth } from "@excalidraw/element";

import type { LocalPoint } from "@excalidraw/math";
import type {
  ExcalidrawFreeDrawElement,
  ExcalidrawLineElement,
} from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import { getStraightInkWidth } from "../straightInk";

import { API } from "./helpers/api";
import { Keyboard, UI } from "./helpers/ui";
import { act, fireEvent, GlobalTestState, render } from "./test-utils";

import type { NormalizedZoomValue } from "../types";

const { h } = window;
const penId = 41;
const event = (x: number, y: number, pressure = 0.5, extra = {}) => ({
  pointerType: "pen",
  pointerId: penId,
  clientX: x,
  clientY: y,
  pressure,
  buttons: 1,
  button: 0,
  ...extra,
});
const down = (x: number, y: number, shiftKey = false, pressure = 0.5) =>
  fireEvent.pointerDown(
    GlobalTestState.interactiveCanvas,
    event(x, y, pressure, { shiftKey }),
  );
const move = (x: number, y: number, pressure = 0.5, extra = {}) =>
  fireEvent.pointerMove(
    GlobalTestState.interactiveCanvas,
    event(x, y, pressure, extra),
  );
const up = (x: number, y: number, extra = {}) =>
  fireEvent.pointerUp(
    GlobalTestState.interactiveCanvas,
    event(x, y, 0, { buttons: 0, ...extra }),
  );
const hold = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 550));
  });
const asLine = () => {
  expect(h.elements).toHaveLength(1);
  expect(h.elements[0].type).toBe("line");
  return h.elements[0] as ExcalidrawLineElement;
};

describe("straight ink pen input and rendered previews", () => {
  beforeEach(async () => {
    await render(
      <Excalidraw
        handleKeyboardGlobally
        initialData={{ appState: { paperGrid: "mixed" } }}
        straightInk={{
          version: 1,
          shift: true,
          hold: true,
          holdMs: 500,
          smoothLines: true,
        }}
      />,
    );
    UI.clickTool("freedraw");
  });

  it.each(["mouse", "pen"])(
    "renders the %s preview to the actual endpoint, identically to the released line",
    (pointerType) => {
      fireEvent.pointerDown(
        GlobalTestState.interactiveCanvas,
        event(20, 30, 0.5, { pointerType, shiftKey: true }),
      );
      move(160, 83, 0.75, { pointerType });
      const preview = asLine();
      expect(preview.points).toEqual([
        [0, 0],
        [140, 53],
      ]);
      expect(preview.roughness).toBe(0);
      const shape = ShapeCache.generateElementShape(preview, null);
      // Inspect rendered operations, not only model coordinates: this catches
      // the former two-point freedraw streamline truncation.
      const ends = shape
        .flatMap((drawing) => drawing.sets.flatMap((set) => set.ops))
        .filter((op) => op.op === "bcurveTo")
        .map((op) => op.data.slice(-2));
      expect(ends.length).toBeGreaterThan(0);
      expect(ends.every((end) => end[0] === 140 && end[1] === 53)).toBe(true);
      up(160, 83, { pointerType });
      expect(ShapeCache.generateElementShape(asLine(), null)).toEqual(shape);
      expect(h.state.activeTool.type).toBe("freedraw");
    },
  );

  it("renders one smooth path visually even after bending the midpoint", () => {
    down(20, 30, true);
    move(220, 30);
    up(220, 30);
    const line = asLine();
    act(() =>
      h.app.scene.mutateElement(line, {
        points: [
          pointFrom<LocalPoint>(0, 0),
          pointFrom<LocalPoint>(100, 35),
          pointFrom<LocalPoint>(200, 0),
        ],
        roundness: { type: ROUNDNESS.PROPORTIONAL_RADIUS },
      }),
    );
    const shape = ShapeCache.generateElementShape(line, null);
    const paths: unknown[][] = [];
    for (const op of shape[0].sets[0].ops) {
      if (op.op === "move") {
        paths.push([]);
      }
      paths[paths.length - 1].push(op);
    }
    // RoughJS can repeat a path, but with roughness=0 the paths coincide exactly.
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path).toEqual(paths[0]);
    }
    expect(line.polygon).toBe(false);
  });

  it.each(["shift", "hold"])(
    "keeps %s line width comparable to custom-width pen ink through release",
    async (mode) => {
      API.setAppState({ currentItemCustomStrokeWidth: 8 });
      down(20, 30, mode === "shift", 0.1);
      const source = h.elements[0] as ExcalidrawFreeDrawElement;
      expect(source.strokeWidth).toBe(4);
      move(80, 30, 0.7);
      move(180, 30, 0.7);
      const expected =
        mode === "shift"
          ? getFreedrawStrokeWidth(source, 0.7)
          : getStraightInkWidth(h.elements[0] as ExcalidrawFreeDrawElement);
      if (mode === "hold") {
        await hold();
      }
      expect(asLine().strokeWidth).toBeCloseTo(expected);
      expect(asLine().strokeWidth).toBeGreaterThan(4);
      move(220, 30, mode === "hold" ? 0.1 : 0.7);
      const width = asLine().strokeWidth;
      up(220, 30);
      expect(asLine().strokeWidth).toBeCloseTo(width);
      expect(width).toBeCloseTo(expected);
      expect(h.state.currentItemCustomStrokeWidth).toBe(8);
    },
  );

  it("starts the ordinary line tool clean without changing other tool preferences", () => {
    API.setAppState({ currentItemRoughness: 2 });
    UI.clickTool("line");
    down(20, 30);
    move(220, 30);
    up(220, 30);
    expect(asLine().roughness).toBe(0);
    expect(h.state.currentItemRoughness).toBe(2);
    UI.clickTool("rectangle");
    down(250, 50);
    move(330, 100);
    up(330, 100);
    expect(h.elements[1].roughness).toBe(2);
  });

  it("keeps real pen pressure including a first sample of exactly 0.5", () => {
    down(20, 30, false, 0.5);
    move(50, 65, 0.2);
    move(80, 25, 0.8);
    up(110, 80);
    const ink = h.elements[0] as ExcalidrawFreeDrawElement;
    expect(ink.type).toBe("freedraw");
    expect(ink.simulatePressure).toBe(false);
    expect(ink.pressures).toEqual([0.5, 0.2, 0.8, 0]);
    expect(ink.strokeOptions).toEqual({
      variability: "variable",
      streamline: 0.2,
    });
  });

  it("honors an explicitly selected constant-width pen mode", () => {
    API.setAppState({
      penDetected: true,
      penMode: true,
      currentItemStrokeVariability: "constant",
    });
    down(20, 30);
    move(80, 60, 0.8);
    up(100, 90);
    expect(
      (h.elements[0] as ExcalidrawFreeDrawElement).strokeOptions.variability,
    ).toBe("constant");
  });

  it("does not change pen defaults when making a smooth line", () => {
    API.setAppState({
      currentItemRoughness: 2,
      currentItemStrokeColor: "#e03131",
      currentItemOpacity: 55,
    });
    down(20, 30, true, 0.2);
    move(160, 83, 0.9);
    up(160, 83);
    const line = asLine();
    expect(line.roughness).toBe(0);
    expect(line.strokeColor).toBe("#e03131");
    expect(line.opacity).toBe(55);
    expect(h.state.currentItemRoughness).toBe(2);
    expect(h.state.currentItemStrokeVariability).toBe("variable");
    down(200, 200, false, 0.3);
    move(230, 260, 0.7);
    up(260, 240);
    expect(h.elements[1].type).toBe("freedraw");
    expect((h.elements[1] as ExcalidrawFreeDrawElement).pressures).toEqual([
      0.3, 0.7, 0,
    ]);
  });

  it("holds a pen stroke into a real line, then tracks a negative endpoint and commits once", async () => {
    down(50, 60, false, 0.2);
    move(100, 61, 0.6);
    move(150, 60, 0.8);
    await hold();
    expect(asLine().points).toEqual([
      [0, 0],
      [100, 0],
    ]);
    move(10, 15, 0.4);
    const preview = asLine();
    expect([preview.x, preview.y]).toEqual([50, 60]);
    expect(preview.points).toEqual([
      [0, 0],
      [-40, -45],
    ]);
    up(10, 15);
    expect(asLine().points).toEqual(preview.points);
    Keyboard.undo();
    expect(h.elements.filter((el) => !el.isDeleted)).toHaveLength(0);
    Keyboard.redo();
    expect(h.elements.filter((el) => !el.isDeleted)).toHaveLength(1);
  });

  it.each([0.5, 2])("matches pen coordinates at zoom %s", (zoom) => {
    API.setAppState({
      zoom: { value: zoom as NormalizedZoomValue },
      scrollX: 37,
      scrollY: -12,
    });
    const origin = viewportCoordsToSceneCoords(
      { clientX: 90, clientY: 80 },
      h.state,
    );
    down(90, 80, true);
    move(170, 121);
    const end = viewportCoordsToSceneCoords(
      { clientX: 170, clientY: 121 },
      h.state,
    );
    const preview = asLine();
    expect([preview.x, preview.y]).toEqual([origin.x, origin.y]);
    expect(preview.points[1]).toEqual([end.x - origin.x, end.y - origin.y]);
    up(170, 121);
  });

  it("ignores palm and unrelated pointer events during pen input", () => {
    down(20, 30, true);
    move(120, 65);
    const unrelated = { pointerType: "touch", pointerId: 99 };
    fireEvent.pointerDown(
      GlobalTestState.interactiveCanvas,
      event(400, 400, 0.5, unrelated),
    );
    move(410, 410, 0.5, unrelated);
    up(410, 410, unrelated);
    fireEvent.pointerCancel(window, { pointerId: 99, pointerType: "touch" });
    expect(asLine().points).toEqual([
      [0, 0],
      [100, 35],
    ]);
    expect(h.state.newElement?.id).toBe(h.elements[0].id);
    move(160, 83);
    up(160, 83);
    expect(asLine().points).toEqual([
      [0, 0],
      [140, 53],
    ]);
  });

  it("never creates ink from pen hover before or after a completed stroke", () => {
    move(20, 30, 0, { buttons: 0 });
    expect(h.elements).toHaveLength(0);
    down(20, 30, true);
    move(120, 65);
    up(120, 65);
    move(300, 300, 0, { buttons: 0 });
    expect(asLine().points).toEqual([
      [0, 0],
      [100, 35],
    ]);
  });

  it.each(["pointercancel", "blur", "escape", "tool-change"])(
    "does not leave a line or stale hold timer after pen %s",
    async (kind) => {
      down(20, 30);
      move(70, 31);
      move(120, 30);
      if (kind === "pointercancel") {
        fireEvent.pointerCancel(window, {
          pointerId: penId,
          pointerType: "pen",
        });
      } else if (kind === "blur") {
        fireEvent.blur(window);
      } else if (kind === "escape") {
        Keyboard.keyPress("Escape");
      } else {
        act(() => h.app.setActiveTool({ type: "rectangle" }));
      }
      await hold();
      up(150, 40);
      expect(h.elements.filter((el) => !el.isDeleted)).toHaveLength(0);
    },
  );

  it("keeps the barrel button out of the straight-ink drawing path", () => {
    fireEvent.pointerDown(
      GlobalTestState.interactiveCanvas,
      event(20, 30, 0.5, { button: 2, buttons: 2, shiftKey: true }),
    );
    up(20, 30, { button: 2 });
    expect(h.elements).toHaveLength(0);
  });

  it("preserves the original pen eraser and restores the freehand tool", () => {
    API.setAppState({ width: 800, height: 600 });
    down(20, 30, true);
    move(220, 30);
    up(220, 30);
    fireEvent.pointerDown(
      GlobalTestState.interactiveCanvas,
      event(100, 10, 0.5, { button: 5, buttons: 32 }),
    );
    expect(h.state.activeTool.type).toBe("eraser");
    move(100, 30, 0.5, { button: -1, buttons: 32 });
    move(100, 50, 0.5, { button: -1, buttons: 32 });
    up(100, 50, { button: 5 });
    expect(h.elements.filter((el) => !el.isDeleted)).toHaveLength(0);
    expect(h.state.activeTool.type).toBe("freedraw");
  });

  it("does not snap or move a latched preview when Shift or Alt changes", () => {
    down(20, 30, true);
    move(160, 83);
    for (const key of ["Shift", "Alt"]) {
      fireEvent.keyDown(document, {
        key,
        shiftKey: key === "Shift",
        altKey: key === "Alt",
      });
      expect(asLine().points).toEqual([
        [0, 0],
        [140, 53],
      ]);
      expect([asLine().x, asLine().y]).toEqual([20, 30]);
      Keyboard.keyUp(key);
      expect(asLine().points).toEqual([
        [0, 0],
        [140, 53],
      ]);
    }
    up(160, 83);
  });

  it("does not convert curved pen ink after a pause or after pen release", async () => {
    down(20, 30, false, 0.2);
    move(70, 100, 0.6);
    move(120, 30, 0.8);
    await hold();
    expect(h.elements[0].type).toBe("freedraw");
    up(120, 30);
    down(200, 30, false, 0.3);
    move(300, 30, 0.7);
    up(300, 30);
    await hold();
    expect(h.elements.map((el) => el.type)).toEqual(["freedraw", "freedraw"]);
    expect((h.elements[1] as ExcalidrawFreeDrawElement).pressures).toEqual([
      0.3, 0.7, 0,
    ]);
  });
});
