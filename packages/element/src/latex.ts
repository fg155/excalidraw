import { mathjax } from "@mathjax/src/js/mathjax.js";
import { TeX } from "@mathjax/src/js/input/tex.js";
import { SVG } from "@mathjax/src/js/output/svg.js";
import { liteAdaptor } from "@mathjax/src/js/adaptors/liteAdaptor.js";
import { LiteElement } from "@mathjax/src/js/adaptors/lite/Element.js";
import { RegisterHTMLHandler } from "@mathjax/src/js/handlers/html.js";
import { MathJaxTexFont } from "@mathjax/mathjax-tex-font/js/svg.js";
import "@mathjax/src/js/input/tex/ams/AmsConfiguration.js";
import { getFontString, getFontFamilyString } from "@excalidraw/common";

import { getLineWidth } from "./textMeasurements";

import type { ExcalidrawTextElement } from "./types";

export type TextMode = "plain" | "latex";
export const normalizeTextMode = (value: unknown): TextMode =>
  value === "latex" ? "latex" : "plain";
type Token = { text: string; math?: boolean; display?: boolean };

/** A small delimiter scanner, not a Markdown parser. Escaped dollars stay text. */
export function splitMathText(source: string): Token[] {
  const tokens: Token[] = [];
  let plain = "";
  for (let i = 0; i < source.length; ) {
    if (source.startsWith("\\$", i)) {
      plain += "$";
      i += 2;
      continue;
    }
    const start = source.startsWith("$$", i)
      ? "$$"
      : source.startsWith("\\[", i)
      ? "\\["
      : source.startsWith("\\(", i)
      ? "\\("
      : source[i] === "$"
      ? "$"
      : "";
    if (!start) {
      plain += source[i++];
      continue;
    }
    const end = start === "\\[" ? "\\]" : start === "\\(" ? "\\)" : start;
    let j = i + start.length;
    for (; j < source.length; j++) {
      if (source[j] === "\\" && !source.startsWith(end, j)) {
        j++;
        continue;
      }
      if (source.startsWith(end, j)) {
        break;
      }
    }
    if (j >= source.length) {
      plain += source[i++];
      continue;
    }
    if (plain) {
      tokens.push({ text: plain });
      plain = "";
    }
    tokens.push({
      text: source.slice(i + start.length, j),
      math: true,
      display: start === "$$" || start === "\\[",
    });
    i = j + end.length;
  }
  if (plain) {
    tokens.push({ text: plain });
  }
  return tokens;
}

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
// No require/autoload/HTML/link extensions and no remote fonts or services.
const engine = mathjax.document("", {
  InputJax: new TeX({
    packages: ["base", "ams"],
    maxBuffer: 8192,
    maxMacros: 1000,
    formatError: (_jax: unknown, error: Error) => {
      throw error;
    },
  }),
  OutputJax: new SVG({
    fontCache: "none",
    fontData: MathJaxTexFont,
    linebreaks: { inline: false },
  }),
});
type Shape = {
  kind: string;
  attrs: Record<string, string>;
  children: Shape[];
  text: string;
};
type Formula = {
  width: number;
  ascent: number;
  descent: number;
  shape: Shape;
  svgLength: number;
};
const formulas = new Map<string, Formula | null>();
let cacheBytes = 0;
const shapeOf = (node: LiteElement): Shape => {
  const kind = adaptor.kind(node);
  if (
    !["svg", "g", "path", "rect", "line", "text"].includes(kind) ||
    adaptor.childNodes(node).some((child) => adaptor.kind(child) === "svg")
  ) {
    // Complex numbered layouts use nested viewports. Keep their source visible
    // instead of silently producing different Canvas and SVG geometry.
    throw new Error("Unsupported formula geometry");
  }
  const attrs = Object.fromEntries(
    adaptor.allAttributes(node).map(({ name, value }) => [name, value]),
  );
  // MathJax normally supplies these table rules in its page-level stylesheet.
  // Inline them so both the canvas and a standalone SVG preserve array lines.
  if (/mjx-(solid|dashed|dotted)/.test(attrs.class ?? "")) {
    attrs.fill = "none";
    attrs["stroke-width"] ||= attrs["stroke-thickness"] || "70";
    if (attrs.class.includes("dashed")) {
      attrs["stroke-dasharray"] ||= "140";
    }
    if (attrs.class.includes("dotted")) {
      attrs["stroke-dasharray"] ||= "0 140";
      attrs["stroke-linecap"] = "round";
    }
  }
  return {
    kind,
    attrs,
    children: adaptor
      .childNodes(node)
      .filter((child): child is LiteElement => child instanceof LiteElement)
      .map(shapeOf),
    text: adaptor.textContent(node),
  };
};

