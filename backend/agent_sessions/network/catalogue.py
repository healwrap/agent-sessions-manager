"""Describe the user's active Clash subscription without depending on its nodes."""
import yaml
from .client import verge_directory


def profile_summary(source):
    result = {'name': '', 'type': '', 'dynamic_providers': len(source.get('proxy-providers', {}))}
    path = verge_directory()/'profiles.yaml'
    if not path.is_file(): return result
    value = yaml.safe_load(path.read_text(encoding='utf-8')) or {}
    current = next((row for row in value.get('items', []) if row.get('uid') == value.get('current')), {})
    result.update(name=current.get('name', ''), type=current.get('type', ''))
    return result
