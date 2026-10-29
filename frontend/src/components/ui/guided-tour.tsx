import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { driver, type Driver } from 'driver.js';
import { X } from 'lucide-react';
import { Button, IconButton } from '../primitives';
import 'driver.js/dist/driver.css';
import '../../styles/dsh/tour.css';

export interface GuidedStep {
  id: string;
  selector: string;
  title: string;
  chapter: string;
  body: ReactNode;
  continueLabel?: string;
  onContinue?: () => void;
  continueDisabled?: boolean;
}
export function GuidedTour({
  step,
  animations = true,
  onPause,
  onReveal,
}: {
  step: GuidedStep | null;
  animations?: boolean;
  onPause: () => void;
  onReveal?: () => void;
}) {
  const instance = useRef<Driver | null>(null);
  const callbacks = useRef({ onPause });
  callbacks.current = { onPause };
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!step) return;
    let disposed = false;
    let target: HTMLElement | null = null;
    let timeout: number | undefined;
    setMissing(false);
    const tour = driver({
      animate:
        animations && !matchMedia('(prefers-reduced-motion: reduce)').matches,
      duration: 160,
      stagePadding: 6,
      stageRadius: 12,
      popoverOffset: 12,
      overlayColor: getComputedStyle(document.body)
        .getPropertyValue('--dsw-alias-bg-mask-1')
        .trim(),
      overlayOpacity: 1,
      overlayClickBehavior: 'none',
      allowClose: false,
      popoverClass: 'ui-guide-popover',
      showButtons: [],
      onHighlighted() {
        // 等待高亮动画结束，再按 React 内容的实际尺寸定位。
        window.requestAnimationFrame(() => {
          if (!disposed) instance.current?.refresh();
        });
      },
      onPopoverRender(dom) {
        dom.title.hidden = dom.description.hidden = dom.footer.hidden = true;
        dom.closeButton.hidden = dom.arrow.hidden = true;
        dom.wrapper.setAttribute('aria-labelledby', 'ui-guide-title');
        dom.wrapper.removeAttribute('aria-describedby');
        const mount = document.createElement('div');
        dom.wrapper.append(mount);
        setContainer(mount);
      },
    });
    instance.current = tour;
    const targetSize = new ResizeObserver(() => tour.refresh());
    const locate = () => {
      const found = Array.from(
        document.querySelectorAll<HTMLElement>(step.selector),
      ).find(
        (item) =>
          item.getClientRects().length &&
          !item.closest('[hidden], [inert]') &&
          getComputedStyle(item).visibility !== 'hidden',
      );
      const modal = Array.from(
        document.querySelectorAll<HTMLDialogElement>('dialog[open]'),
      ).at(-1);
      if (!found || (modal && !modal.contains(found))) {
        if (tour.isActive()) {
          tour.destroy();
          setContainer(null);
        }
        targetSize.disconnect();
        target = null;
        timeout ??= window.setTimeout(() => {
          if (!disposed && !target) setMissing(true);
        }, 6000);
        return;
      }
      if (target === found && tour.isActive()) {
        tour.refresh();
        return;
      }
      target = found;
      clearTimeout(timeout);
      timeout = undefined;
      targetSize.disconnect();
      targetSize.observe(found);
      setMissing(false);
      tour.highlight({
        element: found,
        popover: { side: 'bottom', align: 'start' },
      });
    };
    const observer = new MutationObserver(locate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'hidden', 'inert'],
    });
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      callbacks.current.onPause();
    };
    const refresh = () => tour.isActive() && tour.refresh();
    document.addEventListener('keydown', escape, true);
    document.addEventListener('scroll', refresh, true);
    locate();
    return () => {
      disposed = true;
      observer.disconnect();
      targetSize.disconnect();
      clearTimeout(timeout);
      document.removeEventListener('keydown', escape, true);
      document.removeEventListener('scroll', refresh, true);
      tour.destroy();
      instance.current = null;
      setContainer(null);
    };
  }, [step?.id, step?.selector, animations]);
  useLayoutEffect(() => {
    if (!container) return;
    const observer = new ResizeObserver(() => instance.current?.refresh());
    observer.observe(container);
    instance.current?.refresh();
    return () => observer.disconnect();
  }, [container]);
  if (!step) return null;
  return (
    <>
      {container &&
        createPortal(
          <section className="ui-guide-content" aria-live="polite">
            <header>
              <span>{step.chapter}</span>
              <IconButton
                icon={<X size={17} />}
                label="退出引导"
                onClick={onPause}
              />
            </header>
            <h2 id="ui-guide-title">{step.title}</h2>
            <div className="ui-guide-description">{step.body}</div>
            {step.onContinue && (
              <footer>
                <Button
                  variant="primary"
                  onClick={step.onContinue}
                  disabled={step.continueDisabled}
                >
                  {step.continueLabel || '继续'}
                </Button>
              </footer>
            )}
          </section>,
          container,
        )}
      {missing &&
        createPortal(
          <aside className="ui-guide-waiting" role="status">
            <span>当前步骤尚未打开：{step.title}</span>
            <Button onClick={onReveal}>返回此步骤</Button>
            <Button variant="ghost" onClick={onPause}>
              暂停引导
            </Button>
          </aside>,
          document.querySelector('dialog[open]') || document.body,
        )}
    </>
  );
}
