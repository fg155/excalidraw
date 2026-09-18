import { describe, expect, it, vi } from "vitest";

import { DocumentSession } from "./session";

import type { BoardRepository, SavedBoard } from "./repository";

function setup() {
  const save = vi.fn<BoardRepository["save"]>().mockResolvedValue({
    name: "a.excalidraw",
    revision: "r2",
    conflict: false,
  });
  const repo = { save } as unknown as BoardRepository;
  const backup = vi.fn().mockResolvedValue(undefined);
  const session = new DocumentSession(
    { name: "a.excalidraw", revision: "r1" },
    repo,
    window,
    vi.fn(),
    backup,
  );
  return { session, save, backup };
}

describe("document save queue", () => {
  it("ignores changes before initialization and does not save normalization", async () => {
    const { session, save } = setup();
    session.update("blank");
    session.initialize("normalized");
    await session.flush();
    expect(save).not.toHaveBeenCalled();
    session.dispose();
  });

  it("debounces updates and flushes immediately for a switch", async () => {
    const { session, save } = setup();
    session.initialize("a");
    session.update("b");
    session.update("c");
    await session.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("a.excalidraw", "c", "r1");
    expect(session.state).toBe("saved");
    session.dispose();
  });

  it("serializes edits during a write using the returned revision and conflict name", async () => {
    const { session, save } = setup();
    let finish!: (value: SavedBoard) => void;
    save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    save.mockResolvedValue({
      name: "copy.excalidraw",
      revision: "r3",
      conflict: false,
    });
    session.initialize("a");
    session.update("b");
    const pending = session.flush();
    await Promise.resolve();
    session.update("c");
    expect(session.flush()).toBe(pending);
    finish({ name: "copy.excalidraw", revision: "r2", conflict: true });
    await pending;
    expect(save.mock.calls).toEqual([
      ["a.excalidraw", "b", "r1"],
      ["copy.excalidraw", "c", "r2"],
    ]);
    expect(session.conflict).toBe(true);
    session.dispose();
  });

  it("keeps failed content dirty, backs it up, and retries without advancing revision", async () => {
    const { session, save, backup } = setup();
    save.mockRejectedValueOnce(new Error("disk unavailable"));
    session.initialize("a");
    session.update("b");
    await expect(session.flush()).rejects.toThrow("disk unavailable");
    expect(session.state).toBe("error");
    expect(session.revision).toBe("r1");
    expect(backup).toHaveBeenCalledWith("a.excalidraw", "b");
    await session.flush();
    expect(save).toHaveBeenLastCalledWith("a.excalidraw", "b", "r1");
    expect(session.state).toBe("saved");
    session.dispose();
  });

  it("saves an undo made while the earlier state is in flight", async () => {
    const { session, save } = setup();
    let finish!: (value: SavedBoard) => void;
    save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    session.initialize("a");
    session.update("b");
    const pending = session.flush();
    await Promise.resolve();
    session.update("a");
    finish({ name: "a.excalidraw", revision: "r2", conflict: false });
    await pending;
    expect(save).toHaveBeenLastCalledWith("a.excalidraw", "a", "r2");
    session.dispose();
  });
});
