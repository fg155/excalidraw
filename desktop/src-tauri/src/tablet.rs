use serde::Serialize;
use std::sync::Mutex;

#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(all(feature = "desktop", target_os = "windows"))]
pub mod windows_host {
    use super::TabletInput;
    use std::sync::OnceLock;
    use tauri::{Emitter, Manager};

    static APP: OnceLock<tauri::AppHandle> = OnceLock::new();

    fn changed(mode: i32, source: i32) {
        if let Some(app) = APP.get() {
            if let Some(state) = app.state::<TabletInput>().update(mode, source) {
                let _ = app.emit_to("main", "native-tablet-state", state);
            }
        }
    }

    pub fn install(app: &tauri::App) -> tauri::Result<()> {
        let window = app.get_webview_window("main").expect("main window");
        let _ = APP.set(app.handle().clone());
        super::windows::install(window.hwnd()?.0, changed);
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Unknown,
    Pen,
    Eraser,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    Unavailable,
    Ready,
    Proximity,
    Tablet,
    Mouse,
    Inactive,
}

#[derive(Clone, Copy, Debug, Serialize)]
pub struct Snapshot {
    pub mode: Mode,
    pub source: Source,
    pub revision: u64,
}

pub struct TabletInput(Mutex<Snapshot>);

impl Default for TabletInput {
    fn default() -> Self {
        Self(Mutex::new(Snapshot {
            mode: Mode::Unknown,
            source: Source::Unavailable,
            revision: 0,
        }))
    }
}

impl TabletInput {
    pub fn snapshot(&self) -> Snapshot {
        *self.0.lock().unwrap_or_else(|e| e.into_inner())
    }

    // No pressure, position, serial number or stroke samples cross IPC.
    pub fn update(&self, mode: i32, source: i32) -> Option<Snapshot> {
        let mode = match mode {
            1 => Mode::Pen,
            2 => Mode::Eraser,
            _ => Mode::Unknown,
        };
        let source = match source {
            1 => Source::Ready,
            2 => Source::Proximity,
            3 => Source::Tablet,
            4 => Source::Mouse,
            5 => Source::Inactive,
            _ => Source::Unavailable,
        };
        let mut state = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if state.mode == mode && state.source == source {
            return None;
        }
        *state = Snapshot {
            mode,
            source,
            revision: state.revision + 1,
        };
        Some(*state)
    }
}

#[cfg(all(feature = "desktop", target_os = "macos"))]
pub mod macos {
    use super::TabletInput;
    use std::{ffi::c_void, sync::OnceLock};
    use tauri::{Emitter, Manager};

    static APP: OnceLock<tauri::AppHandle> = OnceLock::new();
    extern "C" {
        fn tablet_input_install(window: *mut c_void, callback: extern "C" fn(i32, i32)) -> bool;
    }

    extern "C" fn changed(mode: i32, source: i32) {
        // Never unwind across the Objective-C/C ABI boundary.
        let _ = std::panic::catch_unwind(|| {
            if let Some(app) = APP.get() {
                if let Some(state) = app.state::<TabletInput>().update(mode, source) {
                    let _ = app.emit_to("main", "native-tablet-state", state);
                }
            }
        });
    }

    pub fn install(app: &tauri::App) -> tauri::Result<()> {
        let window = app.get_webview_window("main").expect("main window");
        let _ = APP.set(app.handle().clone());
        // setup runs on AppKit's main thread; native observers remove themselves
        // when this window closes. No global event tap or driver access.
        unsafe {
            tablet_input_install(window.ns_window()?, changed);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn coalesces_high_frequency_samples_and_keeps_order() {
        let input = TabletInput::default();
        assert_eq!(input.snapshot().source, Source::Unavailable);
        assert_eq!(input.update(2, 2).unwrap().mode, Mode::Eraser);
        input.update(2, 3);
        for _ in 0..10000 {
            assert!(input.update(2, 3).is_none());
        }
        let pen = input.update(1, 2).unwrap();
        assert_eq!(pen.mode, Mode::Pen);
        assert_eq!(pen.revision, 3);
    }
    #[test]
    fn ordinary_mouse_and_focus_loss_clear_stale_eraser() {
        let input = TabletInput::default();
        input.update(2, 2);
        assert_eq!(input.update(0, 4).unwrap().mode, Mode::Unknown);
        input.update(2, 2);
        assert_eq!(input.update(0, 5).unwrap().source, Source::Inactive);
        assert_eq!(input.snapshot().mode, Mode::Unknown);
    }
    #[test]
    fn malformed_native_values_never_enable_erasing() {
        let input = TabletInput::default();
        input.update(99, 99);
        assert_eq!(input.snapshot().mode, Mode::Unknown);
        assert_eq!(input.snapshot().revision, 0);
    }
}
