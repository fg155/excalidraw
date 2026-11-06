// Execute the production parser against real, in-memory AppKit events. These
// events are never posted to the system and require no connected tablet.
#import <ApplicationServices/ApplicationServices.h>
#include <stdio.h>
#include <stdlib.h>
#import "../src/tablet_macos.m"

#define CHECK(condition) do { if (!(condition)) { \
    fprintf(stderr, "FAILED line %d: %s\n", __LINE__, #condition); exit(1); \
} } while (0)

static int receivedMode, receivedSource, notifications;
static void received(int mode, int source) {
    receivedMode = mode;
    receivedSource = source;
    notifications++;
}

static void freshState(void) {
    tools = [NSMutableDictionary dictionary];
    targetWindow = nil;
    inputUnavailable = false;
    lastMode = lastSource = -1;
    receivedMode = receivedSource = -1;
    notifications = 0;
    notifyTool = received;
}

static NSEvent *tabletEvent(CGEventType type, NSEventSubtype subtype,
                            NSPointingDeviceType device, BOOL entering) {
    CGEventRef cg = CGEventCreate(NULL);
    CHECK(cg != NULL);
    CGEventSetType(cg, type);
    CGEventSetIntegerValueField(cg, kCGMouseEventSubtype, subtype);
    CGEventSetIntegerValueField(cg, kCGTabletProximityEventDeviceID, 7);
    CGEventSetIntegerValueField(cg, kCGTabletEventDeviceID, 7);
    CGEventSetIntegerValueField(cg, kCGTabletProximityEventPointerType, device);
    CGEventSetIntegerValueField(cg, kCGTabletProximityEventEnterProximity, entering);
    NSEvent *event = [NSEvent eventWithCGEvent:cg];
    CFRelease(cg);
    CHECK(event != nil);
    return event;
}

// Fault injection for the exception boundary, independent of the known invalid
// subtype access. NSObject avoids relying on NSEvent's private class-cluster init.
@interface InvalidTabletEvent : NSObject
@end
@implementation InvalidTabletEvent
- (NSWindow *)window { return nil; }
- (NSEventType)type {
    [NSException raise:NSInternalInconsistencyException format:@"Invalid test event"];
    return NSEventTypeTabletProximity;
}
@end

int main(void) {
    @autoreleasepool {
        freshState();
        NSEvent *hover = tabletEvent(kCGEventTabletProximity, NSEventSubtypeMouseEvent,
                                     NSPointingDeviceTypePen, YES);
        CHECK(hover.type == NSEventTypeTabletProximity);
        // Demonstrate the previous crash using AppKit itself, then verify the
        // production parser never attempts that invalid accessor.
        BOOL legacyThrew = NO;
        @try {
            BOOL point = hover.type == NSEventTypeTabletPoint ||
                hover.subtype == NSEventSubtypeTabletPoint;
            (void)point;
        } @catch (NSException *exception) {
            legacyThrew = YES;
        }
        CHECK(legacyThrew);
        inspectEvent(hover);
        CHECK(!inputUnavailable && receivedMode == 1 && receivedSource == 2);

        NSEvent *point = tabletEvent(kCGEventTabletPointer, NSEventSubtypeMouseEvent,
                                     NSPointingDeviceTypeUnknown, NO);
        CHECK(point.type == NSEventTypeTabletPoint);
        inspectEvent(point);
        CHECK(!inputUnavailable && receivedMode == 1 && receivedSource == 3);
        int before = notifications;
        for (int i = 0; i < 10000; i++) inspectEvent(point);
        CHECK(notifications == before);
        puts("PASS: native hover, tablet point, and repeated samples");

        NSEvent *eraser = tabletEvent(kCGEventTabletProximity, NSEventSubtypeMouseEvent,
                                      NSPointingDeviceTypeEraser, YES);
        inspectEvent(eraser);
        CHECK(!inputUnavailable && receivedMode == 2 && receivedSource == 2);
        NSEvent *wrappedPoint = tabletEvent(kCGEventMouseMoved, NSEventSubtypeTabletPoint,
                                            NSPointingDeviceTypeUnknown, NO);
        CHECK(wrappedPoint.type == NSEventTypeMouseMoved);
        CHECK(wrappedPoint.subtype == NSEventSubtypeTabletPoint);
        inspectEvent(wrappedPoint);
        CHECK(!inputUnavailable && receivedMode == 2 && receivedSource == 3);
        inspectEvent(tabletEvent(kCGEventTabletProximity, NSEventSubtypeMouseEvent,
                                 NSPointingDeviceTypeEraser, NO));
        CHECK(receivedMode == 0 && receivedSource == 2);
        inspectEvent(point);
        CHECK(receivedMode == 0 && receivedSource == 3);
        puts("PASS: eraser proximity, mouse-wrapped tablet data, and leaving range");

        NSEvent *wrappedProximity = tabletEvent(kCGEventMouseMoved, NSEventSubtypeTabletProximity,
                                                NSPointingDeviceTypePen, YES);
        CHECK(wrappedProximity.subtype == NSEventSubtypeTabletProximity);
        inspectEvent(wrappedProximity);
        CHECK(!inputUnavailable && receivedMode == 1 && receivedSource == 2);
        inspectEvent(tabletEvent(kCGEventMouseMoved, NSEventSubtypeMouseEvent,
                                 NSPointingDeviceTypeUnknown, NO));
        CHECK(receivedMode == 0 && receivedSource == 4);
        before = notifications;
        NSEvent *key = [NSEvent keyEventWithType:NSEventTypeKeyDown location:NSZeroPoint
            modifierFlags:0 timestamp:0 windowNumber:0 context:nil
            characters:@"a" charactersIgnoringModifiers:@"a" isARepeat:NO keyCode:0];
        inspectEvent(key);
        CHECK(!inputUnavailable && notifications == before);
        inspectEvent(eraser);
        reset();
        CHECK(receivedMode == 0 && receivedSource == 5);
        inspectEvent(point);
        CHECK(receivedMode == 0);
        puts("PASS: wrapped proximity, ordinary mouse, ignored key, and focus loss");

        inspectEvent(eraser);
        inspectEvent((NSEvent *)[InvalidTabletEvent new]);
        CHECK(inputUnavailable && receivedMode == 0 && receivedSource == 0);
        CHECK(tools.count == 0);
        before = notifications;
        inspectEvent(eraser);
        reset();
        CHECK(inputUnavailable && notifications == before);
        puts("PASS: Objective-C exception disables only the optional bridge");
    }
    return 0;
}
