"""Read the saved node configuration for one registered proxy."""
import json


def configuration_details(manager, key):
    with manager.lock:
        item = next((row for row in manager.environments.read()['proxies'] if row['id'] == key), None)
        if not item or item.get('kind') != 'managed':
            raise ValueError('请选择应用管理的专用代理')
        entry = manager.definition(key)
        return {'source': json.dumps({'proxies': [entry['node']]}, ensure_ascii=False, indent=2)}
