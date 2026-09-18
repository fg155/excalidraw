import { beforeEach, describe, expect, it, vi } from "vitest";
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
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "重命名" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "重命名" }));
    fireEvent.change(screen.getByLabelText("画布名称"), {
      target: { value: "renamed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    await waitFor(() => expect(boards.has("renamed.excalidraw")).toBe(true));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(boards.has("renamed.excalidraw")).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "确认删除（可从恢复记录找回）" }),
    );
    await waitFor(() => expect(boards.has("renamed.excalidraw")).toBe(false));
    await screen.findByText("给想法一张画布");
  });

  it("keeps the current editor open if a save fails during switching", async () => {
    boards.set("second.excalidraw", { content: empty, revision: "r-other" });
    mount();
    await openExisting();
    API.setElements([
      API.createElement({ type: "ellipse", width: 50, height: 50 }),
    ]);
    failSaves = true;
    fireEvent.click(screen.getByRole("button", { name: "second" }));
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
