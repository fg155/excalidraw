#import <AppKit/AppKit.h>
#include <stdbool.h>

// Only inspect this app's events; leave every event unchanged for WKWebView.
static id monitor;
static id blurObserver;
static id closeObserver;
static __weak NSWindow *targetWindow;
static NSMutableDictionary<NSNumber *, NSNumber *> *tools;
static void (*notifyTool)(int, int);
static int lastMode = -1;
static int lastSource = -1;

static void report(int mode, int source) {
    if (lastMode == mode && lastSource == source) return;
    lastMode = mode;
    lastSource = source;
    if (notifyTool) notifyTool(mode, source);
}

static void reset(void) {
    [tools removeAllObjects];
    report(0, 5);
}

static void stop(void) {
    reset();
    if (monitor) [NSEvent removeMonitor:monitor];
    if (blurObserver) [NSNotificationCenter.defaultCenter removeObserver:blurObserver];
    if (closeObserver) [NSNotificationCenter.defaultCenter removeObserver:closeObserver];
    monitor = nil;
    blurObserver = nil;
    closeObserver = nil;
    tools = nil;
    targetWindow = nil;
    notifyTool = NULL;
}

bool tablet_input_install(void *window, void (*callback)(int, int)) {
    NSCAssert(NSThread.isMainThread, @"Tablet observer must run on main thread");
    if (monitor) stop();
    targetWindow = (__bridge NSWindow *)window;
    notifyTool = callback;
    tools = [NSMutableDictionary dictionary];
    lastMode = lastSource = -1;
    NSEventMask mask = NSEventMaskTabletProximity | NSEventMaskTabletPoint |
        NSEventMaskMouseMoved | NSEventMaskLeftMouseDown | NSEventMaskLeftMouseUp |
        NSEventMaskLeftMouseDragged | NSEventMaskRightMouseDown | NSEventMaskRightMouseUp |
        NSEventMaskRightMouseDragged | NSEventMaskOtherMouseDown | NSEventMaskOtherMouseUp |
        NSEventMaskOtherMouseDragged;
    monitor = [NSEvent addLocalMonitorForEventsMatchingMask:mask handler:^NSEvent *(NSEvent *event) {
        if (!targetWindow || !NSApp.isActive || NSApp.keyWindow != targetWindow) return event;
        // Standalone proximity events may have no window. Never inspect another
        // app's events or reinterpret events belonging to a dialog/other window.
        if (event.window && event.window != targetWindow) return event;
        BOOL proximity = event.type == NSEventTypeTabletProximity ||
            event.subtype == NSEventSubtypeTabletProximity;
        BOOL point = event.type == NSEventTypeTabletPoint ||
            event.subtype == NSEventSubtypeTabletPoint;
        if (proximity) {
            NSNumber *key = @(event.deviceID);
            if (event.isEnteringProximity) {
                int mode = event.pointingDeviceType == NSPointingDeviceTypeEraser ? 2 :
                    event.pointingDeviceType == NSPointingDeviceTypePen ? 1 : 0;
                tools[key] = @(mode);
                report(mode, 2);
            } else {
                [tools removeObjectForKey:key];
                report(0, 2);
            }
        } else if (point) {
            // pointingDeviceType is only valid on proximity events. If one was
            // missed (e.g. launch while hovering), stay unknown until re-entry.
            report([tools[@(event.deviceID)] intValue], 3);
        } else {
            report(0, 4);
        }
        return event;
    }];
    blurObserver = [NSNotificationCenter.defaultCenter
        addObserverForName:NSWindowDidResignKeyNotification object:targetWindow queue:nil
        usingBlock:^(NSNotification *note) { reset(); }];
    closeObserver = [NSNotificationCenter.defaultCenter
        addObserverForName:NSWindowWillCloseNotification object:targetWindow queue:nil
        usingBlock:^(NSNotification *note) { stop(); }];
    report(0, monitor ? 1 : 0);
    return monitor != nil;
}
