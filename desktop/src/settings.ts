import { FONT_FAMILY } from "@excalidraw/common";

import type { AppState } from "@excalidraw/excalidraw/types";

export type Settings = {
  version: 1;
  theme: "light" | "dark";
  shift: boolean;
  hold: boolean;
  holdMs: number;
  drawing: Partial<AppState>;
};

export const defaults: Settings = {
  version: 1,
  theme: "light",
  shift: true,
  hold: true,
  holdMs: 500,
  drawing: {},
};

export const drawingPreferences = (
  state: Partial<AppState>,
): Partial<AppState> =>
  Object.fromEntries(
    Object.entries({
      currentItemStrokeColor: state.currentItemStrokeColor,
      currentItemBackgroundColor: state.currentItemBackgroundColor,
      currentItemFillStyle: state.currentItemFillStyle,
      currentItemStrokeWidthKey: state.currentItemStrokeWidthKey,
      currentItemStrokeStyle: state.currentItemStrokeStyle,
      currentItemRoughness: state.currentItemRoughness,
      currentItemOpacity: state.currentItemOpacity,
      currentItemFontFamily: state.currentItemFontFamily,
      currentItemFontSize: state.currentItemFontSize,
      currentItemStrokeVariability: state.currentItemStrokeVariability,
    }).filter(([, value]) => value !== undefined),
  );

export function parseSettings(value: unknown): Settings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("设置文件格式不正确");
  }
  const v = value as Record<string, unknown>;
  // Unversioned exports are the only legacy format, migrated to v1.
  if (v.version !== undefined && v.version !== 1) {
    throw new Error("此设置版本暂不支持，请使用匹配的应用版本");
  }
  if (
    (v.theme !== "light" && v.theme !== "dark") ||
    typeof v.shift !== "boolean" ||
    typeof v.hold !== "boolean" ||
    typeof v.holdMs !== "number" ||
    !Number.isFinite(v.holdMs) ||
    v.holdMs < 200 ||
    v.holdMs > 2000
  ) {
    throw new Error("设置值无效：停顿时间须为 200–2000 毫秒");
  }
  const d = v.drawing;
  if (d != null && (typeof d !== "object" || Array.isArray(d))) {
    throw new Error("绘图设置格式不正确");
  }
  const drawing = drawingPreferences((d || {}) as Partial<AppState>);
  for (const [key, value] of Object.entries(drawing)) {
    if (value === undefined) {
      continue;
    }
    if (
      ["currentItemFontSize", "currentItemFontFamily"].includes(key) &&
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        value <= 0 ||
        value > 10000)
    ) {
      throw new Error("绘图数值无效");
    }
    if (
      key === "currentItemStrokeWidthKey" &&
      !["thin", "medium", "bold"].includes(String(value))
    ) {
      throw new Error("线宽无效");
    }
    if (
      key === "currentItemFontFamily" &&
      !Object.values(FONT_FAMILY).includes(Number(value))
    ) {
      throw new Error("字体无效");
    }
    if (
      key === "currentItemOpacity" &&
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 100)
    ) {
      throw new Error("透明度无效");
    }
    if (
      key === "currentItemRoughness" &&
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 2)
    ) {
      throw new Error("粗糙度无效");
    }
    if (
      key.endsWith("Color") &&
      (typeof value !== "string" ||
        !/^(#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})|transparent)$/i.test(
          value,
        ))
    ) {
      throw new Error("颜色无效");
    }
    if (
      key === "currentItemFillStyle" &&
      !["hachure", "cross-hatch", "solid", "zigzag"].includes(String(value))
    ) {
      throw new Error("填充样式无效");
    }
    if (
      key === "currentItemStrokeStyle" &&
      !["solid", "dashed", "dotted"].includes(String(value))
    ) {
      throw new Error("线条样式无效");
    }
    if (
      key === "currentItemStrokeVariability" &&
      !["constant", "variable"].includes(String(value))
    ) {
      throw new Error("笔压设置无效");
    }
  }
  return {
    version: 1,
    theme: v.theme,
    shift: v.shift,
    hold: v.hold,
    holdMs: v.holdMs,
    drawing,
  };
}
