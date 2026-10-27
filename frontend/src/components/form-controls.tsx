import type {
  FormEventHandler,
  InputHTMLAttributes,
  ReactNode,
  Ref,
} from 'react';
import { Dialog, IconButton } from './primitives';

export function TextInput({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input className={`form-input ${className}`} {...props} />;
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

export function EditorDialog({
  title,
  description,
  busy,
  onClose,
  onSubmit,
  footer,
  children,
}: {
  title: string;
  description?: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      title={title}
      className="editor-dialog"
      onClose={() => !busy && onClose()}
    >
      <form onSubmit={onSubmit}>
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
        <div className="editor-dialog-body">
          <fieldset className="editor-dialog-fields" disabled={busy}>
            {children}
          </fieldset>
        </div>
        <footer className="editor-dialog-footer">{footer}</footer>
      </form>
    </Dialog>
  );
}
