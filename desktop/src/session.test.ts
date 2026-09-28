import { afterEach, describe, expect, it, vi } from "vitest";

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
  afterEach(() => vi.useRealTimers());

  it("coalesces rapid drawing snapshots and serializes only after 600ms idle", async () => {
    vi.useFakeTimers();
    const { session, save } = setup();
    session.initialize("initial");
    const serialize = vi.fn(() => "latest");
    for (let i = 0; i < 100; i++) {
      session.update(serialize);
      await vi.advanceTimersByTimeAsync(10);
    }
    expect(serialize).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(serialize).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("a.excalidraw", "latest", "r1");
    session.dispose();
  });

  it("flushes a lazy snapshot immediately and skips unchanged serialized output", async () => {
    const { session, save } = setup();
    session.initialize("initial");
    const serialize = vi.fn(() => "initial");
    session.update(serialize);
    await session.flush();
    expect(serialize).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(session.state).toBe("saved");
    session.dispose();
  });

  it("keeps a failed serializer pending for retry", async () => {
    const { session, save } = setup();
    session.initialize("initial");
    const serialize = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("encoding failed");
      })
      .mockReturnValue("latest");
    session.update(serialize);
    await expect(session.flush()).rejects.toThrow("encoding failed");
    expect(session.state).toBe("error");
    expect(save).not.toHaveBeenCalled();
    await session.flush();
    expect(save).toHaveBeenCalledWith("a.excalidraw", "latest", "r1");
    session.dispose();
  });

  it("defers old-file compaction until a flush without saving on initialization", async () => {
    const { session, save } = setup();
    session.initialize("compact", true);
    expect(save).not.toHaveBeenCalled();
    expect(session.state).toBe("pending");
    await session.flush();
    expect(save).toHaveBeenCalledWith("a.excalidraw", "compact", "r1");
    session.dispose();
  });

  it("drops deferred scene references on dispose", async () => {
    vi.useFakeTimers();
    const { session, save } = setup();
    session.initialize("initial");
    const serialize = vi.fn(() => "latest");
    session.update(serialize);
    session.dispose();
    await vi.advanceTimersByTimeAsync(1000);
    await session.flush();
    expect(serialize).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
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
    session.update(() => "b");
    const pending = session.flush();
    await Promise.resolve();
    session.update(() => "c");
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
