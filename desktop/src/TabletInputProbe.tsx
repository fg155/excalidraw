import { useEffect, useRef, useState } from "react";

import type { NativeTabletState } from "./nativeTablet";

import type { KeyboardEvent, PointerEvent } from "react";

// Opt-in, local-only diagnostics: no drawing contents, coordinates, device
// identifiers, general keystrokes, background listeners or persisted reports.
export function TabletInputProbe({
  nativeTablet,
}: {
  nativeTablet?: NativeTabletState;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="tablet-probe">
      <button aria-expanded={open} onClick={() => setOpen(!open)}>
        数位板输入检测
      </button>
      {open && <Probe nativeTablet={nativeTablet} />}
    </div>
  );
}

function Probe({ nativeTablet }: { nativeTablet?: NativeTabletState }) {
  const [recording, setRecording] = useState(true);
  const [lines, setLines] = useState<string[]>([]);
  const [runtime, setRuntime] = useState("");
  const previous = useRef("");
  useEffect(() => {
    if (recording && nativeTablet) {
      setLines((items) => [
        ...items.slice(-95),
        JSON.stringify({ event: "native-tool", ...nativeTablet }),
      ]);
    }
  }, [nativeTablet, recording]);
  const add = (line: string) => {
    if (!recording) {
      return;
    }
    setLines((items) => [...items.slice(-95), line]);
  };
  const recordPointer = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!recording) {
      return;
    }
    if (event.type === "pointerdown") {
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    const signature = `${event.type}/${event.pointerType}/${event.button}/${
      event.buttons
    }/${event.pressure > 0}`;
    if (signature === previous.current && event.type === "pointermove") {
      return;
    }
    previous.current = signature;
    setRuntime(
      event.currentTarget.ownerDocument.defaultView!.navigator.userAgent,
    );
    add(
      JSON.stringify({
        event: event.type,
        pointer: event.pointerType,
        button: event.button,
        buttons: event.buttons,
        pressure: Number(event.pressure.toFixed(3)),
        eraser: event.pointerType === "pen" && (event.buttons & 32) !== 0,
      }),
    );
  };
  const recordKey = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    // Only report the two tool shortcuts; never record arbitrary typed text.
    if (event.code === "KeyE" || event.code === "KeyB") {
      event.preventDefault();
      add(
        JSON.stringify({
          event: event.type,
          code: event.code,
          repeat: event.repeat,
        }),
      );
    }
  };
  return (
    <div className="tablet-probe-content">
      <p>
        在下面区域悬空按侧键，再落笔划动；切回笔后重复一次。记录仅留在本页。
      </p>
      <div
        className="tablet-probe-pad"
        role="group"
        aria-label="数位板检测区域"
        tabIndex={0}
        onPointerDown={recordPointer}
        onPointerMove={recordPointer}
        onPointerUp={recordPointer}
        onPointerCancel={recordPointer}
        onKeyDown={recordKey}
        onKeyUp={recordKey}
        onContextMenu={(event) => event.preventDefault()}
      >
        检测区域
      </div>
      <div className="button-row">
        <button
          onClick={() => {
            previous.current = "";
            setRecording(!recording);
          }}
        >
          {recording ? "停止检测" : "继续检测"}
        </button>
        <button
          onClick={() => {
            previous.current = "";
            setLines(
              nativeTablet
                ? [JSON.stringify({ event: "native-tool", ...nativeTablet })]
                : [],
            );
          }}
        >
          清空记录
        </button>
      </div>
      <label>
        检测记录（可复制）
        <textarea
          rows={6}
          readOnly
          value={[runtime, ...lines].filter(Boolean).join("\n")}
        />
      </label>
    </div>
  );
}
