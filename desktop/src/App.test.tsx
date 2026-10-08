import { beforeEach, describe, expect, it, vi } from "vitest";
import { pointFrom } from "@excalidraw/math";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import { API } from "../../packages/excalidraw/tests/helpers/api";

import { DesktopApp } from "./App";
import { defaults } from "./settings";
import * as snapshots from "./boardSnapshot";

const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  onCloseRequested: vi.fn().mockResolvedValue(() => {}),
  destroy: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: native.invoke,
  isTauri: () => true,
}));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => native }));

const boards = new Map<string, { content: string; revision: string }>();
const trash = new Map<
  string,
  { name: string; content: string; deletedAt: number }
>();
let storedSettings: string | null;
let failSaves: boolean;
let counter = 0;
const empty = JSON.stringify({
  type: "excalidraw",
  version: 2,
  elements: [],
  files: {},
  appState: {},
});

beforeEach(() => {
  vi.clearAllMocks();
  boards.clear();
  trash.clear();
  boards.set("existing.excalidraw", { content: empty, revision: "r0" });
  storedSettings = null;
  failSaves = false;
  native.invoke.mockImplementation(
    async (command: string, args: Record<string, string> = {}) => {
      switch (command) {
        case "get_context":
          return {
            directory: "boards",
            dataDirectory: "local-data",
            settings: storedSettings,
          };
        case "list_boards":
          return [...boards.keys()].map((name) => ({ name, modified: 0 }));
        case "read_board":
          return { name: args.name, ...boards.get(args.name) };
        case "backup_board":
          return;
        case "list_trash":
          return [...trash].map(([id, entry]) => ({ id, ...entry }));
        case "restore_trash": {
          const entry = trash.get(args.id)!;
          boards.set(entry.name, {
            content: entry.content,
            revision: `r${++counter}`,
          });
          trash.delete(args.id);
          return { name: entry.name, ...boards.get(entry.name) };
        }
        case "save_board": {
          if (failSaves) {
            throw new Error("test disk offline");
          }
          const revision = `r${++counter}`;
          boards.set(args.name, { content: args.content, revision });
          return { name: args.name, revision, conflict: false };
        }
        case "save_settings":
          storedSettings = args.content;
          return;
        case "rename_board":
          boards.set(args.newName, boards.get(args.name)!);
          boards.delete(args.name);
          return;
        case "trash_board":
          trash.set(`trash-${++counter}`, {
            name: args.name,
            content: boards.get(args.name)!.content,
            deletedAt: Date.now(),
          });
          boards.delete(args.name);
          return;
        default:
          throw new Error(`Unexpected command ${command}`);
      }
    },
  );
});

function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  return render(<DesktopApp host={host} />, { container: host });
}

async function openExisting() {
  fireEvent.click(await screen.findByRole("button", { name: "existing" }));
  await waitFor(() => {
    expect(document.querySelector("canvas.static")).not.toBeNull();
    expect(window.h.state.isLoading).toBe(false);
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
  });
}

