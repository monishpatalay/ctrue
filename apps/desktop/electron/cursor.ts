import type { BrowserWindow } from 'electron';

// The pop-up never takes focus, so Ctrue stays a background app, and macOS ignores a background app's cursor: the
// pointer keeps whatever the app underneath last set (an I-beam over an editor, say), whatever the page's CSS says.
// SetsCursorInBackground (the private switch other overlay apps use) lets Ctrue set it anyway, and the arrow is set
// on every mouse move over the pop-up. Chromium also hides the pointer on every key press
// (+[NSCursor setHiddenUntilMouseMoves:YES]); Apple documents that calling it with NO shows it again, so that is done
// straight after each key press. Only macOS needs any of this, so koffi is loaded only there.
export function keepArrowPointer(target: BrowserWindow) {
  if (process.platform !== 'darwin') return;
  try {
    const koffi = require('koffi') as typeof import('koffi');
    const objc = koffi.load('/usr/lib/libobjc.A.dylib');
    const cg = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
    const getClass = objc.func('void *objc_getClass(const char *)'), selector = objc.func('void *sel_registerName(const char *)');
    const send = objc.func('void *objc_msgSend(void *, void *)');
    const sendBool = objc.func('void *objc_msgSend(void *, void *, bool)');
    const sendString = objc.func('void *objc_msgSend(void *, void *, const char *)');
    const connection = cg.func('int _CGSDefaultConnection()')();
    const key = sendString(getClass('NSString'), selector('stringWithUTF8String:'), 'SetsCursorInBackground');
    cg.func('int CGSSetConnectionProperty(int, int, void *, void *)')(connection, connection, key, sendBool(getClass('NSNumber'), selector('numberWithBool:'), true));
    const cursor = getClass('NSCursor'), arrow = send(cursor, selector('arrowCursor')), set = selector('set'), hide = selector('setHiddenUntilMouseMoves:');
    target.webContents.on('before-mouse-event', (_event, mouse) => { if (mouse.type === 'mouseMove' || mouse.type === 'mouseEnter') send(arrow, set); });
    // setImmediate runs after Chromium has finished with the key press, so the NO lands after its YES.
    target.webContents.on('before-input-event', (_event, input) => { if (input.type === 'keyDown') setImmediate(() => sendBool(cursor, hide, false)); });
  } catch (error) {
    console.error('Could not keep the pointer an arrow over the pop-up:', error);
  }
}
