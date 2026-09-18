import { BoardThumbnail } from "./BoardThumbnail";

import type { BoardFile } from "./repository";

export const boardLabel = (name: string) => name.replace(/\.excalidraw$/, "");

export function BoardHome({
  files,
  directory,
  busy,
  ready,
  onChooseDirectory,
  onNew,
  onImport,
  onRefresh,
  onTrash,
  onOpen,
  onRename,
  onDelete,
}: {
  files: BoardFile[];
  directory?: string | null;
  busy: boolean;
  ready: boolean;
  onChooseDirectory(): void;
  onNew(): void;
  onImport(): void;
  onRefresh(): void;
  onTrash(): void;
  onOpen(file: BoardFile): void;
  onRename(file: BoardFile): void;
  onDelete(file: BoardFile): void;
}) {
  return (
    <main className="board-home" aria-label="画板首页">
      <div className="home-heading">
        <div>
          <h1>画板</h1>
          {directory && (
            <div className="directory" title={directory}>
              {directory}
            </div>
          )}
        </div>
        <div className="home-actions">
          <button disabled={busy || !ready} onClick={onChooseDirectory}>
            选择文件夹
          </button>
          <button disabled={busy || !directory} onClick={onImport}>
            导入
          </button>
          <button disabled={busy || !directory} onClick={onRefresh}>
            刷新
          </button>
          <button disabled={busy || !ready} onClick={onTrash}>
            回收站
          </button>
          <button
            className="primary-button"
            disabled={busy || !directory}
            onClick={onNew}
          >
            新建画板
          </button>
        </div>
      </div>
      <div className="board-grid">
        {files.map((file) => (
          <article className="board-card" key={`${directory}/${file.name}`}>
            <button
              className="board-open"
              disabled={busy}
              aria-label={boardLabel(file.name)}
              onClick={() => onOpen(file)}
            >
              <BoardThumbnail file={file} />
              <span className="board-name" title={boardLabel(file.name)}>
                {boardLabel(file.name)}
              </span>
              <time dateTime={new Date(file.modified).toISOString()}>
                {new Date(file.modified).toLocaleDateString()}
              </time>
            </button>
            <div className="board-actions">
              <button
                disabled={busy}
                aria-label={`重命名 ${boardLabel(file.name)}`}
                onClick={() => onRename(file)}
              >
                重命名
              </button>
              <button
                disabled={busy}
                aria-label={`删除 ${boardLabel(file.name)}`}
                onClick={() => onDelete(file)}
              >
                删除
              </button>
            </div>
          </article>
        ))}
      </div>
      {!files.length && (
        <div className="home-empty">
          {directory ? "暂无画板" : "选择画板文件夹"}
        </div>
      )}
    </main>
  );
}
