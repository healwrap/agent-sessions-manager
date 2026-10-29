"""Normalize the quota windows returned by Claude's web and OAuth endpoints."""
from datetime import datetime
import math


class UsageError(Exception):
    def __init__(self, state, message, retry_after=0, organizations=None, metadata=None):
        super().__init__(message)
        self.state, self.retry_after = state, retry_after
        self.organizations = organizations or []
        self.metadata = metadata or {}


def number(value):
    return float(value) if type(value) in (int, float) and math.isfinite(value) and value >= 0 else None


def reset_time(value):
    if not isinstance(value, str): return None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.isoformat() if parsed.tzinfo else None
    except ValueError: return None


def normalize(data):
    if not isinstance(data, dict): raise UsageError('unavailable', '服务未返回有效的用量数据')
    windows = []
    labels = {'five_hour': '5 小时用量', 'seven_day': '7 天用量',
              'seven_day_opus': 'Opus · 7 天', 'seven_day_sonnet': 'Sonnet · 7 天',
              'seven_day_cowork': 'Cowork · 7 天', 'seven_day_oauth_apps': 'OAuth 应用 · 7 天'}
    for key, label in labels.items():
        value = data.get(key)
        percent = number(value.get('utilization')) if isinstance(value, dict) else None
        if percent is not None:
            windows.append({'id': key, 'label': label, 'used_percent': percent, 'resets_at': reset_time(value.get('resets_at'))})
    for value in data.get('limits', []) if isinstance(data.get('limits'), list) else []:
        if not isinstance(value, dict): continue
        scope = value.get('scope') or {}
        model = scope.get('model') if isinstance(scope, dict) else None
        name = model.get('display_name') if isinstance(model, dict) else None
        percent = number(value.get('percent') if 'percent' in value else value.get('utilization'))
        if isinstance(name, str) and percent is not None and not any(name.casefold() in row['id'].casefold() for row in windows):
            windows.append({'id': 'model:'+name, 'label': name+' · 7 天', 'used_percent': percent,
                            'resets_at': reset_time(value.get('resets_at'))})
    extra = data.get('extra_usage')
    spending = None
    if isinstance(extra, dict) and extra.get('is_enabled', True):
        used, limit = number(extra.get('used_credits')), number(extra.get('monthly_limit'))
        if used is not None:
            spending = {'used': used/100, 'limit': limit/100 if limit is not None else None,
                        'currency': extra.get('currency') if isinstance(extra.get('currency'), str) else 'USD',
                        'used_percent': number(extra.get('utilization')), 'resets_at': reset_time(extra.get('resets_at'))}
    if not windows and spending is None:
        raise UsageError('unavailable', '当前组织未提供数值额度；请在 Claude 用量页面查看订阅说明')
    return {'windows': windows, 'extra_usage': spending}
