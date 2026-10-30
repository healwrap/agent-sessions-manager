import type {
  FormEventHandler,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  TextareaHTMLAttributes,
} from 'react';
import { useEffect, useRef } from 'react';
import { Dialog, IconButton } from './primitives';

export function TextInput({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <input className={`text-control form-input ${className}`} {...props} />
  );
}

export function TextArea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: Ref<HTMLTextAreaElement>;
}) {
  return (
    <textarea
      className={`text-control form-input form-textarea ${className}`}
      {...props}
    />
  );
}

export function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'error';
}) {
  return (
    <span className="status-badge" data-tone={tone}>
      {children}
    </span>
  );
}

export function ContentDialog({
  title,
  description,
  busy = false,
  onClose,
  onSubmit,
  footer,
  guide,
  children,
  className = '',
}: {
  title: string;
  description?: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  footer?: ReactNode;
  guide?: string;
  children: ReactNode;
  className?: string;
}) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const field =
      body.current?.querySelector<HTMLElement>('[data-dialog-autofocus]') ??
      body.current?.querySelector<HTMLElement>(
        'input:not(:disabled), textarea:not(:disabled), [role="combobox"]:not(:disabled)',
      );
    field?.focus({ preventScroll: true });
  }, []);
  const content = (
    <>
      <header className="editor-dialog-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <IconButton
          icon="close"
          label={`关闭${title}`}
          onClick={onClose}
          disabled={busy}
        />
      </header>
      <div ref={body} className="editor-dialog-body">
        {children}
      </div>
      {footer && <footer className="editor-dialog-footer">{footer}</footer>}
    </>
  );
  return (
    <Dialog
      open
      title={title}
      className={`editor-dialog ui-editor ${className}`}
      onClose={() => !busy && onClose()}
    >
      {onSubmit ? (
        <form onSubmit={onSubmit} data-guide={guide}>
          {content}
        </form>
      ) : (
        <div className="editor-dialog-frame" data-guide={guide}>
          {content}
        </div>
      )}
    </Dialog>
  );
}

export function EditorDialog({
  children,
  ...props
}: {
  title: string;
  description?: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  footer: ReactNode;
  guide?: string;
  children: ReactNode;
}) {
  return (
    <ContentDialog {...props}>
      <fieldset className="editor-dialog-fields" disabled={props.busy}>
        {children}
      </fieldset>
    </ContentDialog>
  );
}
