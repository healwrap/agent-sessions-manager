import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
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
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: string | ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      title={label}
      aria-label={label}
      {...props}
    >
      {typeof icon === 'string' ? <Icon name={icon} /> : icon}
    </button>
  );
}
export function Button({
  children,
  icon,
  variant = 'secondary',
  className = '',
  type = 'button',
  size = 'normal',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: string;
  variant?: 'primary' | 'secondary' | 'text' | 'ghost' | 'outline' | 'toolbar';
  size?: 'normal' | 'small';
}) {
  return (
    <button
      type={type}
      className={'action-button ' + className}
      data-variant={variant}
      data-size={size}
      {...props}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}
export function Collapse({
  open,
  children,
  className = '',
  animateHeight,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
  animateHeight?: boolean;
}) {
  const content = useRef<HTMLDivElement>(null);
  const [heightMotion, setHeightMotion] = useState(true);
  useLayoutEffect(() => {
    if (open && content.current)
      setHeightMotion(animateHeight ?? content.current.scrollHeight <= 360);
  }, [open, animateHeight]);
  return (
    <div
      className={'content-collapse grid ' + className}
      data-height-motion={heightMotion}
      style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
      inert={!open}
      aria-hidden={!open}
    >
      <div ref={content} className="min-h-0 overflow-hidden">
        {children}
      </div>
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
