"""Normalize recorded shell arguments for the shared, read-only terminal card."""
import json
import ntpath
import posixpath
import re

# Tool protocols, never Agent identity. Unknown or partial input stays generic.
COMMAND_FIELDS = {
    'bash': 'command', 'pwsh': 'command',
    'exec_command': 'cmd', 'run_command': 'CommandLine',
    'run_terminal_cmd': 'command', 'run_terminal_command': 'command',
}


def terminal_input(detail, session_cwd=''):
    session_cwd = session_cwd if isinstance(session_cwd, str) else ''
    event = detail['event']
    name = re.sub(r'_v\d+$', '', event['name'].split('__')[-1].split('.')[-1].lower())
    field = COMMAND_FIELDS.get(name)
    if (not field or event['kind'] not in ('tool', 'subtool') or
            detail.get('part', 'input') != 'input' or detail.get('pages') != 1 or
            detail.get('input_truncated')):
        return None
    try: args = json.loads(detail['text'])
    except (ValueError, TypeError): return None
    if not isinstance(args, dict): return None
    command = args.get(field)
    if not isinstance(command, str) or not command.strip(): return None
    # Harness persistent/background shells and failed tool envelopes use IN/OUT.
    if name in ('bash', 'pwsh'):
        description = args.get('description')
        if (not isinstance(description, str) or not description.strip() or
                args.get('run_in_background') is True or event.get('status') in ('error', 'aborted') or
                (not detail.get('output_available') and event.get('status') not in ('running', 'in_progress'))):
            return None
    cwd = next((args[k] for k in ('workdir', 'cwd', 'Cwd') if isinstance(args.get(k), str) and args[k]), session_cwd)
    if isinstance(cwd, str) and cwd:
        paths = ntpath if '\\' in cwd or (isinstance(session_cwd, str) and '\\' in session_cwd) else posixpath
        if session_cwd and not paths.isabs(cwd): cwd = paths.join(session_cwd, cwd)
        cwd = paths.normpath(cwd)
    else:
        cwd = None
    description = next((args[k] for k in ('description', 'commandDescription', 'toolAction', 'toolSummary')
                        if isinstance(args.get(k), str) and args[k].strip()), None)
    return {'command': command, 'cwd': cwd, 'description': description,
            'exit_markers': name in ('bash', 'pwsh') and isinstance(args.get('description'), str),
            **({'result_format': 'command-json'} if name == 'run_terminal_command' else {})}
