"""Seed reviewed appearance preferences without inheriting network or execution policy."""
import copy
from pathlib import Path
import time
from agent_sessions.private_files import private_json
from agent_sessions.paths import claude_root, claude_desktop_root
from .session_files import load

APP_KEYS = {'locale', 'userThemeMode'}
CODE_KEYS = {'theme', 'tui', 'attribution', 'includeCoAuthoredBy'}
VIEW_KEYS = {'ccd-sessions-filter', 'starred-cowork-spaces', 'starred-local-code-sessions',
             'starred-session-groups', 'desktop-frame.paneStore.v1', 'dframe-group-scopes',
             'dframe-local-slice', 'dframe-code-sections', 'starred-local-routines',
             'epitaxy-split-suggestion', 'epitaxy-transcript-links-in-preview',
             'epitaxy-transcript-links-chooser-seen'}


def reviewed_update(relative, values, account):
    allowed = {'config.json': APP_KEYS, 'claude-code/settings.json': CODE_KEYS,
               'claude_desktop_config.json': {'preferences'}}
    if relative not in allowed or not isinstance(values, dict) or set(values)-allowed[relative]:
        raise ValueError('偏好迁移包含未审阅的配置')
    if relative == 'claude_desktop_config.json':
        prefs = values.get('preferences', {})
        if set(prefs)-{'sidebarMode', 'coworkPreferredBrowser', 'epitaxyPrefs'}:
            raise ValueError('偏好迁移包含运行或权限配置')
        if prefs.get('coworkPreferredBrowser', 'built_in') != 'built_in':
            raise ValueError('未继承系统浏览器选择')
        views = prefs.get('epitaxyPrefs', {})
        if set(views)-VIEW_KEYS: raise ValueError('偏好迁移包含未审阅的视图配置')
        if any(not key.startswith(account+'/') for key in views.get('dframe-code-sections', {})):
            raise ValueError('偏好迁移包含其他账号的视图配置')


def sync_preferences(profile, source=None, code=None, dry_run=False):
    profile = Path(profile)
    source = Path(source) if source else claude_desktop_root().parent
    code = Path(code) if code else claude_root()
    account = load(profile/'config.json').get('lastKnownAccountUuid')
    marker = profile/'.agent-sessions-preferences.json'
    pending_path = profile/'.agent-sessions-preferences-pending.json'
    pending = load(pending_path)
    previous = load(marker)
    if previous.get('account') == account and account and not pending and not dry_run: return previous
    if not account or (pending.get('account') != account and load(source/'config.json').get('lastKnownAccountUuid') != account):
        return {'state': 'pending', 'applied': [], 'skipped': ['未找到同一账号的原环境，未继承设置']}
    applied, skipped = [], []
    updates = {}
    backup = profile/'.agent-sessions-preference-backups'/str(time.time_ns())

    def merge(relative, values):
        path = profile/relative
        current = load(path)
        reviewed_update(relative, values, account)
        proposed = copy.deepcopy(values)
        if relative == 'claude_desktop_config.json':
            prefs = {**current.get('preferences', {}), **values['preferences']}
            if 'epitaxyPrefs' in values['preferences']:
                prefs['epitaxyPrefs'] = {**current.get('preferences', {}).get('epitaxyPrefs', {}), **values['preferences']['epitaxyPrefs']}
            values = {'preferences': prefs}
        changed = {key: value for key, value in values.items() if current.get(key) != value}
        if not changed: return
        updates[relative] = proposed
        applied.extend(relative+':'+key for key in changed)
        if dry_run: return
        if path.is_file():
            destination = backup/relative
            destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            destination.write_bytes(path.read_bytes())
            destination.chmod(0o600)
        private_json(path, {**current, **changed})

    if pending.get('account') == account and not dry_run:
        for relative, values in pending.get('updates', {}).items(): merge(relative, values)
        result = {key: value for key, value in pending.items() if key != 'updates'}
        result.update(state='complete', applied=applied)
        private_json(marker, result)
        pending_path.unlink()
        return result

    app = load(source/'config.json')
    merge('config.json', {key: app[key] for key in APP_KEYS if key in app})
    settings = load(code/'settings.json')
    merge('claude-code/settings.json', {key: settings[key] for key in CODE_KEYS if key in settings})
    skipped.extend('Claude Code: '+key for key in settings if key not in CODE_KEYS)
    original = load(source/'claude_desktop_config.json').get('preferences', {})
    current = load(profile/'claude_desktop_config.json').get('preferences', {})
    safe = {key: original[key] for key in ('sidebarMode',) if key in original}
    if original.get('coworkPreferredBrowser') == 'built_in': safe['coworkPreferredBrowser'] = 'built_in'
    views = {key: copy.deepcopy(value) for key, value in original.get('epitaxyPrefs', {}).items() if key in VIEW_KEYS}
    skipped.extend('Claude App: epitaxyPrefs.'+key for key in original.get('epitaxyPrefs', {}) if key not in VIEW_KEYS)
    if 'dframe-code-sections' in views:
        views['dframe-code-sections'] = {key: value for key, value in views['dframe-code-sections'].items() if key.startswith(account+'/')}
    migrated = {row.get('base_id'): key for key, row in load(profile/'agent-sessions-sync.json').get('sessions', {}).items()}
    remapped = {row.get('sessionId'): migrated.get(row.get('cliSessionId')) for path in (source/'claude-code-sessions'/account).glob('*/*.json') if (row := load(path)).get('sessionId')}
    remapped = {key: value for key, value in remapped.items() if value}
    def remap(value):
        if isinstance(value, str): return remapped.get(value, value)
        if isinstance(value, list): return [remap(item) for item in value]
        if isinstance(value, dict): return {remapped.get(key, key): remap(item) for key, item in value.items()}
        return value
    views = remap(views)
    if views: safe['epitaxyPrefs'] = views
    merge('claude_desktop_config.json', {'preferences': safe})
    skipped.extend('Claude App: '+key for key in original if key not in safe)
    result = {'state': 'complete', 'account': account, 'applied': applied, 'skipped': skipped,
              'policy': '只继承已审阅的显示偏好；保留目标的身份、网络、权限、外部命令与实验功能配置'}
    if dry_run: result['updates'] = updates
    else: private_json(marker, result)
    return result
