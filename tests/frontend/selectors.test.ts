import { describe, it, expect } from 'vitest';
import {
  chatReplyRefs,
  sourceId,
  requestText,
  trajectoryRows,
  projectGroups,
} from '../../frontend/src/lib/selectors';
import type { Event, Session, Trajectory } from '../../frontend/src/lib/types';
const message = (
  ref: string,
  phase: string | null,
  extra: Partial<Event> = {},
) =>
  ({
    ref,
    phase,
    kind: 'assistant',
    turn: 1,
    turn_status: 'completed',
    preview: ref,
    ...extra,
  }) as Event;
const replies = (events: Event[], more = false) =>
  Array.from(chatReplyRefs(events, more));
describe('visible chat replies', () => {
  it('uses the latest unlabelled reply and excludes import markers', () =>
    expect(
      replies([
        message('process', null),
        message('reply', 'unknown'),
        message('import', null, { preview: '<EXTERNAL SESSION IMPORTED>' }),
      ]),
    ).toEqual(['reply']));
  it('prefers an explicit final answer', () =>
    expect(
      replies([message('legacy', null), message('final', 'final')]),
    ).toEqual(['final']));
  it('keeps commentary and ongoing turns in the process view', () => {
    expect(
      replies([message('working', null, { turn_status: 'in_progress' })]),
    ).toEqual([]);
    expect(replies([message('commentary', 'commentary')])).toEqual([]);
  });
  it('does not treat a page boundary as a final reply', () => {
    expect(replies([message('partial', null)], true)).toEqual([]);
    expect(
      replies(
        [message('first', null), message('second', null, { turn: 2 })],
        true,
      ),
    ).toEqual(['first']);
  });
  it('shows an interrupted visible reply', () =>
    expect(
      replies([message('stopped', null, { turn_status: 'aborted' })]),
    ).toEqual(['stopped']));
});
describe('provider and fold projection', () => {
  it('retains a server content match even when the title does not contain the query', () => {
    const item = {
      id: 'claude:local:project/session',
      title: '无关标题',
      search_query: '正文词',
      project_id: 'project',
      project_label: '项目',
      updated_at: '',
    } as Session;
    const preferences = {
      pinned: [],
      archived: [],
      aliases: {},
      metadata: {},
      projectAssignments: {},
    };
    expect(
      projectGroups([item], [], preferences, '', '正文词', false)[0].items,
    ).toEqual([item]);
    expect(
      projectGroups([item], [], preferences, '', '另一个词', false),
    ).toEqual([]);
  });
  it('keeps desktop and CLI separate', () => {
    expect(sourceId({ id: 'antigravity:desktop:same' } as Session)).toBe(
      'antigravity:desktop',
    );
    expect(sourceId({ id: 'antigravity:cli:same' } as Session)).toBe(
      'antigravity:cli',
    );
  });
  it('shows the original user text without request wrappers', () =>
    expect(
      requestText('<USER_REQUEST>原话</USER_REQUEST><ADDITIONAL_METADATA>meta'),
    ).toEqual({ text: '原话', wrapped: true }));
  it('uses the full ledger count when a loaded page ends inside a turn', () => {
    const events = [
      { ...message('U', null), kind: 'user', position: 0 },
      { ...message('A', null), position: 1 },
    ];
    const data = {
      turn_summaries: {
        1: { anchor_position: 0, remaining: 90, steps: 45, calls: 51 },
      },
      call_groups: {},
    } as unknown as Trajectory;
    const rows = trajectoryRows(
      events,
      data,
      '',
      true,
      new Set(),
      false,
      new Set(),
    );
    expect(rows).toHaveLength(2);
    expect(rows[1].preview).toBe('45 个步骤 · 51 个工具调用');
  });
});
