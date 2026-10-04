import { useState } from 'react';

// Preserve disclosure choices when returning to a session, without writing histories.
const choices = new Map<string, boolean>();
export function useDisclosure(key: string, initial = false) {
  const [open, setOpen] = useState(() => choices.get(key) ?? initial);
  const toggle = () =>
    setOpen((value) => {
      if (choices.size >= 500) choices.delete(choices.keys().next().value!);
      choices.set(key, !value);
      return !value;
    });
  return [open, toggle] as const;
}
