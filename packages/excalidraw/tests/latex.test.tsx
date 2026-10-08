import { getLineHeight, FONT_FAMILY } from "@excalidraw/common";
import {
  appendMathSvg,
  drawMathText,
  getMathLayout,
  layoutMath,
  splitMathText,
} from "@excalidraw/element/latex";
import {
  newTextElement,
  refreshTextDimensions,
  redrawTextBoundingBox,
} from "@excalidraw/element";

import type { ExcalidrawTextElement } from "@excalidraw/element/types";

import { Excalidraw, CaptureUpdateAction } from "../index";
import { restoreElements, restoreAppState } from "../data/restore";
import { createPasteEvent, serializeAsClipboardJSON } from "../clipboard";
import { exportToSvg } from "../scene/export";
import { getDefaultAppState } from "../appState";
import { Fonts } from "../fonts";

import { API } from "./helpers/api";
import { UI } from "./helpers/ui";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  GlobalTestState,
} from "./test-utils";

const { h } = window;
const style = {
  fontFamily: FONT_FAMILY.Helvetica,
  fontSize: 20,
  lineHeight: getLineHeight(FONT_FAMILY.Helvetica),
  textAlign: "left" as const,
};
const source = String.raw`ECE 105 | E105-Q0133 · r1
C04 | synthesis | 中等
Topics: free-fall
Prerequisites: C01, C02, C03, C04

A ball is thrown upward from ground level with speed $12\,\mathrm{m/s}$. Use $g=10\,\mathrm{m/s^2}$ and ignore air resistance. Find both times when it is 5 m above the ground and its velocity at each time. Use upward as positive.`;

describe("offline math layout", () => {
  it("recognizes four delimiters, escaped dollars, and unfinished source", () => {
    expect(
      splitMathText(String.raw`a $x$ b $$y$$ c \(z\) d \[w\]`)
        .filter((token) => token.math)
        .map((token) => [token.text, !!token.display]),
    ).toEqual([
      ["x", false],
      ["y", true],
      ["z", false],
      ["w", true],
    ]);
    expect(splitMathText("cost \\$5 and $unfinished\\")).toEqual([
      { text: "cost $5 and $unfinished\\" },
    ]);
  });

  it("wraps prose but keeps math intact with real vector metrics", () => {
    const result = layoutMath(source, style, 420);
    expect(result.errors).toBe(false);
    expect(result.width).toBeLessThanOrEqual(420);
    expect(result.runs.filter((run) => run.formula)).toHaveLength(2);
    expect(result.height).toBeGreaterThan(120);
    const fraction = layoutMath(String.raw`$\frac{1}{\sqrt{x^2+1}}$`, style);
    expect(fraction.errors).toBe(false);
    expect(fraction.height).toBeGreaterThan(style.fontSize * style.lineHeight);
    expect(layoutMath(String.raw`$\notARealCommand{x}$`, style).errors).toBe(
      true,
    );
  });

  it("fits a long equation inside a narrow block and keeps bad input visible", () => {
    const narrow = layoutMath("$a+b+c+d+e+f+g+h+i+j$", style, 50);
    expect(narrow.width).toBeCloseTo(50, 8);
    expect(narrow.runs[0].scale).toBeLessThan(1);
    expect(
      layoutMath(
        String.raw`$\require{html}\href{https://example.org}{x}$`,
        style,
        50,
      ).errors,
    ).toBe(true);
  });

  it("uses vector formulas through the real SVG exporter", async () => {
    const element = newTextElement({
      ...API.createElement({ type: "text", text: source }),
      textMode: "latex",
      autoResize: false,
      width: 420,
    });
    // This checks formula geometry, not prose font IO/WOFF2 subsetting. The
    // latter can exhaust Vitest's 5s budget on a cold macOS CI runner. Keep the
    // real exporter and math renderer, but explicitly exclude font packaging.
    const inlineFonts = vi
      .spyOn(Fonts, "generateFontFaceDeclarations")
      .mockImplementation(async () => {
        throw new Error("Formula geometry test must not package prose fonts");
      });
    try {
      const svg = await exportToSvg(
        [element],
        getDefaultAppState(),
        {},
        {
          skipInliningFonts: true,
        },
      );
      expect(inlineFonts).not.toHaveBeenCalled();
      expect(svg.querySelectorAll("path").length).toBeGreaterThan(10);
      expect(svg.textContent).not.toContain("\\mathrm");
      expect(svg.querySelector("foreignObject, image, script")).toBeNull();
    } finally {
      inlineFonts.mockRestore();
    }
  });

  it("preserves matrix rules and Chinese text inside formulas", () => {
    const text = String.raw`$\begin{array}{c|c}a & b\\ \hline c & d\end{array}$ $\text{中文}$`;
    const element = newTextElement({
      ...API.createElement({ type: "text", text }),
      textMode: "latex",
    });
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    appendMathSvg(group, element, "#123456");
    expect(group.querySelectorAll('line[stroke-width="70"]')).toHaveLength(2);
    expect(
      group.querySelector('g[data-mml-node="mtext"] text')?.textContent,
    ).toBe("中文");
    const context = document.createElement("canvas").getContext("2d")!;
    const stroke = vi.spyOn(context, "stroke");
    const fillText = vi.spyOn(context, "fillText");
    drawMathText(context, element);
    expect(stroke).toHaveBeenCalledTimes(2);
    expect(fillText).toHaveBeenCalledWith("中文", 0, 0);
  });

  it("exports self-contained SVG paths and draws the same formula on canvas", () => {
    const element = newTextElement({
      ...API.createElement({ type: "text", text: source }),
      textMode: "latex",
      autoResize: false,
      width: 420,
    });
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    appendMathSvg(group, element, "#123456");
    expect(group.querySelectorAll("path").length).toBeGreaterThan(10);
    expect(group.querySelector("image, script, foreignObject, use")).toBeNull();
    expect(group.innerHTML).not.toContain("http://localhost");
    const canvas = document.createElement("canvas");
    expect(() => drawMathText(canvas.getContext("2d")!, element)).not.toThrow();
    expect(getMathLayout(element)).toBe(getMathLayout(element));
    expect(restoreElements([element], null)[0]).toMatchObject({
      textMode: "latex",
      originalText: source,
    });
  });
});

