import { useEffect, useMemo, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

import {
  Excalidraw,
  loadFromBlob,
  serializeAsJSON,
} from "@excalidraw/excalidraw";

import type { ImportedDataState } from "@excalidraw/excalidraw/data/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { repository } from "./repository";
import { DocumentSession } from "./session";
import { defaults, drawingPreferences, parseSettings } from "./settings";
import { BoardHome, boardLabel as label } from "./BoardHome";

import "./styles.css";

import type { BoardFile, LoadedBoard } from "./repository";
import type { Settings } from "./settings";

type Context = {
  directory: string | null;
  dataDirectory: string;
  settings: string | null;
};
type Recovery = { id: string; name: string; modified: number };
type TrashEntry = { id: string; name: string; deletedAt: number };
type OpenDocument = {
  key: number;
  initialData: ImportedDataState;
  session: DocumentSession;
};
type Panel =
  | "settings"
  | "recovery"
  | "trash"
  | "new"
  | "rename"
  | "delete"
  | null;

const emptyBoard = JSON.stringify({
  type: "excalidraw",
  version: 2,
  elements: [],
  appState: {},
  files: {},
});
const filename = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("请输入画布名称");
  }
  return trimmed.endsWith(".excalidraw") ? trimmed : `${trimmed}.excalidraw`;
};

