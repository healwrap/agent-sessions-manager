"""Ordered node dependencies; a backup may have its own backups, never a cycle."""

MAX_CHAIN = 16


def chain(lines, key):
    by_id = {row['id']: row for row in lines}
    result, seen = [], set()

    def visit(current, path):
        if current in path: raise ValueError('备用节点不能循环引用')
        if current not in by_id: raise ValueError('备用节点已不存在，请重新选择')
        if current in seen: return
        seen.add(current)
        result.append(by_id[current])
        if len(result) > MAX_CHAIN: raise ValueError('一条回退链最多包含 16 个节点')
        for child in by_id[current].get('fallback_ids', []): visit(child, path | {current})

    visit(key, set())
    return result


def validate(lines):
    for row in lines:
        backups = row.get('fallback_ids', [])
        if (not isinstance(backups, list) or len(backups) > 8
                or any(not isinstance(key, str) or not key for key in backups)
                or len(set(backups)) != len(backups)):
            raise ValueError('请选择最多 8 个不重复的备用节点')
        if row.get('fallback_mode', 'manual') not in ('manual', 'automatic'):
            raise ValueError('请选择有效的故障处理方式')
    for row in lines: chain(lines, row['id'])


def references(lines, key):
    return [row for row in lines if key in row.get('fallback_ids', [])]
