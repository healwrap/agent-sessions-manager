import { useCallback, useEffect, useRef, useState } from 'react';
import type { Settings, SettingsResponse } from '../lib/types';
import { sessionStore } from '../state/session-store';

export function useSettingsAutosave(open: boolean) {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<
    'idle' | 'waiting' | 'saving' | 'saved' | 'error'
  >('idle');
  const pending = useRef<Settings | null>(null);
  const saved = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef<Promise<boolean> | null>(null);

  const flush = useCallback((): Promise<boolean> => {
    clearTimeout(timer.current);
    if (inFlight.current) return inFlight.current;
    if (!pending.current) return Promise.resolve(true);
    const save = async () => {
      while (pending.current) {
        const value = pending.current;
        pending.current = null;
        setStatus('saving');
        try {
          const result = await sessionStore.saveSettings(value);
          saved.current = JSON.stringify(value);
          setData(
            (previous) =>
              previous && { ...previous, value, sources: result.sources },
          );
          setError('');
        } catch (reason) {
          if (pending.current) continue;
          pending.current = value;
          setError(String(reason));
          setStatus('error');
          return false;
        }
      }
      setStatus('saved');
      return true;
    };
    const request = save();
    inFlight.current = request;
    void request.finally(() => {
      inFlight.current = null;
    });
    return request;
  }, []);

  useEffect(() => {
    if (!open) return;
    let current = true;
    // Keep an unsaved draft after a failed save, including across closing/reopening.
    if (!pending.current && !inFlight.current) {
      setError('');
      void sessionStore
        .api<SettingsResponse>('/api/settings')
        .then((value) => {
          if (!current || pending.current || inFlight.current) return;
          saved.current = JSON.stringify(value.value);
          setData(value);
          setDraft(structuredClone(value.value));
          setStatus('idle');
        })
        .catch((reason) => current && setError(String(reason)));
    }
    return () => {
      current = false;
    };
  }, [open]);

  useEffect(
    () => () => {
      void flush();
    },
    [flush],
  );

  const change = (value: Settings) => {
    setDraft(value);
    setError('');
    sessionStore.update({ themePreview: value.theme });
    clearTimeout(timer.current);
    if (!inFlight.current && JSON.stringify(value) === saved.current) {
      pending.current = null;
      setStatus('saved');
      return;
    }
    pending.current = value;
    setStatus('waiting');
    timer.current = setTimeout(() => {
      void flush();
    }, 650);
  };

  const close = () => {
    sessionStore.update({ settingsOpen: false });
    void flush().then((ok) => {
      if (ok && !sessionStore.state.settingsOpen)
        sessionStore.update({ themePreview: null });
      else if (!ok)
        sessionStore.notify('设置尚未保存，请重新打开设置查看错误。', {
          tone: 'error',
        });
    });
  };

  return { data, draft, error, status, change, close, flush };
}
