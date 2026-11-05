import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type NativeTabletState = {
  mode: "unknown" | "pen" | "eraser";
  source:
    | "unavailable"
    | "ready"
    | "proximity"
    | "tablet"
    | "mouse"
    | "inactive";
  revision: number;
};

export const unavailableTablet: NativeTabletState = {
  mode: "unknown",
  source: "unavailable",
  revision: 0,
};

// Subscribe before querying so a late snapshot cannot overwrite a new event.
// Keep a single state, never a queue of motion samples.
export function subscribeNativeTablet(
  onChange: (state: NativeTabletState) => void,
) {
  let disposed = false;
  let revision = -1;
  let unlisten: (() => void) | undefined;
  const accept = (value: NativeTabletState) => {
    if (
      disposed ||
      !value ||
      !["unknown", "pen", "eraser"].includes(value.mode) ||
      ![
        "unavailable",
        "ready",
        "proximity",
        "tablet",
        "mouse",
        "inactive",
      ].includes(value.source) ||
      !Number.isSafeInteger(value.revision) ||
      value.revision <= revision
    ) {
      return;
    }
    revision = value.revision;
    onChange(value);
  };
  void listen<NativeTabletState>("native-tablet-state", ({ payload }) =>
    accept(payload),
  )
    .then(async (cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }
      unlisten = cleanup;
      accept(await invoke<NativeTabletState>("get_tablet_state"));
    })
    .catch(() => {
      /* Older hosts keep the existing DOM input path. */
    });
  return () => {
    disposed = true;
    unlisten?.();
  };
}

export function useNativeTablet() {
  const [state, setState] = useState(unavailableTablet);
  useEffect(() => {
    if (isTauri()) {
      return subscribeNativeTablet(setState);
    }
  }, []);
  return state;
}
