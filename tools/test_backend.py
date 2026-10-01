#!/usr/bin/env python3
"""Run isolated backend regressions with the package import root configured."""
import os
import subprocess
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def main():
    env = {**os.environ, 'PYTHONPATH': str(ROOT/'backend')}
    for test in sorted((ROOT/'tests/backend').glob('*test.py')):
        subprocess.run([sys.executable, str(test)], cwd=ROOT, env=env, check=True)
    print('backend tests: ok')

if __name__ == '__main__':
    main()
