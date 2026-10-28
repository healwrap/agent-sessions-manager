"""Activate an owned macOS process without launching a default application profile."""
import ctypes
import sys


def _application_action(pid, action):
    if sys.platform == 'win32': return _windows_action(pid, action)
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
        if action == 'activate': return bool(app and activate(app, selector('activateWithOptions:'), 3))
        terminate = ctypes.CFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)(address)
        return bool(app and terminate(app, selector('terminate')))
    finally:
        message(pool, selector('drain'))


def _windows_action(pid, action):
    from ctypes import wintypes
    user32 = ctypes.WinDLL('user32', use_last_error=True)
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user32.IsWindowVisible.argtypes = [wintypes.HWND]
    user32.SetForegroundWindow.argtypes = [wintypes.HWND]
    user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
    user32.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
    handles = []
    def visit(handle, _):
        owner = wintypes.DWORD()
        user32.GetWindowThreadProcessId(handle, ctypes.byref(owner))
        if owner.value == pid and user32.IsWindowVisible(handle): handles.append(handle)
        return True
    callback = callback_type(visit)
    user32.EnumWindows.argtypes = [callback_type, wintypes.LPARAM]
    user32.EnumWindows(callback, 0)
    if not handles: return False
    if action == 'activate':
        user32.ShowWindow(handles[0], 9)
        return bool(user32.SetForegroundWindow(handles[0]))
    return all(user32.PostMessageW(handle, 0x0010, 0, 0) for handle in handles)


def focus_process(pid):
    return _application_action(pid, 'activate')


def quit_process(pid):
    return _application_action(pid, 'terminate')
