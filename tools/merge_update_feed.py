"""Merge per-platform release records, refusing mixed versions or unsigned assets."""
import json
from pathlib import Path
import sys


def merge(folder, version):
    folder = Path(folder)
    manifests = [json.loads(path.read_text(encoding='utf-8')) for path in sorted(folder.glob('*.json')) if path.name != 'latest.json']
    if not manifests: raise ValueError('未找到更新发布记录')
    result = {**manifests[0], 'platforms': {}}
    for manifest in manifests:
        if manifest['version'] != version: raise ValueError('发布版本不一致')
        for target, item in manifest['platforms'].items():
            if target in result['platforms']: raise ValueError('更新平台重复：'+target)
            prefix = 'https://github.com/healwrap/agent-sessions-manager/releases/download/v'+version+'/'
            if not item['url'].startswith(prefix) or not item.get('signature'): raise ValueError('更新记录缺少签名或发布地址无效')
            result['platforms'][target] = item
    (folder/'latest.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    return result


if __name__ == '__main__':
    merge(sys.argv[1], sys.argv[2].removeprefix('v'))