function formula(source: string, display: boolean): Formula | null {
  const key = `${display}:${source}`;
  if (formulas.has(key)) {
    return formulas.get(key)!;
  }
  let result: Formula | null = null;
  try {
    if (source.length > 8192) {
      throw new Error("Formula is too long");
    }
    const container = engine.convert(source, { display });
    const svg = adaptor
      .childNodes(container)
      .find(
        (node): node is LiteElement =>
          node instanceof LiteElement && adaptor.kind(node) === "svg",
      );
    if (!svg) {
      throw new Error("Missing SVG");
    }
    const [, y, width, height] = adaptor
      .getAttribute(svg, "viewBox")
      .split(/\s+/)
      .map(Number);
    result = {
      width: width / 1000,
      ascent: -y / 1000,
      descent: (height + y) / 1000,
      shape: shapeOf(svg),
      svgLength: adaptor.innerHTML(svg).length,
    };
  } catch {
    // Malformed/unsupported input remains visible and editable as source.
  }
  const size = source.length + (result?.svgLength ?? 0);
  if (cacheBytes + size > 1_000_000 || formulas.size >= 128) {
    formulas.clear();
    cacheBytes = 0;
  }
  if (size <= 1_000_000) {
    formulas.set(key, result);
    cacheBytes += size;
  }
  return result;
}

type Run = {
  x: number;
  y: number;
  width: number;
  text: string;
  formula?: Formula;
  scale?: number;
  error?: boolean;
};
export type MathLayout = {
  width: number;
  height: number;
  runs: Run[];
  errors: boolean;
};
type TextStyle = Pick<
  ExcalidrawTextElement,
  "fontFamily" | "fontSize" | "lineHeight" | "textAlign"
>;

/** Math is an indivisible inline box; wrap surrounding prose without splitting TeX. */
export function layoutMath(
  source: string,
  style: TextStyle,
  maxWidth = Infinity,
): MathLayout {
  const font = getFontString(style);
  const size = style.fontSize;
  const runs: Run[] = [];
  let line: Run[] = [];
  let x = 0;
  let y = 0;
  let width = 0;
  let ascent = size * 0.8;
  let descent = size * 0.2;
  let errors = false;
  const finish = () => {
    const height = Math.max(
      size * style.lineHeight,
      ascent + descent + size * 0.15,
    );
    const offset = Number.isFinite(maxWidth)
      ? Math.max(0, maxWidth - x) *
        (style.textAlign === "center"
          ? 0.5
          : style.textAlign === "right"
          ? 1
          : 0)
      : 0;
    for (const run of line) {
      run.x += offset;
      run.y = y + ascent + (height - ascent - descent) / 2;
      runs.push(run);
    }
    width = Math.max(width, x);
    y += height;
    line = [];
    x = 0;
    ascent = size * 0.8;
    descent = size * 0.2;
  };
  const add = (text: string, math?: Formula, error = false) => {
    // A single long equation fits the block without cutting off its right edge.
    const scale = math
      ? Math.min(1, Math.max(1, maxWidth) / (math.width * size || 1))
      : 1;
    const w = math ? math.width * size * scale : getLineWidth(text, font);
    if (x > 0 && x + w > maxWidth + 0.01) {
      finish();
    }
    if (math) {
      ascent = Math.max(ascent, math.ascent * size * scale);
      descent = Math.max(descent, math.descent * size * scale);
    }
    line.push({ x, y: 0, width: w, text, formula: math, error, scale });
    x += w;
  };
  for (const token of splitMathText(source)) {
    if (token.math) {
      if (token.display && line.length) {
        finish();
      }
      const result = formula(token.text, !!token.display);
      errors ||= !result;
      if (result) {
        add("", result);
      } else {
        const delimiter = token.display ? "$$" : "$";
        for (const char of `${delimiter}${token.text}${delimiter}`) {
          add(char, undefined, true);
        }
      }
      if (token.display) {
        finish();
      }
    } else {
      // Latin words stay together; CJK and very long words can wrap by codepoint.
      for (const part of token.text
        .split(/(\n|[^\S\n]+|[\u2e80-\u9fff])/u)
        .filter(Boolean)) {
        if (part === "\n") {
          finish();
        } else if (getLineWidth(part, font) > maxWidth) {
          for (const char of part) {
            add(char);
          }
        } else {
          add(part);
        }
      }
    }
  }
  if (line.length || !y) {
    finish();
  }
  return { width: Math.max(1, width), height: y, runs, errors };
}

const layouts = new WeakMap<
  ExcalidrawTextElement,
  { key: string; value: MathLayout }
>();
export const invalidateMathLayout = (element: ExcalidrawTextElement) =>
  layouts.delete(element);
