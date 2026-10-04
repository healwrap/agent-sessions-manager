"""Cheap change stamps for local transcripts, including SQLite's committed WAL."""
import hashlib
from pathlib import Path


def file_revision(paths):
    values = []
    for path in sorted(set(paths)):
        for file in (path, Path(str(path)+'-wal')):
            try:
                stat = file.stat()
                value = (str(file), stat.st_size, stat.st_mtime_ns, stat.st_ino)
            except FileNotFoundError:
                value = (str(file), None)
            values.append(value)
    return hashlib.sha256(repr(values).encode()).hexdigest()
