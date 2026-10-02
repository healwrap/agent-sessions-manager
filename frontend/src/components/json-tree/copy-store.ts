// Adapted from DeepSeek Harness JsonTree (MIT); see frontend/public/harness-license.txt.
import type { CopySnapshot } from './types';
export function createCopyStore() {
  let current: CopySnapshot | undefined;
  const listeners = new Map<string, Set<() => void>>();
  return {
    get: () => current,
    set(next: CopySnapshot | undefined) {
      const previous = current?.id;
      current = next;
      for (const id of new Set([previous, next?.id])) {
        if (id === undefined) continue;
        for (const listener of listeners.get(id) ?? []) listener();
      }
    },
    subscribe(id: string, listener: () => void) {
      let row = listeners.get(id);
      if (row === undefined) listeners.set(id, (row = new Set()));
      row.add(listener);
      return () => {
        row.delete(listener);
        if (row.size === 0) listeners.delete(id);
      };
    },
  };
}
