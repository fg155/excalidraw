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
static bool inputUnavailable;

static void report(int mode, int source) {
    if (lastMode == mode && lastSource == source) return;
    lastMode = mode;
    lastSource = source;
    if (notifyTool) notifyTool(mode, source);
}

static void reset(void) {
    [tools removeAllObjects];
    report(0, inputUnavailable ? 0 : 5);
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

// NSEvent.subtype is not valid on standalone tablet events. Classify the
// native type first, and read subtype only for the supported mouse types.
// https://developer.apple.com/documentation/appkit/nsevent/subtype
static void inspectEvent(NSEvent *event) {
    if (inputUnavailable) return;
    int mode = 0;
    int source = 0;
    @try {
        NSWindow *window = event.window;
        if (window && window != targetWindow) return;
        NSEventType type = event.type;
        BOOL proximity = type == NSEventTypeTabletProximity;
        BOOL point = type == NSEventTypeTabletPoint;
        if (!proximity && !point) {
            switch (type) {
                case NSEventTypeMouseMoved:
                case NSEventTypeLeftMouseDown:
                case NSEventTypeLeftMouseUp:
                case NSEventTypeLeftMouseDragged:
                case NSEventTypeRightMouseDown:
                case NSEventTypeRightMouseUp:
                case NSEventTypeRightMouseDragged:
                case NSEventTypeOtherMouseDown:
                case NSEventTypeOtherMouseUp:
                case NSEventTypeOtherMouseDragged: {
                    NSEventSubtype subtype = event.subtype;
                    proximity = subtype == NSEventSubtypeTabletProximity;
                    point = subtype == NSEventSubtypeTabletPoint;
                    break;
                }
                default: return;
            }
        }
        if (proximity) {
            NSNumber *key = @(event.deviceID);
            if (event.isEnteringProximity) {
                NSPointingDeviceType device = event.pointingDeviceType;
                mode = device == NSPointingDeviceTypeEraser ? 2 :
                    device == NSPointingDeviceTypePen ? 1 : 0;
                tools[key] = @(mode);
            } else {
                [tools removeObjectForKey:key];
            }
            source = 2;
        } else if (point) {
            // Device type is only valid on proximity events. Missing proximity
            // leaves the tool unknown until re-entry, never guesses eraser.
            mode = [tools[@(event.deviceID)] intValue];
            source = 3;
        } else {
            source = 4;
        }
    } @catch (NSException *exception) {
        // Rust catch_unwind cannot catch Objective-C exceptions. Disable only
        // this optional bridge until restart; WKWebView still receives events.
        inputUnavailable = true;
        [tools removeAllObjects];
        mode = source = 0;
    }
    // Keep the Rust callback outside the Objective-C exception boundary.
    report(mode, source);
}

bool tablet_input_install(void *window, void (*callback)(int, int)) {
    NSCAssert(NSThread.isMainThread, @"Tablet observer must run on main thread");
    if (monitor) stop();
    targetWindow = (__bridge NSWindow *)window;
    notifyTool = callback;
    tools = [NSMutableDictionary dictionary];
    lastMode = lastSource = -1;
    inputUnavailable = false;
    NSEventMask mask = NSEventMaskTabletProximity | NSEventMaskTabletPoint |
        NSEventMaskMouseMoved | NSEventMaskLeftMouseDown | NSEventMaskLeftMouseUp |
        NSEventMaskLeftMouseDragged | NSEventMaskRightMouseDown | NSEventMaskRightMouseUp |
        NSEventMaskRightMouseDragged | NSEventMaskOtherMouseDown | NSEventMaskOtherMouseUp |
        NSEventMaskOtherMouseDragged;
    monitor = [NSEvent addLocalMonitorForEventsMatchingMask:mask handler:^NSEvent *(NSEvent *event) {
        if (!targetWindow || !NSApp.isActive || NSApp.keyWindow != targetWindow) return event;
        // Standalone proximity events may have no window. Never inspect another
        // app's events or reinterpret events belonging to a dialog/other window.
        inspectEvent(event);
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
