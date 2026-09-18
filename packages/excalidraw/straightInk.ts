import { newLinearElement } from "@excalidraw/element";
import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";
import type {
  ExcalidrawFreeDrawElement,
  ExcalidrawElement,
  ExcalidrawLineElement,
  ExcalidrawLinearElement,
  NonDeleted,
} from "@excalidraw/element/types";

import type App from "./components/App";

/** Screen-space tolerances keep the gesture consistent at different zooms. */
export const isNearlyStraight = (
  points: readonly (readonly [number, number])[],
  zoom: number,
) => {
  if (points.length < 2) {
    return false;
  }
  const [sx, sy] = points[0];
  const [ex, ey] = points[points.length - 1];
  const dx = ex - sx;
  const dy = ey - sy;
  const length = Math.hypot(dx, dy);
  if (length * zoom < 24) {
    return false;
  }
  let travelled = 0;
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i];
    travelled += Math.hypot(x - points[i - 1][0], y - points[i - 1][1]);
    const deviation = Math.abs(dx * (sy - y) - (sx - x) * dy) / length;
    if (deviation > Math.max(4 / zoom, length * 0.06)) {
      return false;
    }
  }
  return travelled / length <= 1.2;
};

export class StraightInk {
  private gesture: {
    id: string;
    straight: boolean;
    anchor: LocalPoint | null;
    timer: number | null;
    pointerId: number;
    pointerType: string;
  } | null = null;

  constructor(private app: App) {}

  start(
    element: ExcalidrawFreeDrawElement,
    event: Pick<PointerEvent, "shiftKey" | "pointerId" | "pointerType">,
  ) {
    this.clear();
    const config = this.app.props.straightInk;
    if (config?.shift || config?.hold) {
      this.gesture = {
        id: element.id,
        straight: !!(event.shiftKey && config.shift),
        anchor: null,
        timer: null,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
      };
    }
  }

  clear() {
    if (this.gesture?.timer != null) {
      this.app.ownerWindow.clearTimeout(this.gesture.timer);
    }
    this.gesture = null;
  }

  isOtherPointer(event: Pick<PointerEvent, "pointerId">) {
    return !!this.gesture && event.pointerId !== this.gesture.pointerId;
  }

  ignorePalm(event: Pick<PointerEvent, "pointerType" | "pointerId">) {
    return (
      this.gesture?.pointerType === "pen" &&
      this.app.state.penMode &&
      event.pointerType === "touch" &&
      this.isOtherPointer(event)
    );
  }

  cancel = (event?: Pick<PointerEvent, "pointerId">) => {
    if (event && this.isOtherPointer(event)) {
      return;
    }
    const id = this.gesture?.id;
    this.clear();
    if (id && this.app.state.newElement?.id === id) {
      this.app.scene.replaceAllElements(
        this.app.scene
          .getElementsIncludingDeleted()
          .filter((el) => el.id !== id),
      );
      this.app.setState({ newElement: null, cursorButton: "up" });
    }
  };

  /** Returns true when the normal freehand point append should be skipped. */
  move(element: NonDeleted<ExcalidrawElement>, point: LocalPoint) {
    const gesture = this.gesture;
    if (
      !gesture ||
      gesture.id !== element.id ||
      (element.type !== "freedraw" && element.type !== "line")
    ) {
      return false;
    }
    if (gesture.straight) {
      this.preview(element, point);
      return true;
    }
    if (element.type !== "freedraw" || !this.app.props.straightInk?.hold) {
      return false;
    }
    const zoom = this.app.state.zoom.value;
    if (
      gesture.anchor &&
      Math.hypot(point[0] - gesture.anchor[0], point[1] - gesture.anchor[1]) *
        zoom <=
        3
    ) {
      return false;
    }
    if (gesture.timer != null) {
      this.app.ownerWindow.clearTimeout(gesture.timer);
      gesture.timer = null;
    }
    gesture.anchor = point;
    if (isNearlyStraight([...element.points, point], zoom)) {
      gesture.timer = this.app.ownerWindow.setTimeout(() => {
        const current = this.app.state.newElement;
        if (
          this.gesture === gesture &&
          this.app.state.activeTool.type === "freedraw" &&
          this.app.props.straightInk?.hold &&
          current?.id === gesture.id &&
          current.type === "freedraw" &&
          isNearlyStraight(current.points, this.app.state.zoom.value)
        ) {
          gesture.straight = true;
          this.preview(current, current.points[current.points.length - 1]);
        }
      }, Math.max(200, Math.min(2000, this.app.props.straightInk.holdMs || 500)));
    }
    return false;
  }

  private preview(
    element: NonDeleted<ExcalidrawFreeDrawElement | ExcalidrawLinearElement>,
    point: LocalPoint,
  ) {
    // Use a real line throughout the preview, not a two-point freedraw outline.
    // Freedraw streamline smoothing pulls a sparse preview short of the pen tip.
    if (element.type === "line") {
      this.app.scene.mutateElement(element, {
        points: [pointFrom<LocalPoint>(0, 0), point],
      });
      this.app.setState({ newElement: element });
    } else {
      const line = this.toLine(element, point);
      this.app.scene.replaceAllElements(
        this.app.scene
          .getElementsIncludingDeleted()
          .map((item) => (item.id === element.id ? line : item)),
      );
      this.app.setState({ newElement: line });
    }
  }

  finish(
    element: ExcalidrawFreeDrawElement | ExcalidrawLinearElement,
    point: LocalPoint,
  ) {
    const straight = this.gesture?.id === element.id && this.gesture.straight;
    this.clear();
    if (!straight) {
      return null;
    }
    return this.toLine(element, point);
  }

  private toLine(
    element: ExcalidrawFreeDrawElement | ExcalidrawLinearElement,
    point: LocalPoint,
  ): NonDeleted<ExcalidrawLineElement> {
    const line = newLinearElement({
      ...element,
      type: "line",
      points: [pointFrom<LocalPoint>(0, 0), point],
      width: Math.abs(point[0]),
      height: Math.abs(point[1]),
      roundness: null,
      // Only converted strokes use the clean style; ordinary pen preferences stay intact.
      roughness: 0,
      polygon: false,
    });
    return {
      ...line,
      type: "line",
      polygon: false,
      id: element.id,
      index: element.index,
      version: element.version + 1,
    };
  }
}
