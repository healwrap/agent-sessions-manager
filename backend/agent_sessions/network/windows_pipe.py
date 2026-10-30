"""Bounded HTTP transport over Mihomo's current-user Windows named pipe."""
import ctypes
from ctypes import wintypes
import http.client
import io


class PipeReader(io.RawIOBase):
    def __init__(self, pipe):
        super().__init__()
        self.pipe = pipe
        pipe.readers += 1

    def readable(self): return True

    def readinto(self, buffer):
        data = self.pipe.transfer(None, len(buffer))
        buffer[:len(data)] = data
        return len(data)

    def close(self):
        if not self.closed:
            self.pipe.readers -= 1
            self.pipe.dispose()
        super().close()


class PipeSocket:
    def __init__(self, path, timeout):
        self.kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        self.timeout, self.readers, self.closed = int(timeout*1000), 0, False
        k = self.kernel
        k.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p,
                                 wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
        k.CreateFileW.restype = wintypes.HANDLE
        k.CreateEventW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.BOOL, wintypes.LPCWSTR]
        k.CreateEventW.restype = wintypes.HANDLE
        k.WaitNamedPipeW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD]
        k.CloseHandle.argtypes = [wintypes.HANDLE]
        k.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        k.WaitForSingleObject.restype = wintypes.DWORD
        for name in ('ReadFile', 'WriteFile'):
            getattr(k, name).argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD,
                                        ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p]
        k.GetOverlappedResult.argtypes = [wintypes.HANDLE, ctypes.c_void_p,
                                          ctypes.POINTER(wintypes.DWORD), wintypes.BOOL]
        k.CancelIoEx.argtypes = [wintypes.HANDLE, ctypes.c_void_p]
        if not k.WaitNamedPipeW(path, self.timeout): raise ctypes.WinError(ctypes.get_last_error())
        self.handle = k.CreateFileW(path, 0xc0000000, 0, None, 3, 0x40000000, None)
        if self.handle == ctypes.c_void_p(-1).value: raise ctypes.WinError(ctypes.get_last_error())

    def transfer(self, data, size):
        class Overlapped(ctypes.Structure):
            _fields_ = [('internal', ctypes.c_size_t), ('internal_high', ctypes.c_size_t),
                        ('offset', wintypes.DWORD), ('offset_high', wintypes.DWORD), ('event', wintypes.HANDLE)]
        event = self.kernel.CreateEventW(None, True, False, None)
        if not event: raise ctypes.WinError(ctypes.get_last_error())
        operation = Overlapped(event=event)
        buffer = ctypes.create_string_buffer(data, len(data)) if data is not None else ctypes.create_string_buffer(size)
        count = wintypes.DWORD()
        function = self.kernel.WriteFile if data is not None else self.kernel.ReadFile
        try:
            ok = function(self.handle, buffer, size, ctypes.byref(count), ctypes.byref(operation))
            error = ctypes.get_last_error() if not ok else 0
            if error in (109, 232): return b'' if data is None else 0
            if error == 997:
                if self.kernel.WaitForSingleObject(event, self.timeout) != 0:
                    self.kernel.CancelIoEx(self.handle, ctypes.byref(operation))
                    self.kernel.GetOverlappedResult(self.handle, ctypes.byref(operation), ctypes.byref(count), True)
                    raise TimeoutError('Clash 命名管道响应超时')
                if not self.kernel.GetOverlappedResult(self.handle, ctypes.byref(operation), ctypes.byref(count), False):
                    error = ctypes.get_last_error()
                    if error in (109, 232): return b'' if data is None else 0
                    raise ctypes.WinError(error)
            elif error:
                raise ctypes.WinError(error)
            return count.value if data is not None else buffer.raw[:count.value]
        finally:
            self.kernel.CloseHandle(event)

    def sendall(self, data):
        while data:
            count = self.transfer(data, len(data))
            if not count: raise OSError('Clash 命名管道已关闭')
            data = data[count:]

    def makefile(self, mode): return io.BufferedReader(PipeReader(self))

    def close(self):
        self.closed = True
        self.dispose()

    def dispose(self):
        if self.closed and not self.readers and self.handle:
            self.kernel.CloseHandle(self.handle)
            self.handle = None


class PipeConnection(http.client.HTTPConnection):
    def __init__(self, path):
        super().__init__('localhost', timeout=2)
        self.path = path

    def connect(self): self.sock = PipeSocket(self.path, self.timeout)
