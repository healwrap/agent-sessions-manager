import { useEffect, useId, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Collapse } from './primitives';

export function Disclosure({
  title,
  children,
  open,
  className = '',
}: {
  title: ReactNode;
  children: ReactNode;
  open?: boolean;
  className?: string;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(!!open);
  useEffect(() => {
    if (open !== undefined) setExpanded(open);
  }, [open]);
  return (
    <section className={`disclosure ${className}`} data-open={expanded}>
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
