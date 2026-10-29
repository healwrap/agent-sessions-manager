"""Adapt the public All Done Sites measurements, preserving their estimation basis."""
import re
from .models import number, reset_time

SOURCE_URL = 'https://alldonesites.com/claude-usage-tracker/'
DATA_URL = 'https://alldonesites.com/data/claude-usage.json'
DATA_VERSION = 3
PLANS = ('pro', 'max5', 'max20')
PLAN_RATIOS = {'pro': .05, 'max5': .25, 'max20': 1}
PLAN_BASIS = {'source_label': 'Claude 官方套餐说明', 'as_of': '2026-10-29',
              'source_url': 'https://support.claude.com/en/articles/11049741-what-is-the-max-plan',
              'kind': 'official_per_session_multiplier', 'scope': '5 小时周期'}


def figure(value):
    if not isinstance(value, dict): return None
    point = number(value.get('value'))
    if point is None: return None
    interval = value.get('interval')
    edges = [number(edge) for edge in interval] if isinstance(interval, list) and len(interval) == 2 else []
    return {'value': point, 'low': edges[0] if len(edges) == 2 else None,
            'high': edges[1] if len(edges) == 2 else None}


def extended_models(data, credits, tokens, models):
    """Use published rate ratios when a newer family has no mixed-token row yet."""
    rates = credits.get('measured_rates') or {}
    anchor = rates.get('anchor') or {}
    anchor_in, anchor_out = number(anchor.get('input')), number(anchor.get('output'))
    baseline = figure((tokens.get('per_family') or {}).get(anchor.get('family'), {}).get('all'))
    if not baseline or not anchor_in or not anchor_out: return
    anchor_label = next((item['label'] for item in models if item['family'] == anchor.get('family')), anchor.get('family'))
    for family, row in (rates.get('per_family') or {}).items():
        model = 'claude-'+family
        if any(item['family'] == family for item in models): continue
        if model not in (data.get('api_price_per_mtok') or {}) or model not in (data.get('model_plan_limits') or {}): continue
        rate, output = number(row.get('input')), number(row.get('output_multiplier'))
        # A mixed-token scaling is valid only when both token classes share the ratio.
        if not rate or rate <= 0 or not output or abs(anchor_out/anchor_in-output) > 1e-6: continue
        ratio = anchor_in/rate
        parts = model.removeprefix('claude-').split('-')
        models.append({'id': model, 'label': parts[0].title()+' '+'.'.join(parts[1:]), 'family': family,
                       'as_of': credits.get('as_of'), 'rate_source': row.get('rate_source') or '',
                       'qualification': row.get('status') or '',
                       'mixed': {key: value*ratio if value is not None else None for key, value in baseline.items()},
                       'mixed_as_of': tokens.get('as_of'),
                       'conversion': '按 '+anchor_label+' 的混合 Token 样本与数据源发布的模型消耗比例换算',
                       'plans': data['model_plan_limits'][model]})


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
        mixed = (tokens.get('per_family') or {}).get(family, {})
        parts = model.removeprefix('claude-').split('-')
        label = parts[0].title()+' '+'.'.join(parts[1:])
        models.append({'id': model, 'label': label,
                       'family': family, 'as_of': row.get('as_of'), 'rate_source': row.get('rate_source'),
                       'qualification': row.get('status') or '',
                       'mixed': figure(mixed.get('all')), 'mixed_as_of': tokens.get('as_of'),
                       'plans': (data.get('model_plan_limits') or {}).get(model, {})})
    extended_models(data, credits, tokens, models)
    if not models: raise ValueError('第三方数据没有可识别的模型换算结果')
    weekly = {}
    for plan in PLANS:
        row = (data.get('weekly_windows') or {}).get(plan) or {}
        estimate = row.get('current_estimate') or {}
        weekly[plan] = {'value': number(row.get('current')), 'inferred': bool(row.get('assumed')),
                        'as_of': estimate.get('as_of'), 'stale': bool(estimate.get('stale'))}
    return {'adapter_version': DATA_VERSION, 'source_label': 'All Done Sites', 'source_url': SOURCE_URL, 'data_url': DATA_URL,
            'generated_at': generated, 'observed_at': credits.get('as_of'), 'models': models,
            'plan_ratios': PLAN_RATIOS.copy(), 'plan_basis': PLAN_BASIS.copy(),
            'weekly_windows': weekly, 'cache_read_share': number((tokens.get('cache_read_share') or {}).get('value')),
            'sample_count': number(tokens.get('n')), 'account_count': number(data.get('passive_account_count'))}


def subscription_plan(identity, organization=None):
    """Only recognize explicit service plan fields; an unknown tier stays unknown."""
    organization = organization or identity.get('organization') or {}
    labels = [organization.get('analytics_subscription_plan'), organization.get('rate_limit_tier'), organization.get('organization_type'),
              identity.get('rate_limit_tier')]
    labels = [re.sub(r'[\s_-]+', '_', value.lower().replace('×', 'x')).strip('_')
              for value in labels if isinstance(value, str)]
    for suffix, plan in (('max_20x', 'max20'), ('max_5x', 'max5')):
        if any(value in (suffix, 'claude_'+suffix, 'default_claude_'+suffix) for value in labels): return plan
    # Max accounts can also expose claude_pro; a coarse Max label cannot identify its multiplier.
    if any('max' in value for value in labels): return ''
    if any(value in ('default_claude_pro', 'claude_pro', 'pro') for value in labels): return 'pro'
    return ''
