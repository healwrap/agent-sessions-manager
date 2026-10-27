import { IconButton } from '../primitives';

export function SettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton
      icon="settings"
      label="设置"
      className="settings-trigger"
      aria-haspopup="dialog"
      onClick={onClick}
    />
  );
}
