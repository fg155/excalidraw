use std::{cell::RefCell, mem::MaybeUninit, panic::catch_unwind, ptr::null_mut};
use windows_sys::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    System::Threading::GetCurrentThreadId,
    UI::{
        Input::Pointer::{GetPointerPenInfo, POINTER_FLAG_CANCELED, POINTER_FLAG_INRANGE, POINTER_PEN_INFO},
        WindowsAndMessaging::{
            CallNextHookEx, GetForegroundWindow, GetMessageExtraInfo, GetWindowThreadProcessId, IsChild,
            SetWindowsHookExW, UnhookWindowsHookEx, HHOOK, MSG, PEN_FLAG_ERASER,
            PEN_FLAG_INVERTED, PM_REMOVE, PT_PEN, WH_GETMESSAGE, WM_POINTERCAPTURECHANGED,
            WM_POINTERDOWN, WM_POINTERENTER, WM_POINTERLEAVE, WM_POINTERUPDATE, WM_POINTERUP,
            WM_MOUSEMOVE, WM_LBUTTONDOWN, WM_RBUTTONDOWN, WM_MBUTTONDOWN,
        },
    },
};

struct Observer {
    window: HWND,
    hook: HHOOK,
    notify: Option<fn(i32, i32)>,
    pointer: Option<u32>,
    last: (i32, i32),
}

impl Default for Observer {
    fn default() -> Self {
        Self { window: null_mut(), hook: null_mut(), notify: None, pointer: None, last: (-1, -1) }
    }
}

// The hook and Tauri window lifecycle both run on the window's UI thread.
// No global hook, driver polling, injected messages or stroke-sample queue.
thread_local! {
    static OBSERVER: RefCell<Observer> = RefCell::new(Observer::default());
}

fn report(mode: i32, source: i32) {
    let notify = OBSERVER.with(|slot| {
        let mut observer = slot.borrow_mut();
        if observer.last == (mode, source) { return None; }
        observer.last = (mode, source);
        observer.notify
    });
    // Do not hold a RefCell borrow while notifying WebView (possible re-entry).
    if let Some(notify) = notify { notify(mode, source); }
}

pub fn reset() {
    OBSERVER.with(|slot| slot.borrow_mut().pointer = None);
    report(0, 5);
}

pub fn uninstall() {
    reset();
    let hook = OBSERVER.with(|slot| std::mem::take(&mut *slot.borrow_mut()).hook);
    if !hook.is_null() { unsafe { UnhookWindowsHookEx(hook); } }
}

pub fn install(window: HWND, notify: fn(i32, i32)) -> bool {
    uninstall();
    // A zero thread ID would install a global hook. Explicitly refuse it and
    // any window outside the calling UI thread.
    let thread = unsafe { GetWindowThreadProcessId(window, null_mut()) };
    if window.is_null() || thread == 0 || thread != unsafe { GetCurrentThreadId() } {
        return false;
    }
    OBSERVER.with(|slot| {
        let mut observer = slot.borrow_mut();
        observer.window = window;
        observer.notify = Some(notify);
    });
    let hook = unsafe { SetWindowsHookExW(WH_GETMESSAGE, Some(message_received), null_mut(), thread) };
    OBSERVER.with(|slot| slot.borrow_mut().hook = hook);
    report(0, if hook.is_null() { 0 } else { 1 });
    !hook.is_null()
}

fn pen_mode(info: &POINTER_PEN_INFO) -> Option<i32> {
    if info.pointerInfo.pointerType != PT_PEN { return None; }
    if info.pointerInfo.pointerFlags & POINTER_FLAG_INRANGE == 0
        || info.pointerInfo.pointerFlags & POINTER_FLAG_CANCELED != 0 {
        return Some(0);
    }
    Some(if info.penFlags & (PEN_FLAG_INVERTED | PEN_FLAG_ERASER) != 0 { 2 } else { 1 })
}

fn is_promoted_tablet_mouse(extra: usize) -> bool {
    // https://learn.microsoft.com/windows/win32/tablet/system-events-and-mouse-messages
    extra & 0xffffff00 == 0xff515700
}

