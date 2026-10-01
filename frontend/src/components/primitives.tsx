import {
  useEffect,
  useRef,
  type ReactNode,
  type ButtonHTMLAttributes,
} from 'react';
export function Icon({
  name,
  className = '',
}: {
  name: string;
  className?: string;
}) {
  return (
    <svg className={'dsh-icon ' + className} aria-hidden="true">
      <use href={'/icons.svg#' + name} />
    </svg>
  );
}
export function IconButton({
  icon,
  label,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string }) {
  return (
    <button
      type="button"
      className="icon-button"
      title={label}
      aria-label={label}
      {...props}
    >
      <Icon name={icon} />
    </button>
  );
}
export function Collapse({
  open,
  children,
  className = '',
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        'grid transition-[grid-template-rows,opacity] duration-200 ' + className
      }
      style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
      inert={!open}
      aria-hidden={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
export function Dialog({
  open,
  onClose,
  children,
  id,
  title,
  className = '',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  id?: string;
  title: string;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      id={id}
      aria-label={title}
      className={className}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      {children}
    </dialog>
  );
}
