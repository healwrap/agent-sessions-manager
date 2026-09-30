"""Idle compression, overlapping execution and full-ledger summary regression."""
from trajectory_layout import layout, focus


def event(ref, position, time, duration=0, kind='tool', turn=1):
    return dict(ref=ref, position=position, timestamp=time, duration_ms=duration,
                kind=kind, turn=turn, name='exec' if kind == 'tool' else kind)


events = [event('U', 0, '2026-01-01T00:00:00Z', kind='user'),
          event('A', 1, '2026-01-01T00:00:01Z', kind='assistant'),
          event('C1', 2, '2026-01-01T00:00:02Z', 10000),
          event('C2', 3, '2026-01-01T00:00:04Z', 4000),
          event('U2', 4, '2026-01-03T00:00:00Z', kind='user', turn=2),
          event('C3', 5, '2026-01-03T00:00:01Z', 5000, turn=2)]
meta = layout(events)
assert meta['active_duration_ms'] == 15000  # Union, not sum; two days idle removed.
assert events[2]['timeline_start'] == 0 and events[2]['timeline_end'] == 2/3
assert events[3]['timeline_start'] == 2/15 and events[3]['timeline_end'] == 6/15
assert focus(events, .3, .31, 'duration')['first']['ref'] == 'C1'  # Interior of span.
assert meta['call_groups']['A']['count'] == 2
assert meta['turn_summaries']['1']['steps'] == 3
assert meta['turn_summaries']['1']['calls'] == 2
assert layout(events) == meta  # Live refresh never shifts the projection.
points = [event('x', 0, None), event('y', 1, '2026-01-01T00:00:00Z')]
assert layout(points)['active_duration_ms'] == 0
assert [e['timeline_start'] for e in points] == [0, 1]
print('trajectory layout self-test: ok')