fn inspect_message(message: &MSG) {
    let mouse = matches!(message.message, WM_MOUSEMOVE | WM_LBUTTONDOWN | WM_RBUTTONDOWN | WM_MBUTTONDOWN);
    if !mouse && !matches!(message.message, WM_POINTERENTER | WM_POINTERUPDATE | WM_POINTERDOWN |
        WM_POINTERUP | WM_POINTERLEAVE | WM_POINTERCAPTURECHANGED) { return; }
    let window = OBSERVER.with(|slot| slot.borrow().window);
    if window.is_null() || unsafe { GetForegroundWindow() } != window { return; }
    // Include WebView child windows, but leave dialogs and unrelated windows alone.
    if message.hwnd != window && unsafe { IsChild(window, message.hwnd) } == 0 { return; }
    if mouse {
        // A real mouse clears the pen hint. Promoted pen/touch mouse messages
        // must not undo the tool state immediately after every pointer message.
        if !is_promoted_tablet_mouse(unsafe { GetMessageExtraInfo() } as usize) {
            OBSERVER.with(|slot| slot.borrow_mut().pointer = None);
            report(0, 4);
        }
        return;
    }
    let pointer = (message.wParam & 0xffff) as u32;
    if matches!(message.message, WM_POINTERLEAVE | WM_POINTERCAPTURECHANGED) {
        if OBSERVER.with(|slot| slot.borrow().pointer == Some(pointer)) { reset(); }
        return;
    }
    // Query on this same UI thread while processing the current pointer message;
    // the OS can invalidate this data when the next message is retrieved.
    // https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-getpointerpeninfo
    let mut info = MaybeUninit::<POINTER_PEN_INFO>::uninit();
    if unsafe { GetPointerPenInfo(pointer, info.as_mut_ptr()) } == 0 { return; }
    let info = unsafe { info.assume_init() };
    if let Some(mode) = pen_mode(&info) {
        OBSERVER.with(|slot| slot.borrow_mut().pointer = if mode == 0 { None } else { Some(pointer) });
        report(mode, if mode == 0 { 5 } else { 3 });
    }
}

unsafe extern "system" fn message_received(code: i32, removed: WPARAM, data: LPARAM) -> LRESULT {
    if code >= 0 && removed == PM_REMOVE as usize && data != 0 {
        // Never let a Rust panic unwind into Win32. The message is read-only and
        // always passed on, including when the optional observer fails.
        let _ = catch_unwind(|| inspect_message(&*(data as *const MSG)));
    }
    CallNextHookEx(null_mut(), code, removed, data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DestroyWindow, PeekMessageW, PostMessageW, HWND_MESSAGE,
        PEN_FLAG_BARREL, PT_TOUCH, WM_APP,
    };
    use windows_sys::w;

    #[test]
    fn promoted_pen_and_touch_mouse_messages_do_not_clear_tool_state() {
        for cursor in [0, 1, 42, 127, 128, 255] {
            assert!(is_promoted_tablet_mouse(0xff515700 | cursor));
        }
        assert!(!is_promoted_tablet_mouse(0));
        assert!(!is_promoted_tablet_mouse(0x12345678));
    }

    #[test]
    fn hover_flags_switch_in_both_directions_without_pressure_or_contact() {
        let mut info: POINTER_PEN_INFO = unsafe { std::mem::zeroed() };
        info.pointerInfo.pointerType = PT_PEN;
        info.pointerInfo.pointerFlags = POINTER_FLAG_INRANGE;
        assert_eq!(info.pressure, 0);
        for flags in [PEN_FLAG_INVERTED, PEN_FLAG_ERASER, PEN_FLAG_INVERTED | PEN_FLAG_ERASER] {
            info.penFlags = flags;
            assert_eq!(pen_mode(&info), Some(2));
            info.penFlags = 0;
            assert_eq!(pen_mode(&info), Some(1));
        }
        info.penFlags = PEN_FLAG_BARREL;
        assert_eq!(pen_mode(&info), Some(1));
        info.pointerInfo.pointerFlags |= POINTER_FLAG_CANCELED;
        assert_eq!(pen_mode(&info), Some(0));
        info.pointerInfo.pointerFlags = 0;
        assert_eq!(pen_mode(&info), Some(0));
        info.pointerInfo.pointerType = PT_TOUCH;
        assert_eq!(pen_mode(&info), None);
    }

    #[test]
    fn observer_is_thread_local_and_deduplicates_hover_samples() {
        thread_local! { static COUNT: std::cell::Cell<usize> = const { std::cell::Cell::new(0) }; }
        OBSERVER.with(|slot| slot.borrow_mut().notify = Some(|_, _| COUNT.with(|n| n.set(n.get() + 1))));
        for _ in 0..10000 { report(2, 3); }
        assert_eq!(COUNT.with(|n| n.get()), 1);
        report(1, 3);
        reset();
        assert_eq!(COUNT.with(|n| n.get()), 3);
        assert_eq!(OBSERVER.with(|slot| slot.borrow().last), (0, 5));
        uninstall();
    }

    #[test]
    fn local_hook_preserves_messages_and_can_be_removed() {
        assert!(!install(null_mut(), |_, _| {}));
        unsafe {
            let window = CreateWindowExW(0, w!("STATIC"), w!("tablet-test"), 0,
                0, 0, 0, 0, HWND_MESSAGE, null_mut(), null_mut(), null_mut());
            assert!(!window.is_null());
            assert!(install(window, |_, _| {}));
            assert_ne!(PostMessageW(window, WM_APP, 17, 29), 0);
            let mut message: MSG = std::mem::zeroed();
            assert_ne!(PeekMessageW(&mut message, window, WM_APP, WM_APP, PM_REMOVE), 0);
            assert_eq!((message.message, message.wParam, message.lParam), (WM_APP, 17, 29));
            uninstall();
            assert!(OBSERVER.with(|slot| slot.borrow().hook.is_null()));
            assert_ne!(DestroyWindow(window), 0);
        }
    }
}
