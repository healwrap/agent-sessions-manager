import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Collapse } from './primitives';

export function Disclosure({
  title,
  children,
  open,
  scrollToEndOnOpen = false,
  className = '',
}: {
  title: ReactNode;
  children: ReactNode;
  open?: boolean;
  scrollToEndOnOpen?: boolean;
  className?: string;
}) {
  const id = useId();
  const section = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(!!open);
  useEffect(() => {
    if (open !== undefined) setExpanded(open);
  }, [open]);
  useEffect(() => {
    if (!expanded || !scrollToEndOnOpen || !section.current) return;
    const element = section.current;
    let parent = element.parentElement;
    while (
      parent &&
      !['auto', 'scroll'].includes(getComputedStyle(parent).overflowY)
    )
      parent = parent.parentElement;
    if (!parent) return;
    const container = parent;
    const collapse = element.querySelector<HTMLElement>(
      '.disclosure-collapse',
    )!;
    const reveal = () => {
      container.scrollTop = container.scrollHeight;
    };
    const frame = requestAnimationFrame(reveal);
    const animating = getComputedStyle(collapse)
      .transitionDuration.split(',')
      .some((value) => parseFloat(value) > 0);
    if (!animating) return () => cancelAnimationFrame(frame);
    const observer = new ResizeObserver(reveal);
    observer.observe(collapse);
    const complete = (event: TransitionEvent) => {
      if (
        event.target !== collapse ||
        event.propertyName !== 'grid-template-rows'
      )
        return;
      reveal();
      observer.disconnect();
    };
    collapse.addEventListener('transitionend', complete);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      collapse.removeEventListener('transitionend', complete);
    };
  }, [expanded, scrollToEndOnOpen]);
  return (
    <section
      ref={section}
      className={`disclosure ${className}`}
      data-open={expanded}
    >
      <button
        className="disclosure-trigger"
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((value) => !value)}
      >
        <ChevronRight size={16} aria-hidden="true" />
        <span>{title}</span>
      </button>
      <Collapse open={expanded} animateHeight className="disclosure-collapse">
        <div id={id} className="disclosure-content">
          {children}
        </div>
      </Collapse>
    </section>
  );
}
