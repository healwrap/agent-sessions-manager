"""OpenSSH ProxyCommand transport through the environment's existing CONNECT relay."""
import os
import re
import socket
import sys
import threading


def main(args):
    try:
        if len(args) != 3: raise ValueError('代理隧道参数无效')
        relay_port, host, port = int(args[0]), args[1], int(args[2])
        if not 1 <= relay_port <= 65535 or not 1 <= port <= 65535 or not re.fullmatch(r'[A-Za-z0-9._:-]{1,253}', host):
            raise ValueError('代理隧道目标无效')
        if os.name == 'nt':
            import msvcrt
            for descriptor in (0, 1): msvcrt.setmode(descriptor, os.O_BINARY)
        with socket.create_connection(('127.0.0.1', relay_port), timeout=12) as connection:
            authority = ('['+host+']' if ':' in host else host)+':'+str(port)
            connection.sendall(('CONNECT '+authority+' HTTP/1.1\r\nHost: '+authority+'\r\n\r\n').encode())
            response = b''
            while not response.endswith(b'\r\n\r\n') and len(response) < 65536:
                chunk = connection.recv(1)
                if not chunk: break
                response += chunk
            if response.split(b'\r\n', 1)[0].split()[1:2] != [b'200']:
                raise ValueError('专用代理没有建立 SSH 隧道')
            connection.settimeout(None)
            def upload():
                try:
                    while data := os.read(0, 65536): connection.sendall(data)
                    connection.shutdown(socket.SHUT_WR)
                except OSError: pass
            threading.Thread(target=upload, daemon=True).start()
            while data := connection.recv(65536):
                sys.stdout.buffer.write(data)
                sys.stdout.buffer.flush()
        return 0
    except (OSError, ValueError) as error:
        print('专用代理 SSH 连接失败：'+str(error), file=sys.stderr)
        return 1
