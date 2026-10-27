import { useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  Info,
  LoaderCircle,
  Trash2,
} from 'lucide-react';
import { Button, IconButton } from '../primitives';
import { EditorDialog } from '../form-controls';

export function EmptyState({
  icon,
  title,
  action,
  compact = false,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="ui-empty" data-compact={compact}>
      <span className="ui-empty-icon" aria-hidden="true">
        {icon}
      </span>
      <h3>{title}</h3>
      {action && <div className="ui-actions">{action}</div>}
    </div>
  );
}

export function Notice({
  children,
  tone = 'info',
  action,
}: {
  children: ReactNode;
  tone?: 'info' | 'success' | 'warning' | 'error';
  action?: ReactNode;
}) {
  const Symbol =
    tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : CircleAlert;
  return (
    <div
      className="ui-notice"
      data-tone={tone}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Symbol size={18} />
      <div>{children}</div>
      {action && <div className="ui-actions">{action}</div>}
    </div>
  );
}

export function BusyState({ label }: { label: string }) {
  return (
    <div className="ui-busy" role="status">
      <LoaderCircle className="ui-spin" size={19} />
      <span>{label}</span>
    </div>
  );
}

export function RemoveButton({
  label,
  message,
  disabled,
  onRemove,
}: {
  label: string;
  message: string;
  disabled?: boolean;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        label={label}
        icon={<Trash2 size={17} />}
        disabled={disabled}
        onClick={() => setOpen(true)}
      />
      {open && (
        <EditorDialog
          title={label}
          busy={!!disabled}
          onClose={() => setOpen(false)}
          onSubmit={(event) => {
            event.preventDefault();
            onRemove();
            setOpen(false);
          }}
          footer={
            <>
              <Button disabled={disabled} onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button
                type="submit"
                variant="outline"
                className="ui-danger"
                disabled={disabled}
              >
                确认移除
              </Button>
            </>
          }
        >
          <p className="ui-confirm-message">{message}</p>
        </EditorDialog>
      )}
    </>
  );
}
