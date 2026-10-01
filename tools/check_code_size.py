"""Keep source modules small enough to review; split by responsibility, not line count."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTENSIONS = {'.py', '.ts', '.tsx', '.css', '.rs', '.mjs'}
DIRECTORIES = ('frontend/src', 'backend/agent_sessions', 'desktop/src', 'scripts', 'tools', 'tests')


def main():
    failures = []
    count = 0
    for directory in DIRECTORIES:
        for path in (ROOT / directory).rglob('*'):
            if not path.is_file() or path.suffix not in EXTENSIONS:
                continue
            count += 1
            limit = 300 if path.suffix == '.css' else 450 if directory == 'tests' else 400
            lines = len(path.read_text(encoding='utf-8').splitlines())
            if lines > limit:
                failures.append(f'{path.relative_to(ROOT)}: {lines} 行，限额 {limit} 行')
    if failures:
        raise SystemExit('请按职责拆分以下文件：\n' + '\n'.join(failures))
    print(f'代码长度检查通过：{count} 个文件。')


if __name__ == '__main__':
    main()
