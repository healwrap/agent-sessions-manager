"""Adapt the public All Done Sites measurements, preserving their estimation basis."""
from .models import number, reset_time

SOURCE_URL = 'https://alldonesites.com/claude-usage-tracker/'
DATA_URL = 'https://alldonesites.com/data/claude-usage.json'
PLANS = ('pro', 'max5', 'max20')


def figure(value):
    if not isinstance(value, dict): return None
    point = number(value.get('value'))
    if point is None: return None
    interval = value.get('interval')
    edges = [number(edge) for edge in interval] if isinstance(interval, list) and len(interval) == 2 else []
    return {'value': point, 'low': edges[0] if len(edges) == 2 else None,
            'high': edges[1] if len(edges) == 2 else None}


def normalize_benchmarks(data):
    if not isinstance(data, dict) or data.get('schema_version') != 2:
        raise ValueError('第三方用量数据格式已变化，请更新数据源适配')
    generated = reset_time(data.get('generated_at'))
    if not generated: raise ValueError('第三方数据没有有效的发布时间')
    credits = data.get('credits') or {}
    tokens = credits.get('window_tokens') or {}
    models = []
    for family, row in (credits.get('per_model') or {}).items():
        model = row.get('list_price_model')
        if not isinstance(model, str) or not model.startswith('claude-'): continue
        classes = row.get('tokens_per_window') or {}
        mixed = (tokens.get('per_family') or {}).get(family, {})
        parts = model.removeprefix('claude-').split('-')
        label = parts[0].title()+' '+'.'.join(parts[1:])
        models.append({'id': model, 'label': label,
                       'family': family, 'as_of': row.get('as_of'), 'rate_source': row.get('rate_source'),
                       'qualification': row.get('status') or '',
                       'input': figure(classes.get('input')), 'output': figure(classes.get('output')),
                       'mixed': figure(mixed.get('all')), 'mixed_as_of': tokens.get('as_of'),
                       'plans': (data.get('model_plan_limits') or {}).get(model, {})})
    if not models: raise ValueError('第三方数据没有可识别的模型换算结果')
    ratios = {plan: number((data.get('plan_ratios') or {}).get(plan)) for plan in PLANS}
    if ratios.get('max20') != 1 or any(value is None for value in ratios.values()):
        raise ValueError('第三方数据缺少有效的套餐比例')
    weekly = {}
    for plan in PLANS:
        row = (data.get('weekly_windows') or {}).get(plan) or {}
        estimate = row.get('current_estimate') or {}
        weekly[plan] = {'value': number(row.get('current')), 'inferred': bool(row.get('assumed')),
                        'as_of': estimate.get('as_of'), 'stale': bool(estimate.get('stale'))}
    return {'source_label': 'All Done Sites', 'source_url': SOURCE_URL, 'data_url': DATA_URL,
            'generated_at': generated, 'observed_at': credits.get('as_of'), 'models': models,
            'plan_ratios': ratios, 'plan_basis': data.get('plan_ratios_basis') or {},
            'weekly_windows': weekly, 'cache_read_share': number((tokens.get('cache_read_share') or {}).get('value')),
            'sample_count': number(tokens.get('n')), 'account_count': number(data.get('passive_account_count'))}


def subscription_plan(identity, organization=None):
    """Only recognize explicit service plan fields; an unknown tier stays unknown."""
    organization = organization or identity.get('organization') or {}
    tier = organization.get('rate_limit_tier') or identity.get('rate_limit_tier') or ''
    if not isinstance(tier, str): return ''
    if 'max_20x' in tier: return 'max20'
    if 'max_5x' in tier: return 'max5'
    if tier in ('default_claude_pro', 'claude_pro', 'pro'): return 'pro'
    return ''