describe("per-block text mode", () => {
  beforeEach(async () => {
    await render(<Excalidraw autoFocus handleKeyboardGlobally />);
    Object.assign(document, { elementFromPoint: () => GlobalTestState.canvas });
  });

  it("switches selected blocks reversibly with undo/redo and keeps other text unchanged", () => {
    const first = API.createElement({
      type: "text",
      text: String.raw`Speed $12\,\mathrm{m/s}$`,
    });
    const other = API.createElement({ type: "text", text: "normal" });
    API.updateScene({
      elements: [first, other],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    API.setSelectedElements([first]);
    fireEvent.click(screen.getByTestId("text-mode-latex"));
    expect(h.elements[0]).toMatchObject({
      textMode: "latex",
      originalText: first.originalText,
    });
    expect(h.elements[1]).toMatchObject({ textMode: "plain" });
    expect(h.state.currentItemTextMode).toBe("latex");
    fireEvent.click(screen.getByTestId("button-undo"));
    expect(h.elements[0]).toMatchObject({ textMode: "plain" });
    fireEvent.click(screen.getByTestId("button-redo"));
    expect(h.elements[0]).toMatchObject({ textMode: "latex" });
    fireEvent.click(screen.getByTestId("text-mode-plain"));
    expect(h.elements[0]).toMatchObject({
      textMode: "plain",
      text: first.originalText,
    });
  });

  it("inherits the last selected block for creation and whole-paragraph text paste", async () => {
    const math = newTextElement({
      ...API.createElement({ type: "text", text: "$x$" }),
      textMode: "latex",
    });
    API.setElements([math]);
    API.setSelectedElements([math]);
    expect(h.state.currentItemTextMode).toBe("latex");
    API.setSelectedElements([]);
    document.dispatchEvent(
      createPasteEvent({ types: { "text/plain": source } }),
    );
    await waitFor(() => expect(h.elements).toHaveLength(2));
    const pasted = h.elements[1] as ExcalidrawTextElement;
    expect(pasted).toMatchObject({ textMode: "latex", originalText: source });
    expect(pasted.text).toBe(source);
    expect(pasted.height).toBeCloseTo(getMathLayout(pasted).height, 3);
    const created = UI.createElement("text", { x: 800, y: 800 });
    await UI.editText(created.get(), "$y$");
    expect(created.get()).toMatchObject({ textMode: "latex" });
  });

  it("keeps mode on copied elements regardless of the next-text preference", async () => {
    const text = newTextElement({
      ...API.createElement({ type: "text", text: "$x$" }),
      textMode: "latex",
    });
    API.setAppState({ currentItemTextMode: "plain" });
    document.dispatchEvent(
      createPasteEvent({
        types: {
          "text/plain": serializeAsClipboardJSON({
            elements: [text],
            files: {},
          }),
        },
      }),
    );
    await waitFor(() => expect(h.elements).toHaveLength(1));
    expect(h.elements[0]).toMatchObject({ textMode: "latex" });
  });

  it("measures resized and bound math without inserting newlines into TeX source", () => {
    const text = newTextElement({
      ...API.createElement({ type: "text", text: source }),
      textMode: "latex",
      autoResize: false,
      width: 300,
    });
    API.setElements([text]);
    const dimensions = refreshTextDimensions(
      text,
      null,
      h.app.scene.getElementsMapIncludingDeleted(),
    );
    expect(dimensions).toMatchObject({ text: source, width: 300 });
    expect(dimensions!.height).toBeCloseTo(getMathLayout(text).height, 3);
    const rect = API.createElement({
      type: "rectangle",
      width: 320,
      height: 100,
      boundElements: [{ id: text.id, type: "text" }],
    });
    const bound = { ...text, containerId: rect.id, autoResize: true };
    API.setElements([rect, bound]);
    act(() => redrawTextBoundingBox(bound, rect, h.app.scene));
    expect(bound.text).toBe(source);
    expect(bound.height).toBeCloseTo(getMathLayout(bound).height, 3);
    expect(rect.height).toBeGreaterThan(100);
  });

  it("starts plain and sanitizes unknown mode preferences", () => {
    expect(restoreAppState({}, null).currentItemTextMode).toBe("plain");
    expect(
      restoreAppState({ currentItemTextMode: "latex" }, null)
        .currentItemTextMode,
    ).toBe("latex");
    expect(
      restoreAppState({ currentItemTextMode: "other" as "plain" }, null)
        .currentItemTextMode,
    ).toBe("plain");
  });
});
