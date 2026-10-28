"""Read one registered proxy's saved node and effective runtime configuration."""
import json


def configuration_details(manager, key):
    with manager.lock:
        item = next((row for row in manager.environments.read()['proxies'] if row['id'] == key), None)
        if not item or item.get('kind') != 'managed':
            raise ValueError('请选择应用管理的专用代理')
        entry = manager.definition(key)
        path = manager.entry_directory(key)/'config.json'
        return {'source': json.dumps({'proxies': [entry['node']]}, ensure_ascii=False, indent=2),
                'configuration': path.read_text(encoding='utf-8')}
