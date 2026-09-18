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
  initialize(content: string) {
    if (this.content === null) {
      this.content = this.persisted = content;
    }
  }

  update(content: string) {
    if (this.disposed || this.content === null || content === this.content) {
      return;
    }
    this.content = content;
    this.state = this.flight
      ? "saving"
      : content === this.persisted
      ? "saved"
      : "pending";
    this.changed();
    this.clock.clearTimeout(this.timer);
    this.timer = this.clock.setTimeout(() => {
      void this.flush().catch(() => {
        // flush records the failure; keep the dirty snapshot for retry.
      });
    }, 600);
  }

  flush(): Promise<void> {
    this.clock.clearTimeout(this.timer);
    if (this.flight) {
      return this.flight;
    }
    this.flight = this.drain().finally(() => {
      this.flight = null;
    });
    return this.flight;
  }

  private async drain() {
    while (this.content !== null && this.content !== this.persisted) {
      const snapshot = this.content;
      this.state = "saving";
      this.error = "";
      this.changed();
      try {
        // Independent recovery works even if the OneDrive directory disappears.
        await this.backup(this.name, snapshot);
        const result: SavedBoard = await this.repository.save(
          this.name,
          snapshot,
          this.revision,
        );
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
    this.state = "saved";
    this.error = "";
    this.changed();
  }

  /** Call only after a successful flush, or after explicitly deleting the board. */
  dispose() {
    this.disposed = true;
    this.clock.clearTimeout(this.timer);
  }
}
