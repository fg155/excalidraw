# Wry input routing patch

`wry-0.55.1` is the crates.io source archive already pinned by this application's
lockfile. Archive SHA-256:
`186f9871daa55fd9c016578b810d149de58367113db7fb72b462d2323ce19514`.
Its upstream MIT and Apache-2.0 licenses are retained.

Local changes are limited to a `host-input-processing` Cargo feature and the
Windows controller creation code in `src/webview2/mod.rs`. The application enables
the feature only in its Windows desktop dependency. Other platform implementations
are unchanged. No second WebView engine is included.

Windowed WebView2 normally delivers pen messages to the browser process, bypassing
the host's `WH_GETMESSAGE` hook. `ICoreWebView2ControllerOptions4` enables Microsoft's
`AllowHostInputProcessing` before controller creation. Unhandled input continues
through WebView2; the application observes tool flags without consuming messages
or forwarding drawing samples itself. Unsupported runtimes retain contact-based
DOM switching. Setting `EXCALIDRAW_DISABLE_HOST_INPUT_PROCESSING=1` before launch
also restores that path for diagnosing runtime-specific input regressions.

References:
- https://github.com/MicrosoftEdge/WebView2Feedback/blob/main/specs/AllowHostInputProcessing.md
- https://github.com/tauri-apps/wry/issues/1836

Before replacing this patch with an upstream API, verify hover switching in both
directions, pressure drawing, pointer release outside the window, dragging text,
image drops, and ordinary mouse selection. WebView2 has reported input capture and
drag/drop regressions with this option (WebView2Feedback #5375, #5613, #5701); a
successful compilation alone does not verify these physical input paths.