export function DesktopApp({ host }: { host: HTMLElement }) {
  const ownerDocument = host.ownerDocument;
  const ownerWindow = ownerDocument.defaultView!;
  const [context, setContext] = useState<Context | null>(null);
  const [files, setFiles] = useState<BoardFile[]>([]);
  const [document, setDocument] = useState<OpenDocument | null>(null);
  const active = useRef<OpenDocument | null>(null);
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const sequence = useRef(0);
  const [, redraw] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [name, setName] = useState("");
  const [recoveries, setRecoveries] = useState<Recovery[]>([]);
  const [trash, setTrash] = useState<TrashEntry[]>([]);
  const [target, setTarget] = useState<BoardFile | null>(null);
  const [settings, setSettings] = useState<Settings>(defaults);
  const settingsRef = useRef(settings);
  const settingsWritable = useRef(false);
  const [settingsInvalid, setSettingsInvalid] = useState(false);
  const settingsPersisted = useRef("");
  const settingsFlight = useRef<Promise<void> | null>(null);
  const settingsTimer = useRef<number | undefined>(undefined);

  const refresh = async () => setFiles(await repository.list());
  const refreshTrash = async () =>
    setTrash(await invoke<TrashEntry[]>("list_trash"));
  const report = (reason: unknown) => setError(String(reason));
  const operate = async (action: () => Promise<void>) => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      report(reason);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const flushSettings = (): Promise<void> => {
    ownerWindow.clearTimeout(settingsTimer.current);
    if (!settingsWritable.current) {
      return Promise.resolve();
    }
    if (settingsFlight.current) {
      return settingsFlight.current;
    }
    settingsFlight.current = (async () => {
      while (
        JSON.stringify(settingsRef.current) !== settingsPersisted.current
      ) {
        const content = JSON.stringify(settingsRef.current);
        await invoke("save_settings", { content });
        settingsPersisted.current = content;
      }
    })().finally(() => {
      settingsFlight.current = null;
    });
    return settingsFlight.current;
  };

  const changeSettings = (next: Settings) => {
    if (JSON.stringify(next) === JSON.stringify(settingsRef.current)) {
      return;
    }
    settingsRef.current = next;
    setSettings(next);
    ownerWindow.clearTimeout(settingsTimer.current);
    settingsTimer.current = ownerWindow.setTimeout(() => {
      void flushSettings().catch(report);
    }, 600);
  };

  const flush = async () => {
    await active.current?.session.flush();
    await flushSettings();
  };

  useEffect(() => {
    if (!isTauri()) {
      setError(
        "此页面需要通过桌面应用打开；浏览器预览无法访问本机画布与设置。",
      );
      return;
    }
    let cancelled = false;
    void invoke<Context>("get_context")
      .then(async (value) => {
        if (cancelled) {
          return;
        }
        setContext(value);
        try {
          const next = value.settings
            ? parseSettings(JSON.parse(value.settings))
            : defaults;
          settingsRef.current = next;
          setSettings(next);
          settingsPersisted.current = JSON.stringify(next);
          settingsWritable.current = true;
        } catch (reason) {
          setSettingsInvalid(true);
          report(`原设置未被覆盖。请导入有效设置或明确恢复默认值：${reason}`);
        }
        if (value.directory) {
          await refresh();
        }
        await refreshTrash();
      })
      .catch(report);
    const closeListener = getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault();
      if (busyRef.current) {
        return;
      }
      await operate(async () => {
        await flush();
        await getCurrentWindow().destroy();
      });
    });
    void closeListener.catch(report);
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        event.stopImmediatePropagation();
        void operate(flush);
      }
    };
    ownerDocument.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelled = true;
      ownerWindow.clearTimeout(settingsTimer.current);
      ownerDocument.removeEventListener("keydown", onKeyDown, true);
      void closeListener.then((unlisten) => unlisten()).catch(report);
      active.current?.session.dispose();
    };
    // Owner and mutable refs are stable for this application lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No background service: expire while open, or on the next launch.
  useEffect(() => {
    if (!trash.length) {
      return;
    }
    const nextExpiry =
      Math.min(...trash.map((entry) => entry.deletedAt)) +
      10 * 24 * 60 * 60 * 1000;
    const timer = ownerWindow.setTimeout(() => {
      void refreshTrash().catch(report);
    }, Math.max(1000, Math.min(24 * 60 * 60 * 1000, nextExpiry - Date.now())));
    return () => ownerWindow.clearTimeout(timer);
  }, [trash, ownerWindow]);

  const open = async (board: LoadedBoard) => {
    // Decode first so a bad file cannot close the currently open document.
    const data = await loadFromBlob(
      new Blob([board.content], { type: "application/json" }),
      null,
      null,
    );
    await flush();
    active.current?.session.dispose();
    const session = new DocumentSession(
      board,
      repository,
      ownerWindow,
      () => redraw((value) => value + 1),
      (boardName, content) =>
        invoke("backup_board", { name: boardName, content }),
    );
    const next: OpenDocument = {
      key: ++sequence.current,
      session,
      initialData: {
        ...data,
        appState: { ...data.appState, ...settingsRef.current.drawing },
        scrollToContent: true,
      },
    };
    active.current = next;
    api.current = null;
    setDocument(next);
    setPanel(null);
  };

  const create = async (content = emptyBoard, proposedName = name) => {
    await flush();
    const boardName = filename(proposedName);
    // Creating/importing never overwrites a name already on disk.
    if (
      (await repository.list()).some(
        (file) => file.name.toLowerCase() === boardName.toLowerCase(),
      )
    ) {
      throw new Error("同名画布已存在，请换一个名称");
    }
    const saved = await repository.save(boardName, content, null);
    await open({ ...saved, content });
    await refresh();
  };

  const chooseDirectory = async () => {
    await flush();
    const directory = await invoke<string | null>("choose_directory");
    if (!directory) {
      return;
    }
    active.current?.session.dispose();
    active.current = null;
    api.current = null;
    setDocument(null);
    setContext((previous) =>
      previous ? { ...previous, directory } : previous,
    );
    await refresh();
  };

  const goHome = async () => {
    await flush();
    await refresh();
    active.current?.session.dispose();
    active.current = null;
    api.current = null;
    setDocument(null);
    setPanel(null);
    setTarget(null);
  };

  const gesture = useMemo(
    () => ({
      version: 1 as const,
      shift: settings.shift,
      hold: settings.hold,
      holdMs: settings.holdMs,
      smoothLines: true,
    }),
    [settings.shift, settings.hold, settings.holdMs],
  );
  const current = document?.session;
  const stateLabel = current
    ? {
        saved: "已保存",
        pending: "未保存",
        saving: "保存中…",
        error: "保存失败",
      }[current.state]
    : "";

  return (
    <div className={`desktop-shell ${settings.theme}`}>
      <header className="desktop-header">
        {document ? (
          <button
            className="home-button"
            aria-label="返回画板首页"
            title="返回画板首页"
            disabled={busy || panel !== null}
            onClick={() => void operate(goHome)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
          </button>
        ) : (
          <strong>Excalidraw</strong>
        )}
        <span className="current-name">
          {current ? label(current.name) : ""}
        </span>
        {current && (
          <span className={`save-status ${current.state}`} role="status">
            {stateLabel}
          </span>
        )}
        {document && (
          <button
            disabled={busy || !document}
            onClick={() => void operate(flush)}
          >
            保存
          </button>
        )}
        <button
          disabled={busy || !context}
          onClick={() => setPanel("settings")}
        >
          设置
        </button>
      </header>
      {(error || current?.error) && (
        <div className="notice error" role="alert">
          {error || current?.error}
          <button onClick={() => setError("")} aria-label="关闭错误提示">
            ×
          </button>
        </div>
      )}
      {current?.conflict && (
        <div className="notice" role="status">
          文件有外部修改，已另存为「{label(current.name)}」。
        </div>
      )}
      <div className="desktop-body">
        {!document && (
          <div className="home-container" inert={busy || panel !== null}>
            <BoardHome
              files={files}
              directory={context?.directory}
              busy={busy}
              ready={!!context}
              onChooseDirectory={() => void operate(chooseDirectory)}
              onNew={() => {
                setName("");
                setPanel("new");
              }}
              onRefresh={() => void operate(refresh)}
              onImport={() =>
                void operate(async () => {
                  const content = await invoke<string | null>("import_board");
                  if (content) {
                    await create(content, `导入-${Date.now()}`);
                  }
                })
              }
              onTrash={() =>
                void operate(async () => {
                  await refreshTrash();
                  setPanel("trash");
                })
              }
              onOpen={(file) =>
                void operate(async () => {
                  await open(await repository.read(file.name));
                })
              }
              onRename={(file) => {
                setTarget(file);
                setName(label(file.name));
                setPanel("rename");
              }}
              onDelete={(file) => {
                setTarget(file);
                setPanel("delete");
              }}
            />
          </div>
        )}
        {document && (
          <main className="editor-area" inert={busy || panel !== null}>
            <Excalidraw
              key={document.key}
              initialData={document.initialData}
              theme={settings.theme}
              langCode="zh-CN"
              straightInk={gesture}
              UIOptions={{
                canvasActions: {
                  loadScene: false,
                  saveToActiveFile: false,
                  toggleTheme: false,
                },
              }}
              onExcalidrawAPI={(value) => {
                api.current = value;
              }}
              onInitialize={(value) => {
                if (active.current !== document) {
                  return;
                }
                document.session.initialize(
                  serializeAsJSON(
                    value.getSceneElementsIncludingDeleted(),
                    value.getAppState(),
                    value.getFiles(),
                    "local",
                  ),
                );
              }}
              onChange={(elements, appState, binaryFiles) => {
                if (active.current !== document) {
                  return;
                }
                document.session.update(
                  serializeAsJSON(elements, appState, binaryFiles, "local"),
                );
                if (settingsWritable.current && !appState.isLoading) {
                  changeSettings({
                    ...settingsRef.current,
                    drawing: drawingPreferences(appState),
                  });
                }
              }}
            />
          </main>
        )}
      </div>
      {busy && (
        <div className="busy-indicator" role="status">
          处理中…
        </div>
      )}
      {panel && (
        <div className="modal-backdrop">
          <section
            className="desktop-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={
              {
                settings: "个人设置",
                recovery: "恢复画布",
                trash: "回收站",
                new: "新建画布",
                rename: "重命名画布",
                delete: "删除画布",
              }[panel]
            }
          >
            <div className="dialog-title">
              <h2>
                {
                  {
                    settings: "个人设置",
                    recovery: "恢复画布",
                    trash: "回收站",
                    new: "新建画布",
                    rename: "重命名画布",
                    delete: "删除画布",
                  }[panel]
                }
              </h2>
              <button disabled={busy} onClick={() => setPanel(null)}>
                关闭
              </button>
            </div>
            {(panel === "new" || panel === "rename") && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void operate(async () => {
                    if (panel === "new") {
                      await create();
                    } else if (target) {
                      await flush();
                      const board = await repository.read(target.name);
                      const newName = filename(name);
                      await repository.rename(
                        board.name,
                        newName,
                        board.revision,
                      );
                      await refresh();
                      setPanel(null);
                      setTarget(null);
                    }
                  });
                }}
              >
                <label>
                  画布名称
                  <input
                    autoFocus
                    value={name}
                    disabled={busy}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <button type="submit" disabled={busy || !name.trim()}>
                  确认
                </button>
              </form>
            )}
            {panel === "delete" && (
              <>
                <p>将「{label(target?.name || "")}」移到回收站？</p>
                <button
                  disabled={busy}
                  onClick={() =>
                    void operate(async () => {
                      await flush();
                      if (!target) {
                        return;
                      }
                      const board = await repository.read(target.name);
                      await repository.trash(board.name, board.revision);
                      setPanel(null);
                      setTarget(null);
                      await refresh();
                      await refreshTrash();
                    })
                  }
                >
                  移到回收站
                </button>
              </>
            )}
            {panel === "settings" && (
              <>
                {settingsInvalid && (
                  <div className="notice">
                    设置损坏，已暂停写入。
                    <button
                      onClick={() => {
                        settingsWritable.current = true;
                        settingsRef.current = defaults;
                        setSettings(defaults);
                        setSettingsInvalid(false);
                        void operate(flushSettings);
                      }}
                    >
                      使用默认设置
                    </button>
                  </div>
                )}
                <label>
                  主题
                  <select
                    value={settings.theme}
                    disabled={settingsInvalid}
                    onChange={(event) =>
                      changeSettings({
                        ...settingsRef.current,
                        theme: event.target.value as Settings["theme"],
                      })
                    }
                  >
                    <option value="light">浅色</option>
                    <option value="dark">深色</option>
                  </select>
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={settings.shift}
                    disabled={settingsInvalid}
                    onChange={(event) =>
                      changeSettings({
                        ...settingsRef.current,
                        shift: event.target.checked,
                      })
                    }
                  />
                  按住 Shift 起笔，直接画直线
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={settings.hold}
                    disabled={settingsInvalid}
                    onChange={(event) =>
                      changeSettings({
                        ...settingsRef.current,
                        hold: event.target.checked,
                      })
                    }
                  />
                  近似直线停顿后自动拉直
                </label>
                <label>
                  停顿时间：{settings.holdMs} 毫秒
                  <input
                    type="range"
                    min="200"
                    max="2000"
                    step="50"
                    value={settings.holdMs}
                    disabled={settingsInvalid}
                    onChange={(event) =>
                      changeSettings({
                        ...settingsRef.current,
                        holdMs: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <div className="button-row">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void operate(async () => {
                        const content = await invoke<string | null>(
                          "import_settings",
                        );
                        if (!content) {
                          return;
                        }
                        const next = parseSettings(JSON.parse(content));
                        settingsWritable.current = true;
                        setSettingsInvalid(false);
                        changeSettings(next);
                        if (api.current) {
                          api.current.updateScene({
                            appState: {
                              ...api.current.getAppState(),
                              ...next.drawing,
                              theme: next.theme,
                            },
                          });
                        }
                        await flushSettings();
                      })
                    }
                  >
                    导入设置
                  </button>
                  <button
                    disabled={busy || settingsInvalid}
                    onClick={() =>
                      void operate(async () => {
                        await flushSettings();
                        await invoke("export_settings", {
                          content: JSON.stringify(settingsRef.current, null, 2),
                        });
                      })
                    }
                  >
                    导出设置
                  </button>
                </div>
                <button
                  disabled={busy}
                  onClick={() =>
                    void operate(async () => {
                      setRecoveries(await invoke<Recovery[]>("list_recovery"));
                      setPanel("recovery");
                    })
                  }
                >
                  历史备份
                </button>
              </>
            )}
            {panel === "recovery" && (
              <>
                <p>恢复为新画板。</p>
                {!context?.directory && <p>请先选择画布文件夹。</p>}
                <div className="recovery-list">
                  {recoveries.length ? (
                    recoveries.map((entry) => (
                      <button
                        key={entry.id}
                        disabled={busy || !context?.directory}
                        onClick={() =>
                          void operate(async () => {
                            const content = await invoke<string>(
                              "read_recovery",
                              { id: entry.id },
                            );
                            await create(
                              content,
                              `恢复-${label(entry.name).slice(
                                0,
                                24,
                              )}-${Date.now()}`,
                            );
                          })
                        }
                      >
                        <strong>{label(entry.name)}</strong>
                        <span>{new Date(entry.modified).toLocaleString()}</span>
                      </button>
                    ))
                  ) : (
                    <p>暂无恢复记录。</p>
                  )}
                </div>
              </>
            )}
            {panel === "trash" && (
              <>
                <p>
                  最多 10 个，删除 10 天后自动清理；超出上限清理最早删除的画板。
                </p>
                <div className="recovery-list">
                  {trash.length ? (
                    trash.map((entry) => (
                      <div className="trash-entry" key={entry.id}>
                        <div>
                          <strong>{label(entry.name)}</strong>
                          <span>
                            {new Date(entry.deletedAt).toLocaleDateString()}{" "}
                            删除
                          </span>
                        </div>
                        <button
                          disabled={busy || !context?.directory}
                          onClick={() =>
                            void operate(async () => {
                              const board = await invoke<LoadedBoard>(
                                "restore_trash",
                                { id: entry.id },
                              );
                              await refresh();
                              await refreshTrash();
                              await open(board);
                            })
                          }
                        >
                          恢复
                        </button>
                      </div>
                    ))
                  ) : (
                    <p>回收站为空</p>
                  )}
                </div>
              </>
            )}
            {error && (
              <p className="dialog-error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
