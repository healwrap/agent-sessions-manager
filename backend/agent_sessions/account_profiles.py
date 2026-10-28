"""Create an account and its isolated environments in a single settings write."""
from uuid import uuid4

COLLECTIONS = ('profiles', 'app_profiles', 'proxies', 'accounts')


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
    proxy_id = route.get('proxy_id', '')
    if route.get('proxy_url'):
        proxy = validate('proxies', {'name': item.get('name', '')+' 专用代理', 'url': route['proxy_url']}, current)
        put(current, 'proxies', proxy)
        proxy_id = proxy['id']
    defaults = {'proxy_id': proxy_id, 'locale': 'en-US', 'timezone': 'America/Los_Angeles',
                'locale_mode': 'proxy', 'timezone_mode': 'proxy', 'gates': {}}
    for field, collection in (('profile_id', 'profiles'), ('app_profile_id', 'app_profiles')):
        if item.get(field) != '__new__': continue
        profile = {**defaults, 'name': item.get('name', '')+(' · 浏览器' if field == 'profile_id' else ' · Claude App')}
        if field == 'profile_id':
            profile.update(provider=item.get('provider'), engine='fingerprint-chromium', fingerprint_seed=str(uuid4()))
        else: profile['inherit_skills'] = True
        profile = validate(collection, profile, current)
        put(current, collection, profile)
        item[field] = profile['id']
    put(current, 'accounts', validate('accounts', item, current))
