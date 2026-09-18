import { applyDarkModeFilter, SVG_NS } from "@excalidraw/common";

export const PAPER_GRID_STYLES = [
  "none",
  "dots",
  "square",
  "graph",
  "mixed",
  "diamond",
  "ruled",
  "triangle",
  "narrow",
] as const;
export type PaperGridStyle = typeof PAPER_GRID_STYLES[number];

export const normalizePaperGrid = (value: unknown): PaperGridStyle =>
  PAPER_GRID_STYLES.includes(value as PaperGridStyle)
    ? (value as PaperGridStyle)
    : "none";

type Family = { a: number; b: number; spacing: number; opacity: number };
const family = (
  a: number,
  b: number,
  spacing: number,
  opacity = 0.18,
): Family => ({ a, b, spacing, opacity });

export function paperPattern(style: PaperGridStyle) {
  const square = (spacing: number, opacity = 0.18) => [
    family(1, 0, spacing, opacity),
    family(0, 1, spacing, opacity),
  ];
  switch (style) {
    case "dots":
      return { width: 24, height: 24, families: [], dots: true };
    case "square":
      return { width: 32, height: 32, families: square(32) };
    case "graph":
      return { width: 16, height: 16, families: square(16) };
    case "mixed":
      return {
        width: 80,
        height: 80,
        families: [...square(16, 0.1), ...square(80, 0.16)],
      };
    case "diamond":
      return {
        width: 48,
        height: 48,
        families: [family(1, 1, 24), family(1, -1, 24)],
      };
    case "ruled":
      return { width: 32, height: 32, families: [family(0, 1, 32)] };
    case "narrow":
      return { width: 12, height: 12, families: [family(0, 1, 12)] };
    case "triangle": {
      const height = 16 * Math.sqrt(3);
      return {
        width: 32,
        height: height * 2,
        families: [
          family(0, 1, height),
          family(Math.sqrt(3), 1, height * 2),
          family(-Math.sqrt(3), 1, height * 2),
        ],
      };
    }
    default:
      return { width: 32, height: 32, families: [] };
  }
}

/** World-anchored geometry shared by the editor, exported SVGs and picker icons. */
export function visitPaperGrid(
  style: PaperGridStyle,
  width: number,
  height: number,
  scrollX: number,
  scrollY: number,
  line: (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    opacity: number,
  ) => void,
  dot: (x: number, y: number) => void,
) {
  const pattern = paperPattern(style);
  if (pattern.dots) {
    const startX = ((scrollX % 24) + 24) % 24;
    const startY = ((scrollY % 24) + 24) % 24;
    for (let x = startX; x <= width; x += 24) {
      for (let y = startY; y <= height; y += 24) {
        dot(x, y);
      }
    }
  }
  for (const { a, b, spacing, opacity } of pattern.families) {
    const offset = (a * scrollX + b * scrollY) % spacing;
    const corners = [0, a * width, b * height, a * width + b * height];
    const first = Math.ceil((Math.min(...corners) - offset) / spacing);
    const last = Math.floor((Math.max(...corners) - offset) / spacing);
    for (let k = first; k <= last; k++) {
      const c = k * spacing + offset;
      if (!a) {
        line(0, c / b, width, c / b, opacity);
      } else if (!b) {
        line(c / a, 0, c / a, height, opacity);
      } else {
        line(0, c / b, width, (c - a * width) / b, opacity);
      }
    }
  }
}

export function paperInk(background: string, dark = false) {
  const color = applyDarkModeFilter(background, dark);
  const hex = color.replace("#", "");
  const full =
    hex.length === 3 ? [...hex].map((char) => char + char).join("") : hex;
  if (/^[0-9a-f]{6}$/i.test(full)) {
    const rgb = [0, 2, 4].map((offset) =>
      parseInt(full.slice(offset, offset + 2), 16),
    );
    return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 < 128
      ? "#ffffff"
      : "#000000";
  }
  return dark ? "#ffffff" : "#000000";
}

export function renderPaperGrid(
  context: CanvasRenderingContext2D,
  {
    style,
    background,
    dark = false,
    width,
    height,
    scrollX = 0,
    scrollY = 0,
    zoom = 1,
  }: {
    style: PaperGridStyle;
    background: string;
    dark?: boolean;
    width: number;
    height: number;
    scrollX?: number;
    scrollY?: number;
    zoom?: number;
  },
) {
  if (style === "none" || background === "transparent") {
    return;
  }
  // Fade sub-pixel detail instead of generating millions of marks when zoomed out.
  const pattern = paperPattern(style);
  const spacing = pattern.dots
    ? 24
    : Math.min(
        ...pattern.families.map(
          ({ a, b, spacing }) => spacing / Math.hypot(a, b),
        ),
      );
  const opacity = Math.min(1, Math.max(0, (spacing * zoom - 5) / 5));
  if (!opacity) {
    return;
  }
  context.save();
  context.strokeStyle = context.fillStyle = paperInk(background, dark);
  context.lineWidth = Math.min(1, 1 / zoom);
  context.beginPath();
  visitPaperGrid(
    style,
    width,
    height,
    scrollX,
    scrollY,
    (x1, y1, x2, y2, alpha) => {
      context.globalAlpha = alpha * opacity;
      context.beginPath();
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.stroke();
    },
    (x, y) => {
      context.moveTo(x + 1.2, y);
      context.arc(x, y, 1.2, 0, Math.PI * 2);
    },
  );
  if (pattern.dots) {
    context.globalAlpha = 0.32 * opacity;
    context.fill();
  }
  context.restore();
}

let patternId = 0;
export function appendPaperGridSvg(
  svg: SVGSVGElement,
  style: PaperGridStyle,
  background: string,
  width: number,
  height: number,
  scrollX = 0,
  scrollY = 0,
  dark = false,
) {
  if (style === "none" || background === "transparent") {
    return;
  }
  const create = (tag: string, attributes: Record<string, string | number>) => {
    const node = svg.ownerDocument.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) {
      node.setAttribute(key, `${value}`);
    }
    return node;
  };
  const spec = paperPattern(style);
  const id = `paper-grid-${++patternId}`;
  const pattern = create("pattern", {
    id,
    patternUnits: "userSpaceOnUse",
    width: spec.width,
    height: spec.height,
    x: scrollX % spec.width,
    y: scrollY % spec.height,
  });
  const ink = paperInk(background, dark);
  visitPaperGrid(
    style,
    spec.width,
    spec.height,
    0,
    0,
    (x1, y1, x2, y2, opacity) =>
      pattern.appendChild(
        create("path", {
          d: `M ${x1} ${y1} L ${x2} ${y2}`,
          stroke: ink,
          "stroke-width": 1,
          opacity,
        }),
      ),
    (cx, cy) =>
      pattern.appendChild(
        create("circle", { cx, cy, r: 1.2, fill: ink, opacity: 0.32 }),
      ),
  );
  const defs = create("defs", {});
  defs.appendChild(pattern);
  svg.appendChild(defs);
  svg.appendChild(create("rect", { width, height, fill: `url(#${id})` }));
}
