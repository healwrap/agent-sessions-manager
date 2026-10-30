"""The Python runtime shared by development, CI and packaged desktop builds."""
import json
import sys

PYTHON_VERSION = (3, 12)


def require_python():
    if sys.version_info[:2] != PYTHON_VERSION:
        raise SystemExit('Agent Sessions 需要 Python 3.12.x，当前为 '
                         + '.'.join(map(str, sys.version_info[:3]))+'（'+sys.executable+'）。'
                         + '请用 Python 3.12 重新创建开发或打包虚拟环境后重试。')


def runtime_info():
    return {'version': list(sys.version_info[:3]), 'frozen': bool(getattr(sys, 'frozen', False)),
            'executable': sys.executable}


if __name__ == '__main__':
    require_python()
    print(json.dumps(runtime_info(), ensure_ascii=False))
