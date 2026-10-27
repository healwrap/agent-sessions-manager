import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { MenuItem, MenuSurface } from './menu-surface';

export interface SelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

// DSH Menu / PermissionSelect styling with a controlled, single-value listbox.
// The popover top layer keeps the menu clear of sidebar and dialog clipping.
export function Select({
  value,
  options,
  onChange,
  label,
  id: triggerId,
  disabled = false,
}: {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  label: string;
  id?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef({ text: '', time: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.findIndex((option) => option.value === value);
  const enabled = !disabled && options.length > 0;

  useLayoutEffect(() => {
    if (!open || !enabled) return;
    const popup = menu.current!;
    popup.showPopover();
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect();
      const margin = 12;
      const below = window.innerHeight - rect.bottom - margin - 4;
      const above = rect.top - margin - 4;
      const upwards =
        below < Math.min(popup.scrollHeight, 240) && above > below;
      const width = Math.min(
        Math.max(rect.width, 180),
        window.innerWidth - margin * 2,
      );
      popup.style.width = `${width}px`;
      popup.style.maxHeight = `${Math.max(34, Math.min(320, upwards ? above : below))}px`;
      popup.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))}px`;
      popup.style.top = `${Math.max(margin, upwards ? rect.top - popup.offsetHeight - 4 : rect.bottom + 4)}px`;
    };
    const dismiss = (event: Event) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !popup.contains(target))
        setOpen(false);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(trigger.current!);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('focusin', dismiss);
      if (popup.matches(':popover-open')) popup.hidePopover();
    };
  }, [open, enabled, options.length]);

  useLayoutEffect(() => {
    if (open)
      menu.current
        ?.querySelectorAll('[role="option"]')
        [active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const show = (index = Math.max(0, selected)) => {
    trigger.current?.focus({ preventScroll: true });
    search.current = { text: '', time: 0 };
    setActive(index);
    setOpen(true);
  };
  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
    if (option.value !== value) onChange(option.value);
  };
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.nativeEvent.isComposing || !enabled) return;
    const key = event.key;
    if (key === 'Tab') {
      setOpen(false);
      return;
    }
    if (key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      if (open) choose(active);
      else show();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
      event.preventDefault();
      const next =
        key === 'Home'
          ? 0
          : key === 'End'
            ? options.length - 1
            : (active + (key === 'ArrowDown' ? 1 : -1) + options.length) %
              options.length;
      if (open) setActive(next);
      else show(key === 'Home' || key === 'End' ? next : Math.max(0, selected));
    } else if (
      key.length === 1 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      const now = Date.now();
      const text =
        (now - search.current.time < 700 ? search.current.text : '') +
        key.toLocaleLowerCase();
      search.current = { text, time: now };
      const prefix = Array.from(text).every((letter) => letter === text[0])
        ? text[0]
        : text;
      const start = open ? active : Math.max(0, selected);
      const match = options
        .map((_, index) => (start + index + 1) % options.length)
        .find((index) =>
          options[index].label.toLocaleLowerCase().startsWith(prefix),
        );
      if (!open) show(match ?? start);
      else if (match !== undefined) setActive(match);
    }
  };

  return (
    <div className="custom-select">
      <button
        id={triggerId}
        ref={trigger}
        type="button"
        className="select-trigger"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open && enabled}
        aria-controls={open && enabled ? id : undefined}
        aria-activedescendant={open && enabled ? `${id}-${active}` : undefined}
        disabled={!enabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={keyDown}
      >
        {options[selected]?.icon && (
          <span className="select-agent-icon" aria-hidden="true">
            {options[selected].icon}
          </span>
        )}
        <span className="select-label">
          {options[selected]?.label || value}
        </span>
        <ChevronDown className="select-chevron" size={12} aria-hidden="true" />
      </button>
      <MenuSurface
        ref={menu}
        id={id}
        popover="manual"
        role="listbox"
        aria-label={label}
        className="select-menu"
      >
        {options.map((option, index) => (
          <MenuItem
            key={option.value}
            id={`${id}-${index}`}
            role="option"
            tabIndex={-1}
            aria-selected={option.value === value}
            data-active={open && active === index}
            title={option.label}
            icon={option.icon}
            onPointerMove={() => setActive(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(index)}
            trailing={
              <span className="select-check" aria-hidden="true">
                {option.value === value && <Check size={14} />}
              </span>
            }
          >
            {option.label}
          </MenuItem>
        ))}
      </MenuSurface>
    </div>
  );
}
