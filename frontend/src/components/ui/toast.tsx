import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, CircleAlert, Info } from 'lucide-react';
import { useSessionStore } from '../../hooks/use-session-store';
import { sessionStore } from '../../state/session-store';
import type { ToastOptions } from '../../state/model';

export type { ToastOptions } from '../../state/model';

export function toast(text: string, options: ToastOptions = {}) {
  sessionStore.notify(text, options);
  return sessionStore.state.toastSequence;
}

export function dismissToast(sequence: number) {
  if (sessionStore.state.toastSequence === sequence)
    sessionStore.update({ toast: '' });
}

function toastSurface() {
  const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
  return dialogs.item(dialogs.length - 1) || document.body;
}

// Adapted from DeepSeek Harness Toast, MIT; see public/harness-license.txt.
export function Toast({
  text,
  tone = 'info',
  holdMs = tone === 'warning' || tone === 'error' ? 5000 : 3000,
  action,
  onDone,
}: ToastOptions & { text: string; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [surface, setSurface] = useState(toastSurface);
  const done = useRef(onDone);
  useLayoutEffect(() => {
    done.current = onDone;
  }, [onDone]);
  useLayoutEffect(() => {
    // Modal dialogs make outside controls inert. Follow the active dialog so
    // toast actions work, and move back to the page when that dialog closes.
    const observer = new MutationObserver(() => setSurface(toastSurface()));
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    ref.current!.showPopover();
  }, [surface]);
  useEffect(() => {
    const timer = setTimeout(() => done.current(), holdMs + 1000);
    return () => clearTimeout(timer);
  }, [holdMs]);
  const Symbol =
    tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : CircleAlert;
  return createPortal(
    <div
      ref={ref}
      className="app-toast"
      popover="manual"
      data-tone={tone}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-atomic="true"
      style={{ '--dsh-toast-hold': `${holdMs}ms` } as CSSProperties}
    >
      <Symbol className="app-toast-icon" size={18} aria-hidden="true" />
      <span className="app-toast-text">
        {text}
        {action && (
          <button
            type="button"
            className="app-toast-action"
            onClick={() => {
              onDone();
              action.onClick();
            }}
          >
            {action.label}
          </button>
        )}
      </span>
    </div>,
    surface,
  );
}

export function ToastLayer() {
  const state = useSessionStore();
  return state.toast ? (
    <Toast
      key={state.toastSequence}
      text={state.toast}
      {...state.toastOptions}
      onDone={() => dismissToast(state.toastSequence)}
    />
  ) : null;
}
