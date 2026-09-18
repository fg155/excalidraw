import { Excalidraw } from "../index";

import { act, fireEvent, render } from "./test-utils";
import { Keyboard, Pointer, UI } from "./helpers/ui";

const { h } = window;
const mouse = new Pointer("mouse");

describe("straight ink pointer gestures", () => {
  beforeEach(async () => {
    await render(
      <Excalidraw
        handleKeyboardGlobally
        straightInk={{ version: 1, shift: true, hold: true, holdMs: 500 }}
      />,
    );
    UI.clickTool("freedraw");
  });

  it("keeps the origin fixed, uses arbitrary angles and stays in pen mode", () => {
    Keyboard.withModifierKeys({ shift: true }, () => mouse.downAt(20, 30));
    mouse.moveTo(100, 70);
    mouse.moveTo(140, 53);
    mouse.upAt();
    const line = h.elements[0];
    expect(line.type).toBe("line");
    expect([line.x, line.y]).toEqual([20, 30]);
    expect("points" in line && line.points).toEqual([
      [0, 0],
      [120, 23],
    ]);
    expect(h.state.activeTool.type).toBe("freedraw");
    Keyboard.undo();
    expect(h.elements.filter((el) => !el.isDeleted)).toHaveLength(0);
    Keyboard.redo();
    expect(h.elements.filter((el) => !el.isDeleted)[0].type).toBe("line");
  });

  it("does not start Shift mode in the middle of a stroke", () => {
    mouse.downAt(20, 30);
    Keyboard.withModifierKeys({ shift: true }, () => mouse.upAt(100, 70));
    expect(h.elements[0].type).toBe("freedraw");
  });

  it("converts after holding and moves only the endpoint", async () => {
    mouse.downAt(20, 30);
    mouse.moveTo(70, 32);
    mouse.moveTo(120, 30);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 550));
    });
    mouse.moveTo(160, 100);
    mouse.upAt();
    const line = h.elements[0];
    expect(line.type).toBe("line");
    expect([line.x, line.y]).toEqual([20, 30]);
    expect("points" in line && line.points).toEqual([
      [0, 0],
      [140, 70],
    ]);
  });

  it.each(["escape", "blur", "pointercancel"])("cancels on %s", (kind) => {
    Keyboard.withModifierKeys({ shift: true }, () => mouse.downAt(20, 30));
    mouse.moveTo(100, 70);
    if (kind === "escape") {
      Keyboard.keyPress("Escape");
    } else if (kind === "blur") {
      fireEvent.blur(window);
    } else {
      fireEvent.pointerCancel(window, { pointerId: 1 });
    }
    mouse.upAt();
    expect(h.elements.filter((el) => !el.isDeleted)).toHaveLength(0);
  });
});
