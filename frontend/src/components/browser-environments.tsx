import type {
  BrowserProfile,
  EnvironmentSettings,
} from '../lib/environment-settings';
import { KernelControl } from './kernel-control';
import { EnvironmentProfileList } from './environment-profile-list';
export function BrowserEnvironments({
  data,
  busy,
  onEdit,
  onDelete,
  onRuntime,
  onInstall,
}: {
  data: EnvironmentSettings;
  busy: boolean;
  loading: boolean;
  onEdit: (profile?: BrowserProfile) => void;
  onDelete: (id: string) => void;
  onRuntime: (action: 'open' | 'stop', body: { profile_id: string }) => void;
  onInstall: (action: 'check' | 'install') => void;
}) {
  return (
    <>
      <KernelControl kernel={data.browser.kernel} onInstall={onInstall} />
      <EnvironmentProfileList
        data={data}
        target="browser"
        busy={busy}
        onEdit={(profile) => onEdit(profile as BrowserProfile)}
        onDelete={onDelete}
        onRuntime={onRuntime}
      />
    </>
  );
}
