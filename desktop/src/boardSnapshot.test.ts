import { describe, expect, it } from "vitest";
import { pointFrom } from "@excalidraw/math";

import type { BinaryFiles } from "@excalidraw/excalidraw/types";

import { API } from "../../packages/excalidraw/tests/helpers/api";

import { BoardChanges, serializeBoard } from "./boardSnapshot";

describe("desktop document snapshots", () => {
  it("omits tombstones without changing the in-memory elements or live ink", () => {
    const live = API.createElement({
      type: "freedraw",
      points: [pointFrom(0, 0), pointFrom(8, 10)],
    });
    const deleted = API.createElement({ type: "rectangle", isDeleted: true });
    const elements = [live, deleted];
    const before = JSON.stringify(elements);
    const result = JSON.parse(
      serializeBoard(elements, { paperGrid: "triangle" }, {}),
    );
    expect(result.elements).toEqual([live]);
    expect(result.appState.paperGrid).toBe("triangle");
    expect(JSON.stringify(elements)).toBe(before);
  });

  it("keeps live image bytes and excludes files referenced only by deleted images", () => {
    const live = API.createElement({ type: "image" });
    const deleted = API.createElement({ type: "image", isDeleted: true });
    const elements = [
      { ...live, fileId: "live" },
      { ...deleted, fileId: "deleted" },
    ] as unknown as typeof live[];
    const files = {
      live: { id: "live", dataURL: "data:image/png;base64,keep" },
      deleted: { id: "deleted", dataURL: "data:image/png;base64,discard" },
    } as unknown as BinaryFiles;
    const result = JSON.parse(serializeBoard(elements, {}, files));
    expect(result.files).toEqual({ live: files.live });
    expect(files.deleted).toBeDefined();
  });

  it("ignores cursor/viewport changes but detects drawing, paper, order and images", () => {
    const changes = new BoardChanges();
    const elements = [
      API.createElement({ type: "rectangle" }),
      API.createElement({ type: "ellipse" }),
    ];
    const files = {};
    expect(changes.update(elements, { scrollX: 0 }, files)).toBe(true);
    expect(
      changes.update(elements, { scrollX: 300, cursorButton: "down" }, files),
    ).toBe(false);
    elements[0] = {
      ...elements[0],
      versionNonce: elements[0].versionNonce + 1,
    };
    expect(changes.update(elements, {}, files)).toBe(true);
    elements.reverse();
    expect(changes.update(elements, {}, files)).toBe(true);
    expect(changes.update(elements, { paperGrid: "square" }, files)).toBe(true);
    expect(changes.update(elements, { paperGrid: "square" }, {})).toBe(true);
  });

  it("does not serialize heavy point arrays when detecting frame changes", () => {
    const element = API.createElement({ type: "freedraw" });
    Object.defineProperty(element, "points", {
      get() {
        throw new Error("points visited in frame callback");
      },
    });
    expect(() => new BoardChanges().update([element], {}, {})).not.toThrow();
  });
});
