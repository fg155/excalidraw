import { serializeAsJSON } from "@excalidraw/excalidraw";
import { hashElementsVersion } from "@excalidraw/element";
import { cleanAppStateForExport } from "@excalidraw/excalidraw/appState";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

/** Save a standalone document, not the in-memory undo/collaboration tombstones. */
export const serializeBoard = (
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
) =>
  serializeAsJSON(
    elements.filter((element) => !element.isDeleted),
    appState,
    files,
    "local",
  );

/** Detect changes without walking points or encoding image data on every frame. */
export class BoardChanges {
  private elements: readonly ExcalidrawElement[] | null = null;
  private version = -1;
  private state = "";
  private files: BinaryFiles | null = null;

  update(
    elements: readonly ExcalidrawElement[],
    appState: Partial<AppState>,
    files: BinaryFiles,
  ) {
    const version = hashElementsVersion(elements);
    const state = JSON.stringify(cleanAppStateForExport(appState));
    if (
      elements === this.elements &&
      version === this.version &&
      state === this.state &&
      files === this.files
    ) {
      return false;
    }
    this.elements = elements;
    this.version = version;
    this.state = state;
    this.files = files;
    return true;
  }
}
