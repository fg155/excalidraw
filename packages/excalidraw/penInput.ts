type PenEvent = Pick<
  PointerEvent,
  "pointerType" | "button" | "buttons" | "pressure"
>;

// `button` identifies a transition, while `buttons` describes the current
// state. Drivers can change the eraser state before the pen touches down.
export const isPenEraser = (event: PenEvent) =>
  event.pointerType === "pen" &&
  ((event.buttons & 32) !== 0 || (event.button === 5 && event.buttons !== 0));

export const isPenEraserHover = (event: PenEvent) =>
  isPenEraser(event) && event.pressure === 0;
