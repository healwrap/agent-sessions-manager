import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';

export function Tooltip({
  label,
  children,
}: {
  label?: string;
  children: ReactElement<{ 'data-tooltip'?: string }>;
}) {
  return cloneElement(children, { 'data-tooltip': label || undefined });
}

interface Hint {
  anchor: HTMLElement;
  label: string;
}

function TooltipBubble({
  hint,
  id,
  onClose,
}: {
  hint: Hint;
  id: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const bubble = ref.current!;
    const anchor = hint.anchor;
    bubble.showPopover();
    const fit = () => {
      if (!anchor.isConnected || !anchor.getClientRects().length) {
        onClose();
        return;
      }
      const box = anchor.getBoundingClientRect();
      const { width, height } = bubble.getBoundingClientRect();
      const above =
        box.bottom + 8 + height > window.innerHeight - 12 &&
        box.top - 8 - height >= 12;
      bubble.style.left = `${Math.max(12, Math.min(box.left + box.width / 2 - width / 2, window.innerWidth - width - 12))}px`;
      bubble.style.top = `${Math.max(12, Math.min(above ? box.top - height - 8 : box.bottom + 8, window.innerHeight - height - 12))}px`;
      bubble.style.visibility = 'visible';
    };
    const describe = () => {
      const ids = (anchor.getAttribute('aria-describedby') || '')
        .split(/\s+/)
        .filter((value) => value && value !== id);
      return ids;
    };
    anchor.setAttribute('aria-describedby', [...describe(), id].join(' '));
    const observer = new ResizeObserver(fit);
    observer.observe(bubble);
    observer.observe(anchor);
    fit();
    window.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
      const ids = describe();
      if (ids.length) anchor.setAttribute('aria-describedby', ids.join(' '));
      else anchor.removeAttribute('aria-describedby');
    };
  }, [hint, id, onClose]);
  return createPortal(
    <span
      ref={ref}
      id={id}
      className="app-tooltip"
      role="tooltip"
      popover="manual"
      style={{ visibility: 'hidden' }}
    >
      {hint.label}
    </span>,
    hint.anchor.closest('dialog[open]') || document.body,
  );
}

// Controls share one hover/focus surface. Data attributes also cover disabled
// buttons and clipped text without inserting layout wrappers around anchors.
export function TooltipLayer() {
  const id = useId();
  const [hint, setHint] = useState<Hint | null>(null);
  const close = useRef(() => {});
  const dismissTip = useCallback(() => close.current(), []);
  useEffect(() => {
    let target: HTMLElement | null = null;
    let timer: number | undefined;
    let shown = false;
    const dismiss = () => {
      window.clearTimeout(timer);
      target = null;
      shown = false;
      setHint(null);
    };
    close.current = dismiss;
    const anchorAt = (node: EventTarget | null) =>
      node instanceof Element
        ? node.closest<HTMLElement>('[data-tooltip]')
        : null;
    const show = (anchor: HTMLElement, delay: number) => {
      if (target === anchor && (shown || delay > 0)) return;
      dismiss();
      const label = anchor.dataset.tooltip;
      if (!label) return;
      target = anchor;
      timer = window.setTimeout(() => {
        if (!anchor.isConnected) return;
        shown = true;
        setHint({ anchor, label });
      }, delay);
    };
    const enter = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const anchor = anchorAt(event.target);
      if (anchor) show(anchor, 350);
    };
    const leave = (event: PointerEvent) => {
      if (!target || anchorAt(event.target) !== target) return;
      if (
        event.relatedTarget instanceof Node &&
        target.contains(event.relatedTarget)
      )
        return;
      if (target === document.activeElement && target.matches(':focus-visible'))
        return;
      dismiss();
    };
    const focus = (event: FocusEvent) => {
      const anchor = anchorAt(event.target);
      if (anchor?.matches(':focus-visible')) show(anchor, 0);
    };
    const blur = (event: FocusEvent) => {
      if (anchorAt(event.target) === target) dismiss();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key !== 'Tab') return;
      if (event.key === 'Escape' && shown) {
        event.preventDefault();
        event.stopPropagation();
      }
      dismiss();
    };
    document.addEventListener('pointerover', enter, true);
    document.addEventListener('pointerout', leave, true);
    document.addEventListener('focusin', focus, true);
    document.addEventListener('focusout', blur, true);
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', key, true);
    document.addEventListener('scroll', dismiss, true);
    window.addEventListener('blur', dismiss);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerover', enter, true);
      document.removeEventListener('pointerout', leave, true);
      document.removeEventListener('focusin', focus, true);
      document.removeEventListener('focusout', blur, true);
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('blur', dismiss);
    };
  }, []);
  return hint ? (
    <TooltipBubble hint={hint} id={id} onClose={dismissTip} />
  ) : null;
}
