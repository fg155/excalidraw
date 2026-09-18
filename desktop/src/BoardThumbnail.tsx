import { useEffect, useRef, useState } from "react";
import { exportToCanvas, loadFromBlob } from "@excalidraw/excalidraw";
import { getNonDeletedElements } from "@excalidraw/element";

import { repository } from "./repository";

import type { BoardFile } from "./repository";

// Serialize thumbnail work so a large gallery cannot decode many image-heavy
// boards at once. Only visible cards are queued and unmounted cards are skipped.
let thumbnailQueue: Promise<unknown> = Promise.resolve();

/** Export read-only scene data, never mount a second editor or persist normalization. */
export async function renderThumbnail(content: string) {
  const data = await loadFromBlob(
    new Blob([content], { type: "application/json" }),
    null,
    null,
  );
  const elements = getNonDeletedElements(data.elements || []);
  if (!elements.length) {
    return null;
  }
  const canvas = await exportToCanvas({
    elements,
    files: data.files || {},
    appState: {
      ...data.appState,
      exportBackground: true,
      exportWithDarkMode: false,
      exportEmbedScene: false,
    },
    maxWidthOrHeight: 480,
    exportPadding: 24,
  });
  return canvas.toDataURL("image/png");
}

export function BoardThumbnail({ file }: { file: BoardFile }) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const node = host.current!;
    const ownerWindow = node.ownerDocument.defaultView!;
    if (!ownerWindow.IntersectionObserver) {
      setVisible(true);
      return;
    }
    const observer = new ownerWindow.IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    setPreview(null);
    setFailed(false);
    const job = thumbnailQueue.then(async () => {
      if (cancelled) {
        return null;
      }
      const board = await repository.read(file.name);
      return cancelled ? null : renderThumbnail(board.content);
    });
    thumbnailQueue = job.catch(() => null);
    void job
      .then((image) => {
        if (!cancelled) {
          setPreview(image);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible, file.name, file.modified]);
  return (
    <div ref={host} className="board-thumbnail">
      {preview ? (
        <img src={preview} alt="" draggable={false} />
      ) : (
        <span className="thumbnail-placeholder" aria-hidden="true">
          {failed ? "预览不可用" : ""}
        </span>
      )}
    </div>
  );
}
