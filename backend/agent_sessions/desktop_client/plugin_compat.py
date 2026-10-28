"""Keep known plugin runtime writes inside the current account's Code config."""
import json
from pathlib import Path

REVISION = 1


def adapt(directory, plugin_id, version):
    directory = Path(directory)
    changed = []

    def replace(relative, before, after):
        path = directory/relative
        if path.is_file():
            content = path.read_text(encoding='utf-8')
            if before in content:
                path.chmod(path.stat().st_mode | 0o200)
                path.write_text(content.replace(before, after), encoding='utf-8')
                changed.append(relative)

    if plugin_id == 'eden-dev@eden-marketplace':
        replace('scripts/send.sh', '_LOG_FILE = os.path.join(SCRIPT_DIR, ".send.log")',
                '_DATA_DIR = os.environ.get("CLAUDE_PLUGIN_DATA") or os.path.join(\n'
                '    os.environ.get("CLAUDE_CONFIG_DIR", os.path.expanduser("~/.claude")),\n'
                '    "plugins", "data", "eden-dev-eden-marketplace")\n'
                'os.makedirs(_DATA_DIR, exist_ok=True)\n'
                '_LOG_FILE = os.path.join(_DATA_DIR, "send.log")')
        replace('skills/auto-dev/scripts/metric-emitter.sh',
                '${EDEN_METRIC_DATA_DIR:=$HOME/.eden/auto-dev}',
                '${EDEN_METRIC_DATA_DIR:=${CLAUDE_PLUGIN_DATA:-${CLAUDE_CONFIG_DIR:-$HOME/.claude}'
                '/plugins/data/eden-dev-eden-marketplace}/auto-dev}')
    if plugin_id == 'eden-ops@eden-marketplace':
        replace('skills/ops-flow/registry/graph:started/30-capture-platform-session.sh',
                'find "${HOME:-}/.claude/projects"',
                'find "${CLAUDE_CONFIG_DIR:-${HOME:-}/.claude}/projects"')
        replace('skills/ops-flow/scripts/token-collector.py',
                'Path.home() / ".claude" / "projects"',
                'Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude") / "projects"')
        replace('skills/ops-flow/scripts/token-collector.py',
                "os.path.expanduser(f'~/.claude/projects/{slug}/{session_id}.jsonl')",
                'str(Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home()/".claude")'
                '/"projects"/slug/(session_id+".jsonl"))')
        for relative in ('skills/ops-flow/SKILL.md', 'skills/ops-flow/references/phase2-scene-route.md',
                         'skills/ops-flow/references/phase6-action.md'):
            replace(relative, '"$HOME/.claude/plugins/cache/eden-marketplace/eden-ops/"*/',
                    '"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/cache/eden-marketplace/eden-ops/'+version+'/" '
                    '"${CLAUDE_CODE_PLUGIN_SEED_DIR:+$CLAUDE_CODE_PLUGIN_SEED_DIR/cache/eden-marketplace/eden-ops/'+version+'/}"')
        path = directory/'hooks/hooks.json'
        if path.is_file():
            hooks = json.loads(path.read_text(encoding='utf-8'))
            for group in hooks.get('hooks', {}).get('PostToolUse', []):
                for hook in group.get('hooks', []):
                    script = '"${CLAUDE_PLUGIN_ROOT}/skills/ops-flow/scripts/phase-logger.sh"'
                    if hook.get('command') == 'chmod +x '+script+' && '+script:
                        hook['command'] = 'bash '+script
                        changed.append('hooks/hooks.json')
            if 'hooks/hooks.json' in changed:
                path.chmod(path.stat().st_mode | 0o200)
                path.write_text(json.dumps(hooks, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    return changed
