"""Create an account and its isolated environments in a single settings write."""
from uuid import uuid4

COLLECTIONS = ('profiles', 'app_profiles', 'proxies', 'accounts')


def profile_name(account, collection):
    name = account.get('name', '')
    return (name.strip() if isinstance(name, str) else '')+(' · 浏览器' if collection == 'profiles' else ' · Claude App')


def sync_profile_names(current):
    accounts = {account['id']: account for account in current['accounts']}
    for field, collection in (('profile_id', 'profiles'), ('app_profile_id', 'app_profiles')):
        for profile in current[collection]:
            account = accounts.get(profile.get('name_account_id'))
            if account and account.get(field) == profile['id']:
                profile['name'] = profile_name(account, collection)


def put(current, collection, item):
    if any(row['id'] == item['id'] for row in current[collection]):
        current[collection] = [item if row['id'] == item['id'] else row for row in current[collection]]
    else:
        current[collection].append(item)


def provision(value, current, validate):
    if set(value)-{'collection', 'action', 'item', 'route'}: raise ValueError('账号创建参数无效')
    item = value.get('item')
    route = value.get('route', {})
    if not isinstance(item, dict) or not isinstance(route, dict) or set(route)-{'proxy_id', 'proxy_url'}:
        raise ValueError('账号与环境参数无效')
    item = dict(item)
    item['id'] = item.get('id') or str(uuid4())
    proxy_id = route.get('proxy_id', '')
    if route.get('proxy_url'):
        proxy = validate('proxies', {'name': item.get('name', '')+' 专用代理', 'url': route['proxy_url']}, current)
        put(current, 'proxies', proxy)
        proxy_id = proxy['id']
    defaults = {'proxy_id': proxy_id, 'locale': 'en-US', 'timezone': 'America/Los_Angeles',
                'locale_mode': 'proxy', 'timezone_mode': 'proxy', 'gates': {}}
    for field, collection in (('profile_id', 'profiles'), ('app_profile_id', 'app_profiles')):
        if item.get(field) != '__new__': continue
        profile = {**defaults, 'name': profile_name(item, collection), 'name_account_id': item['id']}
        if field == 'profile_id':
            profile.update(provider=item.get('provider'), engine='fingerprint-chromium', fingerprint_seed=str(uuid4()))
        else: profile.update(inherit_skills=True, inherit_plugins=True)
        profile = validate(collection, profile, current)
        put(current, collection, profile)
        item[field] = profile['id']
    put(current, 'accounts', validate('accounts', item, current))
