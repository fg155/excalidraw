import {
  getFreedrawOutlinePoints,
  getFreedrawStrokeWidth,
} from "@excalidraw/element";
import { pointFrom } from "@excalidraw/math";

import { Excalidraw, CaptureUpdateAction } from "../index";
import { restoreAppState } from "../data/restore";
import { getStraightInkWidth } from "../straightInk";

import { API } from "./helpers/api";
import { UI } from "./helpers/ui";
import { render, screen, fireEvent } from "./test-utils";

const { h } = window;

describe("continuous stroke width", () => {
  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally />);
  });

  it("uses half-step widths for new pen strokes and can return to presets", () => {
    UI.clickTool("freedraw");
    fireEvent.change(screen.getByTestId("stroke-width-slider"), {
      target: { value: "7.5" },
    });
    expect(h.state.currentItemCustomStrokeWidth).toBe(7.5);
    const stroke = UI.createElement("freedraw", {
      x: 10,
      y: 10,
      width: 150,
      height: 20,
    });
    expect(stroke.get().strokeWidth).toBe(3.75);
    fireEvent.click(screen.getByTestId("strokeWidth-thin"));
    expect(h.state.currentItemCustomStrokeWidth).toBeNull();
    const next = UI.createElement("freedraw", {
      x: 200,
      y: 100,
      width: 150,
      height: 20,
    });
    expect(next.get().strokeWidth).toBe(0.5);
  });

  it("changes selected pen and line widths with undo/redo", () => {
    const line = API.createElement({ type: "line", strokeWidth: 2 });
    const pen = API.createElement({ type: "freedraw", strokeWidth: 1 });
    API.updateScene({
      elements: [line, pen],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    API.setSelectedElements([line, pen]);
    fireEvent.change(screen.getByTestId("stroke-width-slider"), {
      target: { value: "9" },
    });
    expect(h.elements.map((el) => el.strokeWidth)).toEqual([9, 4.5]);
    fireEvent.click(screen.getByTestId("button-undo"));
    expect(h.elements.map((el) => el.strokeWidth)).toEqual([2, 1]);
    fireEvent.click(screen.getByTestId("button-redo"));
    expect(h.elements.map((el) => el.strokeWidth)).toEqual([9, 4.5]);
  });

  it("validates restored settings and keeps old presets compatible", () => {
    expect(restoreAppState({}, null).currentItemCustomStrokeWidth).toBeNull();
    expect(
      restoreAppState({ currentItemCustomStrokeWidth: 7.5 }, null)
        .currentItemCustomStrokeWidth,
    ).toBe(7.5);
    for (const value of [NaN, Infinity, 0, 33]) {
      expect(
        restoreAppState({ currentItemCustomStrokeWidth: value }, null)
          .currentItemCustomStrokeWidth,
      ).toBeNull();
    }
  });

  it.each([0.2, 0.5, 0.8])(
    "matches variable brush geometry at pressure %s",
    (pressure) => {
      const ink = API.createElement({
        type: "freedraw",
        strokeWidth: 3,
        points: [
          pointFrom(0, 0),
          pointFrom(80, 0),
          pointFrom(160, 0),
          pointFrom(240, 0),
        ],
        pressures: [pressure, pressure, pressure, pressure],
        simulatePressure: false,
        strokeOptions: { variability: "variable", streamline: 0.2 },
      });
      const outline = getFreedrawOutlinePoints(ink);
      const diameter =
        Math.max(...outline.map((p) => p[1])) -
        Math.min(...outline.map((p) => p[1]));
      expect(getFreedrawStrokeWidth(ink, pressure)).toBeCloseTo(diameter, 1);
      expect(getStraightInkWidth(ink)).toBeCloseTo(diameter, 1);
    },
  );

  it("matches the constant brush diameter and ignores its pressure", () => {
    const ink = API.createElement({
      type: "freedraw",
      strokeWidth: 3,
      points: [pointFrom(0, 0), pointFrom(80, 0), pointFrom(160, 0)],
      pressures: [0.1, 0.5, 0.9],
      simulatePressure: false,
      strokeOptions: { variability: "constant", streamline: 0.2 },
    });
    const outline = getFreedrawOutlinePoints(ink);
    const diameter =
      Math.max(...outline.map((p) => p[1])) -
      Math.min(...outline.map((p) => p[1]));
    expect(getStraightInkWidth(ink)).toBeCloseTo(diameter, 1);
    expect(getStraightInkWidth(ink)).toBeCloseTo(8.4);
  });
});
