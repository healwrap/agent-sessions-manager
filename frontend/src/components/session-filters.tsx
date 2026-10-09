import { useId, useLayoutEffect, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { sessionStore } from '../state/session-store';
import { Icon } from './primitives';
import { MenuItem, MenuSurface } from './menu-surface';

export function SessionFilters({
  archive,
  showSubagents,
  disabled,
}: {
  archive: boolean;
  showSubagents: boolean;
  disabled: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const items = () =>
    Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('button'));
  const close = () => {
    menu.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  };
  const place = () => {
    const popup = menu.current!;
    const rect = trigger.current!.getBoundingClientRect();
    const width = Math.min(208, window.innerWidth - 24);
    popup.style.width = `${width}px`;
    popup.style.maxHeight = `${window.innerHeight - 24}px`;
    popup.style.left = `${Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))}px`;
    popup.style.top = `${Math.max(12, Math.min(rect.bottom + 4, window.innerHeight - popup.offsetHeight - 12))}px`;
  };
  const show = (last = false) => {
    menu.current!.showPopover();
    place();
    (last ? items().at(-1) : items()[0])?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (disabled) menu.current?.hidePopover();
    if (!open || disabled) return;
    const dismiss = (event: FocusEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target))
        menu.current?.hidePopover();
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('focusin', dismiss);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('focusin', dismiss);
    };
  }, [open, disabled]);
  const options = [
    {
      label: '当前会话',
      checked: !archive,
      role: 'menuitemradio',
      select: () => sessionStore.update({ archive: false }),
    },
    {
      label: '归档会话',
      checked: archive,
      role: 'menuitemradio',
      select: () => sessionStore.update({ archive: true }),
    },
    {
      label: '显示子代理会话',
      checked: showSubagents,
      role: 'menuitemcheckbox',
      select: () => void sessionStore.setShowSubagents(!showSubagents),
    },
  ];
  return (
    <div className="session-filters">
      <button
        ref={trigger}
        type="button"
        className="icon-button session-filter-trigger"
        title="筛选会话"
        aria-label="筛选会话"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        data-filtered={archive || !showSubagents}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault();
            show(event.key === 'ArrowUp');
          }
        }}
      >
        <SlidersHorizontal size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <MenuSurface
        ref={menu}
        id={id}
        popover="auto"
        role="menu"
        aria-label="会话筛选条件"
        className="select-menu session-filter-menu"
        onToggle={(event) => setOpen(event.newState === 'open')}
        onKeyDown={(event) => {
          if (event.key === 'Escape' || event.key === 'Tab') {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
            }
            close();
          } else if (
            ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
          ) {
            event.preventDefault();
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? options.length - 1
                  : (active +
                      (event.key === 'ArrowUp' ? -1 : 1) +
                      options.length) %
                    options.length;
            items()[next]?.focus({ preventScroll: true });
          }
        }}
      >
        {[
          { label: '会话范围', offset: 0, items: options.slice(0, 2) },
          { label: '显示内容', offset: 2, items: options.slice(2) },
        ].map((group) => (
          <div key={group.label} role="group" aria-label={group.label}>
            <div
              className={
                'session-filter-heading' +
                (group.offset ? ' session-filter-divider' : '')
              }
            >
              {group.label}
            </div>
            {group.items.map((option, index) => (
              <MenuItem
                key={option.label}
                role={option.role}
                aria-checked={option.checked}
                tabIndex={active === group.offset + index ? 0 : -1}
                onFocus={() => setActive(group.offset + index)}
                onClick={option.select}
                trailing={
                  <span className="select-check" aria-hidden="true">
                    {option.checked && <Icon name="check" />}
                  </span>
                }
              >
                {option.label}
              </MenuItem>
            ))}
          </div>
        ))}
      </MenuSurface>
    </div>
  );
}
