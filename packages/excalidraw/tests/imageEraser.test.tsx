import { pointFrom } from "@excalidraw/math";

import type { FileId } from "@excalidraw/element/types";

import { Excalidraw, CaptureUpdateAction } from "../index";

import { API } from "./helpers/api";
import { Keyboard, UI } from "./helpers/ui";
import { fireEvent, GlobalTestState, render, screen } from "./test-utils";

const { h } = window;
const pointer = (x: number, y: number, extra = {}) => ({
  pointerId: 41,
  pointerType: "pen",
  clientX: x,
  clientY: y,
  pressure: 0.5,
  button: 0,
  buttons: 1,
  ...extra,
});
const down = (x: number, y: number, extra = {}) =>
  fireEvent.pointerDown(
    GlobalTestState.interactiveCanvas,
    pointer(x, y, extra),
  );
const move = (x: number, y: number, extra = {}) =>
  fireEvent.pointerMove(
    GlobalTestState.interactiveCanvas,
    pointer(x, y, extra),
  );
const up = (x: number, y: number, extra = {}) =>
  fireEvent.pointerUp(
    GlobalTestState.interactiveCanvas,
    pointer(x, y, { buttons: 0, pressure: 0, ...extra }),
  );

describe("image-safe eraser", () => {
  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally />);
    API.setAppState({ width: 800, height: 600 });
  });

  it.each(["tap", "drag", "hardware"])(
    "preserves images while erasing overlaid ink with %s",
    (mode) => {
      const image = API.createElement({
        type: "image",
        fileId: "image-file" as FileId,
        x: 20,
        y: 20,
        width: 200,
        height: 160,
      });
      const ink = API.createElement({
        type: "freedraw",
        x: 30,
        y: 60,
        points: [pointFrom(0, 0), pointFrom(100, 0)],
        width: 100,
        height: 0,
      });
      API.updateScene({
        elements: [image, ink],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      UI.clickTool(mode === "hardware" ? "freedraw" : "eraser");
      const extra = mode === "hardware" ? { button: 5, buttons: 32 } : {};
      down(80, mode === "tap" ? 60 : 35, extra);
      if (mode !== "tap") {
        move(80, 60, extra);
        move(80, 90, extra);
      }
      up(
        80,
        mode === "tap" ? 60 : 90,
        mode === "hardware" ? { button: 5 } : {},
      );
      expect(h.elements.find((el) => el.id === image.id)?.isDeleted).toBe(
        false,
      );
      expect(h.elements.find((el) => el.id === ink.id)?.isDeleted).toBe(true);
      fireEvent.click(screen.getByTestId("button-undo"));
      expect(h.elements.every((el) => !el.isDeleted)).toBe(true);
    },
  );

  it("does not erase grouped images indirectly", () => {
    const image = API.createElement({
      type: "image",
      fileId: "image-file" as FileId,
      x: 300,
      y: 20,
      width: 100,
      height: 100,
      groupIds: ["group"],
    });
    const line = API.createElement({
      type: "line",
      x: 20,
      y: 50,
      width: 180,
      height: 0,
      points: [pointFrom(0, 0), pointFrom(180, 0)],
      groupIds: ["group"],
    });
    API.updateScene({
      elements: [image, line],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    UI.clickTool("eraser");
    down(80, 30);
    move(80, 70);
    up(80, 70);
    expect(h.elements.find((el) => el.id === image.id)?.isDeleted).toBe(false);
    expect(h.elements.find((el) => el.id === line.id)?.isDeleted).toBe(true);
  });

  it("keeps images when their frame is erased and restores frame membership on undo", () => {
    const frame = API.createElement({
      type: "frame",
      x: 20,
      y: 20,
      width: 220,
      height: 180,
    });
    const image = API.createElement({
      type: "image",
      fileId: "image-file" as FileId,
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      frameId: frame.id,
    });
    API.updateScene({
      elements: [image, frame],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    UI.clickTool("eraser");
    down(10, 100);
    move(30, 100);
    up(30, 100);
    expect(h.elements.find((el) => el.id === frame.id)?.isDeleted).toBe(true);
    expect(h.elements.find((el) => el.id === image.id)).toMatchObject({
      isDeleted: false,
      frameId: null,
    });
    fireEvent.click(screen.getByTestId("button-undo"));
    expect(h.elements.find((el) => el.id === image.id)?.frameId).toBe(frame.id);
  });

  it("still permits explicit image deletion", () => {
    const image = API.createElement({
      type: "image",
      fileId: "image-file" as FileId,
      width: 100,
      height: 100,
    });
    API.updateScene({
      elements: [image],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    API.setSelectedElements([image]);
    Keyboard.keyPress("Delete");
    expect(h.elements[0].isDeleted).toBe(true);
    fireEvent.click(screen.getByTestId("button-undo"));
    expect(h.elements[0].isDeleted).toBe(false);
  });
});
