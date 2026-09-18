import { useEffect, useRef, useState } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import {
  appendPaperGridSvg,
  PAPER_GRID_STYLES,
} from "@excalidraw/excalidraw/paperGrid";

import type { PaperGridStyle } from "@excalidraw/excalidraw/paperGrid";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const labels: Record<PaperGridStyle, string> = {
  none: "纯色",
  dots: "点阵",
  square: "方格",
  graph: "密方格",
  mixed: "混合",
  diamond: "菱形",
  ruled: "宽横线",
  triangle: "三角形",
  narrow: "窄横线",
};
const colors = [
  ["浅黄", "#fff0a6"],
  ["浅橙", "#ffe0ce"],
  ["浅粉", "#ffd6d9"],
  ["浅紫", "#e5d3ef"],
  ["浅蓝", "#ccecf6"],
  ["浅绿", "#e5f3c8"],
  ["白色", "#ffffff"],
  ["浅灰", "#f0f0f0"],
  ["灰色", "#e0e0e0"],
  ["黑色", "#202020"],
];

function GridPreview({ style }: { style: PaperGridStyle }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = ref.current!;
    appendPaperGridSvg(svg, style, "#ffffff", 128, 128);
    // Miniature previews need more contrast than the writing background.
    svg.querySelectorAll("path, circle").forEach((mark) => {
      mark.setAttribute(
        "opacity",
        `${Math.min(0.85, Number(mark.getAttribute("opacity")) * 3)}`,
      );
      mark.setAttribute("stroke-width", "2");
    });
    return () => svg.replaceChildren();
  }, [style]);
  return <svg ref={ref} viewBox="0 0 128 128" aria-hidden="true" />;
}

export function BackgroundPanel({ api }: { api: ExcalidrawImperativeAPI }) {
  const [selected, setSelected] = useState(() => ({
    paperGrid: api.getAppState().paperGrid,
    viewBackgroundColor: api.getAppState().viewBackgroundColor,
  }));
  const update = (patch: Partial<typeof selected>) => {
    const next = { ...selected, ...patch };
    setSelected(next);
    api.updateScene({
      appState: next,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };
  const selectedColor = selected.viewBackgroundColor
    .toLowerCase()
    .replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/, "#$1$1$2$2$3$3");
  return (
    <div className="background-panel">
      <h3>颜色</h3>
      <div className="paper-colors" role="group" aria-label="背景颜色">
        {colors.map(([name, color]) => (
          <button
            key={color}
            aria-label={name}
            title={name}
            aria-pressed={selectedColor === color}
            onClick={() => update({ viewBackgroundColor: color })}
          >
            <span style={{ backgroundColor: color }} />
          </button>
        ))}
      </div>
      <h3>网格</h3>
      <div className="paper-grids" role="group" aria-label="背景网格">
        {PAPER_GRID_STYLES.map((style) => (
          <button
            key={style}
            aria-pressed={selected.paperGrid === style}
            onClick={() => update({ paperGrid: style })}
          >
            <GridPreview style={style} />
            <span>{labels[style]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
