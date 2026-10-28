"""Keep a profile's account provenance after unbinding or deleting its account."""
import hashlib
from pathlib import Path

BINDINGS = (('profile_id', 'profiles'), ('app_profile_id', 'app_profiles'))


def directory(root, collection, key):
    digest = hashlib.sha256(key.encode()).hexdigest()[:32]
    app = collection == 'app_profiles'
    return Path(root)/('claude-app' if app else 'browser')/'profiles'/(digest+'-3p' if app else digest)


def owners(value, root):
    result = {target: dict(value.get('profile_owners', {}).get(target, {})) for _, target in BINDINGS}
    for account in value.get('accounts', []):
        for field, target in BINDINGS:
            if account.get(field):
                result[target].setdefault(account[field], {'account_id': account['id'], 'account_name': account['name']})
    for _, target in BINDINGS:
        for profile in value.get(target, []):
            key = profile['id']
            if key in result[target]: continue
            path = directory(root, target, key)
            if path.is_dir() and next(path.iterdir(), None) is not None:
                result[target][key] = {'account_id': '', 'account_name': '历史账号'}
    return result


def validate_binding(current, target, profile_id, account_id):
    owner = current.get('profile_owners', {}).get(target, {}).get(profile_id)
    if owner and owner['account_id'] != account_id:
        raise ValueError('此环境曾属于“'+owner['account_name']+'”，保留有原环境数据；请为新账号自动创建独立环境')


def remember(current):
    for account in current['accounts']:
        for field, target in BINDINGS:
            if account.get(field):
                validate_binding(current, target, account[field], account['id'])
                current['profile_owners'][target][account[field]] = {'account_id': account['id'], 'account_name': account['name']}
