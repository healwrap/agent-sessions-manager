"""Activate an owned macOS process without launching a default application profile."""
import ctypes
import sys


def focus_process(pid):
    if sys.platform != 'darwin': return False
    ctypes.CDLL('/System/Library/Frameworks/AppKit.framework/AppKit')
    objc = ctypes.CDLL('/usr/lib/libobjc.A.dylib')
    objc.objc_getClass.restype = ctypes.c_void_p
    objc.objc_getClass.argtypes = [ctypes.c_char_p]
    objc.sel_registerName.restype = ctypes.c_void_p
    objc.sel_registerName.argtypes = [ctypes.c_char_p]
    address = ctypes.cast(objc.objc_msgSend, ctypes.c_void_p).value
    message = ctypes.CFUNCTYPE(ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p)(address)
    lookup = ctypes.CFUNCTYPE(ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int)(address)
    activate = ctypes.CFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong)(address)
    selector = lambda name: objc.sel_registerName(name.encode())
    pool = message(objc.objc_getClass(b'NSAutoreleasePool'), selector('new'))
    try:
        app = lookup(objc.objc_getClass(b'NSRunningApplication'), selector('runningApplicationWithProcessIdentifier:'), pid)
        return bool(app and activate(app, selector('activateWithOptions:'), 3))
    finally:
        message(pool, selector('drain'))
