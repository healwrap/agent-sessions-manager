"""Full-ledger layout metadata; navigation and rendering share the same axis."""
from collections import defaultdict
from datetime import datetime


def timestamp(value):
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()*1000
    except (ValueError, TypeError, AttributeError):
        return None


def layout(events):
    # Match Harness duration mode: preserve recorded execution intervals and
    # remove gaps outside their union. Missing timing stays a point, never an
    # invented model execution duration.
    spans = []; sequence = 0
    for event in events:
        event.setdefault('duration_ms', None)
        event['timeline_position'] = sequence
        if event.get('request_only'): continue
        sequence += 1
        start = timestamp(event.get('timestamp'))
        if start is not None:
            spans.append((start, start+max(0, event.get('duration_ms') or 0), event))
    removed = 0; covered = None
    for start, end, event in sorted(spans, key=lambda s: (s[0], s[1])):
        if covered is not None and start > covered:
            removed += start-covered
        event['active_start'] = start-removed
        event['active_end'] = end-removed
        covered = end if covered is None else max(covered, end)
    lower = min((e['active_start'] for _, _, e in spans), default=0)
    upper = max((e['active_end'] for _, _, e in spans), default=lower)
    total = upper-lower
    for event in events:
        if 'active_start' in event and total > 0:
            event['timeline_start'] = (event.pop('active_start')-lower)/total
            event['timeline_end'] = (event.pop('active_end')-lower)/total
        else:
            event.pop('active_start', None); event.pop('active_end', None)
            event['timeline_start'] = event['timeline_end'] = event['timeline_position']/max(1, sequence-1)
    turns = defaultdict(list)
    groups = {}; run = []; previous = None
    def finish():
        if not run: return
        key = previous['ref'] if previous and previous['kind'] == 'assistant' and previous['turn'] == run[0]['turn'] else run[0]['ref']
        group = {'key': key, 'first_ref': run[0]['ref'], 'last_ref': run[-1]['ref'],
                 'count': len(run), 'names': list(dict.fromkeys(e['name'] for e in run)),
                 'anchor_ref': previous['ref'] if key != run[0]['ref'] else None}
        groups[key] = group
        for e in run: e['call_group'] = key
        if group['anchor_ref']: previous['call_summary'] = key
    for event in events:
        turns[event['turn']].append(event)
        if event['kind'] in ('tool', 'subtool'):
            if run and run[-1]['turn'] != event['turn']:
                finish(); run = []; previous = None
            run.append(event)
        else:
            finish(); run = []; previous = event
    finish()
    summaries = {}
    for turn, records in turns.items():
        anchor = next((e for e in records if e['kind'] == 'user'), records[0])
        remaining = [e for e in records if e['position'] > anchor['position']]
        summaries[str(turn)] = {'anchor_ref': anchor['ref'], 'anchor_position': anchor['position'], 'first_position': records[0]['position'],
                               'last_position': records[-1]['position'],
                               'steps': len({e['step'] for e in remaining if e.get('step') is not None and e['kind'] in ('assistant', 'tool')}) if any(e.get('step') is not None for e in remaining) else sum(e['kind'] in ('assistant', 'tool') or e['kind'] == 'context' and e['name'] == '执行记录' for e in remaining),
                               'calls': sum(e['kind'] in ('tool', 'subtool') for e in remaining),
                               'remaining': len(remaining)}
    recorded_steps = {(e['turn'], e['step']) for e in events if e.get('step') is not None and e['kind'] in ('assistant', 'tool')}
    return {'active_duration_ms': total, 'timeline_count': sequence, 'step_count': len(recorded_steps) if recorded_steps else None,
            'turn_summaries': summaries, 'call_groups': groups}


def focus(events, start, end, mode):
    projection = layout(events)
    matches = []
    for event in events:
        if event.get('request_only'): continue
        lo = event['timeline_start'] if mode == 'duration' else event['timeline_position']/max(1, projection['timeline_count'])
        hi = event['timeline_end'] if mode == 'duration' else (event['timeline_position']+1)/max(1, projection['timeline_count'])
        if lo <= end and hi >= start: matches.append(event)
    metadata = lambda e: {'ref': e['ref'], 'position': e['position']}
    return {'count': len(matches), 'span': matches[-1]['position']-matches[0]['position']+1 if matches else 0,
            'first': metadata(matches[0]) if matches else None,
            'middle': metadata(matches[(len(matches)-1)//2]) if matches else None}
