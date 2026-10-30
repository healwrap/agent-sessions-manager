"""Keep external-tool observations separate from Claude's connection gate."""
from datetime import datetime, timezone
from .connections import public, SAMPLE_INTERVAL


def describe(row):
    return f"{row.get('process_name') or '未知进程'}（PID {row['pid']}）→ {row['host']}:{row['port']}"


def observation(rows, proxied):
    direct = [row for row in rows if public(row['host'])]
    return {'scope': 'claude-components', 'sample_interval_ms': round(SAMPLE_INTERVAL*1000),
            'connections': rows,
            'violations': [row for row in direct if proxied and row['process_scope'] == 'claude'],
            'tool_connections': [row for row in direct if row['process_scope'] == 'tool'],
            'unknown_connections': [row for row in direct if row['process_scope'] == 'unknown'],
            'checked_at': datetime.now(timezone.utc).isoformat()}


def checks(snapshot, proxied):
    claude = [row for row in snapshot['connections'] if row['process_scope'] == 'claude']
    unknown = snapshot['unknown_connections']
    result = [dict(id='app-connections', title='Claude 连接采样', policy='warn',
                   state='unknown' if unknown or not claude else 'pass',
                   value='存在归属待确认的连接' if unknown else '当前没有 Claude 连接样本' if not claude
                         else '已观测 Claude 连接未发现公网直连' if proxied else '当前使用系统路由',
                   detail=f'目标间隔 {snapshot["sample_interval_ms"]} 毫秒；按主程序、官方组件和 Code 运行时归属检查。系统服务和 VM 内部未覆盖。'
                          + ('归属待确认：'+'；'.join(describe(row) for row in unknown) if unknown else ''))]
    tools = snapshot['tool_connections']
    if tools:
        result.append(dict(id='app-tool-connections', title='外部工具联网', policy='warn', state='info', label='仅记录',
                           value=f'观测到 {len(tools)} 条工具公网连接，不触发 Claude 停止',
                           detail='；'.join(describe(row) for row in tools)))
    return result
