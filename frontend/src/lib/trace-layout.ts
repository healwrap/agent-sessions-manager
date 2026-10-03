import type { Event } from './types';
import type { SummaryRow } from './selectors';
import { recordType } from './record-presentation';

export function requestBoundaryLayout(
  overview: Event[],
  rows: (Event | SummaryRow)[],
) {
  const boundaries = new Map<number, string>();
  for (const event of overview) {
    if (
      event.request_number == null ||
      boundaries.has(event.request_number) ||
      (['user', 'context'].includes(event.kind) &&
        recordType(event) !== 'compaction')
    )
      continue;
    boundaries.set(event.request_number, event.ref);
  }
  const offsets = new Map<string, number>();
  let runLength = 0;
  for (const event of rows) {
    if ('summaryType' in event) {
      runLength = 0;
      continue;
    }
    if (event.request_only) offsets.set(event.ref, runLength++ * 8);
    else {
      if (
        runLength &&
        event.request_number != null &&
        boundaries.get(event.request_number) === event.ref
      )
        offsets.set(event.ref, runLength * 8);
      runLength = 0;
    }
  }
  return { boundaries, offsets };
}