describe("desktop shell with real editor and mocked native IPC", () => {
  it("flushes the last text mode on close and restores it alongside per-block modes", async () => {
    const view = mount();
    await openExisting();
    const text = API.createElement({ type: "text", text: "$x^2$" });
    API.setElements([text]);
    API.setSelectedElements([text]);
    fireEvent.click(screen.getByTestId("text-mode-latex"));
    const close = native.onCloseRequested.mock.calls[0][0];
    await act(async () => {
      await close({ preventDefault: vi.fn() });
    });
    expect(JSON.parse(storedSettings!).drawing.currentItemTextMode).toBe(
      "latex",
    );
    expect(
      JSON.parse(boards.get("existing.excalidraw")!.content).elements[0]
        .textMode,
    ).toBe("latex");
    view.unmount();
    mount();
    await openExisting();
    expect(window.h.state.currentItemTextMode).toBe("latex");
    expect(window.h.elements[0]).toMatchObject({
      textMode: "latex",
      originalText: "$x^2$",
    });
  });

  it("loads an old file without tombstones and compacts only when saved", async () => {
    const live = API.createElement({ type: "rectangle" });
    const deleted = API.createElement({ type: "ellipse", isDeleted: true });
    const content = JSON.stringify({
      ...JSON.parse(empty),
      elements: [live, deleted],
    });
    boards.set("existing.excalidraw", { content, revision: "old" });
    mount();
    await openExisting();
    expect(window.h.elements.map((element) => element.id)).toEqual([live.id]);
    expect(boards.get("existing.excalidraw")!.content).toBe(content);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(
        JSON.parse(boards.get("existing.excalidraw")!.content).elements,
      ).toHaveLength(1),
    );
  });

  it("saving a deletion preserves in-session undo and releases the editor on home", async () => {
    mount();
    await openExisting();
    const live = API.createElement({ type: "rectangle" });
    API.updateScene({
      elements: [live],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    API.updateScene({
      elements: [
        {
          ...live,
          isDeleted: true,
          version: live.version + 1,
          versionNonce: live.versionNonce + 1,
        },
      ],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "保存" })).toBeEnabled(),
    );
    expect(
      JSON.parse(boards.get("existing.excalidraw")!.content).elements,
    ).toHaveLength(0);
    expect(
      window.h.elements.some(
        (element) => element.id === live.id && element.isDeleted,
      ),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(
      window.h.elements.some(
        (element) => element.id === live.id && !element.isDeleted,
      ),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "返回画板首页" }));
    await screen.findByRole("main", { name: "画板首页" });
    await openExisting();
    expect(
      window.h.elements.filter((element) => !element.isDeleted),
    ).toHaveLength(1);
  });

  it("does not serialize the board on every drawing or viewport update", async () => {
    mount();
    await openExisting();
    const serialize = vi.spyOn(snapshots, "serializeBoard");
    try {
      const ink = API.createElement({
        type: "freedraw",
        points: [pointFrom(0, 0), pointFrom(10, 10)],
      });
      for (let i = 0; i < 25; i++) {
        API.setElements([
          { ...ink, version: i + 1, versionNonce: i + 1, x: i },
        ]);
        API.setAppState({ scrollX: i });
      }
      expect(serialize).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "保存" })).toBeEnabled(),
      );
      expect(serialize).toHaveBeenCalledTimes(1);
      expect(
        JSON.parse(boards.get("existing.excalidraw")!.content).elements[0].x,
      ).toBe(24);
    } finally {
      serialize.mockRestore();
    }
  });

  it("saves paper per board, supports undo, and leaves drawing and snapping alone", async () => {
    mount();
    await openExisting();
    API.setElements([
      API.createElement({
        type: "freedraw",
        points: [pointFrom(0, 0), pointFrom(30, 30)],
      }),
    ]);
    const before = JSON.stringify(window.h.elements);
    fireEvent.click(screen.getByRole("button", { name: "背景" }));
    fireEvent.click(screen.getByRole("button", { name: "浅黄" }));
    fireEvent.click(screen.getByRole("button", { name: "三角形" }));
    expect(window.h.state.paperGrid).toBe("triangle");
    expect(window.h.state.viewBackgroundColor).toBe("#fff0a6");
    expect(window.h.state.gridModeEnabled).toBe(false);
    expect(JSON.stringify(window.h.elements)).toBe(before);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "关闭" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(window.h.state.paperGrid).toBe("none");
    fireEvent.click(screen.getByRole("button", { name: "重做" }));
    expect(window.h.state.paperGrid).toBe("triangle");
    fireEvent.click(screen.getByRole("button", { name: "返回画板首页" }));
    await screen.findByRole("main", { name: "画板首页" });
    const saved = JSON.parse(boards.get("existing.excalidraw")!.content);
    expect(saved.appState.paperGrid).toBe("triangle");
    expect(saved.appState.viewBackgroundColor).toBe("#fff0a6");
    await openExisting();
    expect(window.h.state.paperGrid).toBe("triangle");
    fireEvent.click(screen.getByRole("button", { name: "背景" }));
    expect(screen.getByRole("button", { name: "三角形" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "关闭" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "返回画板首页" }));
    await screen.findByRole("main", { name: "画板首页" });
    fireEvent.click(screen.getByRole("button", { name: "新建画板" }));
    fireEvent.change(screen.getByLabelText("画布名称"), {
      target: { value: "plain" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    await waitFor(() => expect(window.h.state.paperGrid).toBe("none"));
    expect(window.h.state.viewBackgroundColor).toBe("#ffffff");
  });

  it("starts on the gallery and mounts no editor until a board is selected", async () => {
    mount();
    await screen.findByRole("button", { name: "existing" });
    expect(screen.getByRole("main", { name: "画板首页" })).toBeInTheDocument();
    expect(document.querySelector("canvas.static")).toBeNull();
    expect(screen.queryByText("给想法一张画布")).toBeNull();
    await openExisting();
    expect(screen.queryByRole("main", { name: "画板首页" })).toBeNull();
    expect(document.querySelector(".boards-panel")).toBeNull();
    expect(screen.getByRole("button", { name: "返回画板首页" })).toBeEnabled();
  });

  it("flushes on return home, then reopens the saved board", async () => {
    mount();
    await openExisting();
    API.setElements([
      API.createElement({ type: "rectangle", width: 90, height: 50 }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "返回画板首页" }));
    await screen.findByRole("main", { name: "画板首页" });
    expect(
      JSON.parse(boards.get("existing.excalidraw")!.content).elements,
    ).toHaveLength(1);
    expect(document.querySelector("canvas.static")).toBeNull();
    await openExisting();
    expect(window.h.elements[0].type).toBe("rectangle");
  });

  it("a broken thumbnail cannot hide or overwrite another board", async () => {
    boards.set("broken.excalidraw", {
      content: "invalid JSON",
      revision: "bad",
    });
    mount();
    await screen.findByRole("button", { name: "broken" });
    await screen.findByText("预览不可用");
    await openExisting();
    expect(boards.get("broken.excalidraw")!.content).toBe("invalid JSON");
  });

  it("can cancel deletion on the home page without touching the board", async () => {
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "删除 existing" }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "关闭" }),
    );
    expect(boards.has("existing.excalidraw")).toBe(true);
    expect(trash.size).toBe(0);
  });

  it("renders a saved board thumbnail without writing back normalized content", async () => {
    const content = JSON.stringify({
      ...JSON.parse(empty),
      elements: [
        API.createElement({ type: "rectangle", width: 160, height: 90 }),
      ],
    });
    boards.set("existing.excalidraw", { content, revision: "drawing" });
    mount();
    const card = await screen.findByRole("button", { name: "existing" });
    await waitFor(() =>
      expect(card.querySelector("img")?.getAttribute("src")).toMatch(
        /^data:image\/png/,
      ),
    );
    expect(boards.get("existing.excalidraw")!.content).toBe(content);
    expect(native.invoke.mock.calls.some(([cmd]) => cmd === "save_board")).toBe(
      false,
    );
  });

  it("creates a board from the gallery and returns to the updated gallery", async () => {
    mount();
    await screen.findByRole("button", { name: "existing" });
    fireEvent.click(screen.getByRole("button", { name: "新建画板" }));
    fireEvent.change(screen.getByLabelText("画布名称"), {
      target: { value: "new-board" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    await screen.findByRole("button", { name: "返回画板首页" });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "返回画板首页" }),
      ).toBeEnabled(),
    );
    expect(boards.has("new-board.excalidraw")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "返回画板首页" }));
    await screen.findByRole("button", { name: "new-board" });
    expect(screen.getByRole("button", { name: "existing" })).toBeEnabled();
  });

  it("loads without blank overwrite; saves edits then renames and recoverably deletes", async () => {
    mount();
    await openExisting();
    expect(native.invoke.mock.calls.some(([cmd]) => cmd === "save_board")).toBe(
      false,
    );
    API.setElements([
      API.createElement({ type: "rectangle", width: 70, height: 40 }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(
        JSON.parse(boards.get("existing.excalidraw")!.content).elements,
      ).toHaveLength(1),
    );
    fireEvent.click(screen.getByRole("button", { name: "返回画板首页" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "重命名 existing" }),
    );
    fireEvent.change(screen.getByLabelText("画布名称"), {
      target: { value: "renamed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    await waitFor(() => expect(boards.has("renamed.excalidraw")).toBe(true));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "删除 renamed" }));
    expect(boards.has("renamed.excalidraw")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "移到回收站" }));
    await waitFor(() => expect(boards.has("renamed.excalidraw")).toBe(false));
    await screen.findByText("暂无画板");
    expect(trash.size).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "回收站" }));
    const recycle = await screen.findByRole("dialog", { name: "回收站" });
    fireEvent.click(within(recycle).getByRole("button", { name: "恢复" }));
    await waitFor(() =>
      expect(document.querySelector(".current-name")?.textContent).toBe(
        "renamed",
      ),
    );
    expect(trash.size).toBe(0);
    expect(
      JSON.parse(boards.get("renamed.excalidraw")!.content).elements,
    ).toHaveLength(1);
  });

  it("keeps the current editor open if a save fails during switching", async () => {
    boards.set("second.excalidraw", { content: empty, revision: "r-other" });
    mount();
    await openExisting();
    API.setElements([
      API.createElement({ type: "ellipse", width: 50, height: 50 }),
    ]);
    failSaves = true;
    fireEvent.click(screen.getByRole("button", { name: "返回画板首页" }));
    await screen.findByText("Error: test disk offline");
    expect(document.querySelector(".current-name")?.textContent).toBe(
      "existing",
    );
    expect(window.h.elements[0].type).toBe("ellipse");
    expect(
      native.invoke.mock.calls.some(([cmd]) => cmd === "backup_board"),
    ).toBe(true);
    failSaves = false;
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(
        JSON.parse(boards.get("existing.excalidraw")!.content).elements[0].type,
      ).toBe("ellipse"),
    );
  });

  it("does not replace corrupt settings without an explicit choice", async () => {
    storedSettings = "broken-json";
    mount();
    await openExisting();
    API.setAppState({ currentItemStrokeColor: "#ff0000" });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "设置" })).toBeEnabled(),
    );
    expect(storedSettings).toBe("broken-json");
    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "使用默认设置" }),
    );
    await waitFor(() =>
      expect(JSON.parse(storedSettings!).version).toBe(defaults.version),
    );
  });

  it("waits for the current document to save before closing the native window", async () => {
    mount();
    await openExisting();
    API.setElements([
      API.createElement({ type: "rectangle", width: 70, height: 40 }),
    ]);
    const close = native.onCloseRequested.mock.calls[0][0];
    const preventDefault = vi.fn();
    await act(async () => {
      await close({ preventDefault });
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(native.destroy).toHaveBeenCalledOnce();
    expect(
      JSON.parse(boards.get("existing.excalidraw")!.content).elements,
    ).toHaveLength(1);
  });
});
