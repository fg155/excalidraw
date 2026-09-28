import type { BoardRepository, SavedBoard } from "./repository";

export type SaveState = "saved" | "pending" | "saving" | "error";
type Clock = Pick<Window, "setTimeout" | "clearTimeout">;

/** One session per open document. Only acknowledge the exact snapshot written. */
export class DocumentSession {
  revision: string;
  name: string;
  state: SaveState = "saved";
  error = "";
  conflict = false;
  private content: string | null = null;
  private persisted: string | null = null;
  private pendingSnapshot: (() => string) | null = null;
  private timer: number | undefined;
  private flight: Promise<void> | null = null;
  private disposed = false;

  constructor(
    board: { name: string; revision: string },
    private repository: BoardRepository,
    private clock: Clock,
    private changed: () => void,
    private backup: (name: string, content: string) => Promise<void>,
  ) {
    this.name = board.name;
    this.revision = board.revision;
  }

  // Initialization can normalize imported files. It must not save a blank scene.
  initialize(content: string, needsCompaction = false) {
    if (!this.disposed && this.content === null) {
      this.content = content;
      this.persisted = needsCompaction ? null : content;
      // Merely opening an old file does not write it. The next explicit flush
      // or actual edit saves the compact snapshot through the normal queue.
      if (needsCompaction) {
        this.state = "pending";
        this.changed();
      }
    }
  }

  update(content: string | (() => string)) {
    if (this.disposed || this.content === null) {
      return;
    }
    if (
      typeof content === "string" &&
      !this.pendingSnapshot &&
      content === this.content
    ) {
      return;
    }
    if (typeof content === "function") {
      this.pendingSnapshot = content;
    } else {
      this.pendingSnapshot = null;
      this.content = content;
    }
    const nextState = this.flight
      ? "saving"
      : !this.pendingSnapshot && this.content === this.persisted
      ? "saved"
      : "pending";
    if (this.state !== nextState) {
      this.state = nextState;
      this.changed();
    }
    this.clock.clearTimeout(this.timer);
    this.timer = this.clock.setTimeout(() => {
      void this.flush().catch(() => {
        // flush records the failure; keep the dirty snapshot for retry.
      });
    }, 600);
  }

  flush(): Promise<void> {
    this.clock.clearTimeout(this.timer);
    if (this.disposed) {
      return Promise.resolve();
    }
    if (this.flight) {
      return this.flight;
    }
    this.flight = this.drain().finally(() => {
      this.flight = null;
    });
    return this.flight;
  }

  private async drain() {
    while (
      !this.disposed &&
      this.content !== null &&
      (this.pendingSnapshot || this.content !== this.persisted)
    ) {
      this.state = "saving";
      this.error = "";
      this.changed();
      try {
        if (this.pendingSnapshot) {
          // Materialize once after the debounce (or an explicit flush), before
          // awaiting IO. Edits during IO install a new pending snapshot.
          const serialize = this.pendingSnapshot;
          this.content = serialize();
          this.pendingSnapshot = null;
        }
        if (this.content === this.persisted) {
          continue;
        }
        const snapshot = this.content;
        // Independent recovery works even if the OneDrive directory disappears.
        await this.backup(this.name, snapshot);
        const result: SavedBoard = await this.repository.save(
          this.name,
          snapshot,
          this.revision,
        );
        if (this.disposed) {
          return;
        }
        this.name = result.name;
        this.revision = result.revision;
        this.conflict ||= result.conflict;
        this.persisted = snapshot;
      } catch (error) {
        this.state = "error";
        this.error = String(error);
        this.changed();
        throw error;
      }
    }
    if (this.disposed) {
      return;
    }
    this.state = "saved";
    this.error = "";
    this.changed();
  }

  /** Call only after a successful flush, or after explicitly deleting the board. */
  dispose() {
    this.disposed = true;
    this.clock.clearTimeout(this.timer);
    this.pendingSnapshot = null;
    this.content = null;
    this.persisted = null;
  }
}
