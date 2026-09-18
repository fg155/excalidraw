import { newLinearElement } from "@excalidraw/element";
import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";
import type {
  ExcalidrawFreeDrawElement,
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
  } | null = null;

  constructor(private app: App) {}

  start(element: ExcalidrawFreeDrawElement, shift: boolean) {
    this.clear();
    const config = this.app.props.straightInk;
    if (config?.shift || config?.hold) {
      this.gesture = {
        id: element.id,
        straight: !!(shift && config.shift),
        anchor: null,
        timer: null,
      };
    }
  }

  clear() {
    if (this.gesture?.timer != null) {
      this.app.ownerWindow.clearTimeout(this.gesture.timer);
    }
    this.gesture = null;
  }

  cancel = () => {
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
  move(element: NonDeleted<ExcalidrawFreeDrawElement>, point: LocalPoint) {
    const gesture = this.gesture;
    if (!gesture || gesture.id !== element.id) {
      return false;
    }
    if (gesture.straight) {
      this.preview(element, point);
      return true;
    }
    if (!this.app.props.straightInk?.hold) {
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
    element: NonDeleted<ExcalidrawFreeDrawElement>,
    point: LocalPoint,
  ) {
    this.app.scene.mutateElement(element, {
      points: [pointFrom<LocalPoint>(0, 0), point],
      pressures: [],
      simulatePressure: true,
    });
    this.app.setState({ newElement: element });
  }

  finish(element: ExcalidrawFreeDrawElement, point: LocalPoint) {
    const straight = this.gesture?.id === element.id && this.gesture.straight;
    this.clear();
    if (!straight) {
      return null;
    }
    const line = newLinearElement({
      ...element,
      type: "line",
      points: [pointFrom<LocalPoint>(0, 0), point],
      width: Math.abs(point[0]),
      height: Math.abs(point[1]),
      roundness: null,
    });
    return {
      ...line,
      id: element.id,
      index: element.index,
      version: element.version + 1,
    };
  }
}
