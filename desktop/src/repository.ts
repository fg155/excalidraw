import { invoke } from "@tauri-apps/api/core";

export type BoardFile = { name: string; modified: number };
export type LoadedBoard = { name: string; content: string; revision: string };
export type SavedBoard = { name: string; revision: string; conflict: boolean };

/** Remote repositories can implement this interface without changing the editor. */
export interface BoardRepository {
  list(): Promise<BoardFile[]>;
  read(name: string): Promise<LoadedBoard>;
  save(
    name: string,
    content: string,
    revision: string | null,
  ): Promise<SavedBoard>;
  rename(name: string, newName: string, revision: string): Promise<void>;
  trash(name: string, revision: string): Promise<void>;
}

export const repository: BoardRepository = {
  list: () => invoke("list_boards"),
  read: (name) => invoke("read_board", { name }),
  save: (name, content, revision) =>
    invoke("save_board", { name, content, revision }),
  rename: (name, newName, revision) =>
    invoke("rename_board", { name, newName, revision }),
  trash: (name, revision) => invoke("trash_board", { name, revision }),
};