export function getMathLayout(
  element: ExcalidrawTextElement,
  maxWidth = element.width,
) {
  const key = `${element.originalText}|${element.fontSize}|${element.fontFamily}|${element.lineHeight}|${element.textAlign}|${maxWidth}`;
  const cached = layouts.get(element);
  if (cached?.key === key) {
    return cached.value;
  }
  const value = layoutMath(element.originalText, element, maxWidth);
  layouts.set(element, { key, value });
  return value;
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  strokeWidth = 0,
  fill = true,
) {
  ctx.save();
  strokeWidth =
    shape.attrs["stroke-width"] === undefined
      ? strokeWidth
      : parseFloat(shape.attrs["stroke-width"]);
  fill = shape.attrs.fill === "none" ? false : shape.attrs.fill ? true : fill;
  if (strokeWidth > 0) {
    ctx.lineWidth = strokeWidth;
  }
  if (shape.attrs["stroke-dasharray"]) {
    ctx.setLineDash(
      shape.attrs["stroke-dasharray"].split(/[\s,]+/).map(Number),
    );
  }
  if (shape.attrs["stroke-linecap"] === "round") {
    ctx.lineCap = "round";
  }
  for (const transform of (shape.attrs.transform ?? "").matchAll(
    /(translate|scale|matrix)\(([^)]+)\)/g,
  )) {
    const v = transform[2]
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (transform[1] === "translate") {
      ctx.translate(v[0], v[1] ?? 0);
    } else if (transform[1] === "scale") {
      ctx.scale(v[0], v[1] ?? v[0]);
    } else {
      ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
    }
  }
  if (shape.kind === "path") {
    const Path = ctx.canvas.ownerDocument.defaultView!.Path2D;
    const path = new Path(shape.attrs.d);
    if (fill) {
      ctx.fill(path);
    }
    if (strokeWidth > 0) {
      ctx.stroke(path);
    }
  } else if (shape.kind === "line") {
    ctx.beginPath();
    ctx.moveTo(Number(shape.attrs.x1), Number(shape.attrs.y1));
    ctx.lineTo(Number(shape.attrs.x2), Number(shape.attrs.y2));
    if (strokeWidth > 0) {
      ctx.stroke();
    }
  } else if (shape.kind === "rect") {
    const box: [number, number, number, number] = [
      Number(shape.attrs.x ?? 0),
      Number(shape.attrs.y ?? 0),
      Number(shape.attrs.width),
      Number(shape.attrs.height),
    ];
    if (fill) {
      ctx.fillRect(...box);
    }
    if (strokeWidth > 0) {
      ctx.strokeRect(...box);
    }
  } else if (shape.kind === "text") {
    ctx.font = `${shape.attrs["font-size"] || "1000px"} ${
      shape.attrs["font-family"] || "serif"
    }`;
    ctx.fillText(
      shape.text,
      Number(shape.attrs.x ?? 0),
      Number(shape.attrs.y ?? 0),
    );
  }
  for (const child of shape.children) {
    drawShape(ctx, child, strokeWidth, fill);
  }
  ctx.restore();
}

export function drawMathText(
  ctx: CanvasRenderingContext2D,
  element: ExcalidrawTextElement,
) {
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = getFontString(element);
  ctx.strokeStyle = ctx.fillStyle;
  const layout = getMathLayout(element);
  for (const run of layout.runs) {
    ctx.save();
    if (run.error) {
      ctx.fillStyle = "#d22";
    }
    if (run.formula) {
      ctx.translate(run.x, run.y);
      const scale = (element.fontSize * (run.scale ?? 1)) / 1000;
      ctx.scale(scale, scale);
      for (const shape of run.formula.shape.children) {
        drawShape(ctx, shape);
      }
    } else {
      ctx.fillText(run.text, run.x, run.y);
    }
    ctx.restore();
  }
}

export function appendMathSvg(
  parent: SVGElement,
  element: ExcalidrawTextElement,
  color: string,
) {
  const doc = parent.ownerDocument;
  for (const run of getMathLayout(element).runs) {
    if (run.formula) {
      const group = doc.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute(
        "transform",
        `translate(${run.x} ${run.y}) scale(${
          (element.fontSize * (run.scale ?? 1)) / 1000
        })`,
      );
      group.setAttribute("color", color);
      // Only SVG generated by our restricted MathJax configuration reaches here.
      const appendShape = (parent: SVGElement, shape: Shape) => {
        const node = doc.createElementNS(
          "http://www.w3.org/2000/svg",
          shape.kind,
        );
        for (const [key, value] of Object.entries(shape.attrs)) {
          node.setAttribute(key, value);
        }
        if (shape.kind === "text") {
          node.textContent = shape.text;
        }
        for (const child of shape.children) {
          appendShape(node, child);
        }
        parent.appendChild(node);
      };
      for (const child of run.formula.shape.children) {
        appendShape(group, child);
      }
      parent.appendChild(group);
    } else {
      const text = doc.createElementNS("http://www.w3.org/2000/svg", "text");
      text.textContent = run.text;
      text.setAttribute("x", `${run.x}`);
      text.setAttribute("y", `${run.y}`);
      text.setAttribute("font-family", getFontFamilyString(element));
      text.setAttribute("font-size", `${element.fontSize}`);
      text.setAttribute("fill", run.error ? "#d22" : color);
      text.setAttribute("style", "white-space:pre");
      parent.appendChild(text);
    }
  }
}
