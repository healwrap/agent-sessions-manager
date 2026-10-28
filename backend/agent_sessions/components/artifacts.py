"""Bounded official downloads and archive extraction for runtime installers."""
import hashlib
from pathlib import Path
import shutil
import stat
import subprocess
import urllib.request
import zipfile


def download(url, destination, progress, digest='', expected=0, limit=2*1024**3):
    request = urllib.request.Request(url, headers={'User-Agent': 'Agent-Sessions'})
    size, checksum = 0, hashlib.sha256()
    with urllib.request.urlopen(request, timeout=30) as response, open(destination, 'wb') as output:
        total = expected or int(response.headers.get('Content-Length') or 0)
        while True:
            block = response.read(1024*1024)
            if not block: break
            size += len(block)
            if size > limit or (total and size > total): raise ValueError('下载大小与发布记录不符')
            output.write(block); checksum.update(block)
            if total: progress(progress=round(size/total*85))
    if (total and size != total) or (digest and checksum.hexdigest() != digest.removeprefix('sha256:')):
        raise ValueError('下载完整性校验失败')
    return checksum.hexdigest()


def extract_zip(archive, destination, *, macos=False):
    root = Path(destination).resolve()
    root.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as source:
        total = 0
        for row in source.infolist():
            path = root/row.filename.replace('\\', '/')
            if not path.resolve().is_relative_to(root): raise ValueError('安装包路径无效')
            total += row.file_size
            if total > 4*1024**3: raise ValueError('安装包解压后过大')
            if stat.S_ISLNK(row.external_attr >> 16):
                target = source.read(row).decode()
                if not (path.parent/target).resolve().is_relative_to(root): raise ValueError('安装包链接超出组件目录')
                if not macos: raise ValueError('Windows 安装包不能包含符号链接')
        if macos:
            subprocess.run(['ditto', '-x', '-k', str(archive), str(root)], check=True, capture_output=True, timeout=120)
        else: source.extractall(root)


def remove_owned(directory):
    root = Path(directory)
    if root.is_symlink(): raise ValueError('组件目录不能是外部链接')
    for name in ('versions', 'downloads', 'current.json'):
        path = root/name
        if path.is_symlink(): raise ValueError('组件目录不能是外部链接')
        if path.is_dir(): shutil.rmtree(path)
        else: path.unlink(missing_ok=True)
