import { CircleHelp } from 'lucide-react';
import { IconButton } from './primitives';
import { guideStore } from '../state/guide-store';

export function GuideButton() {
  return (
    <IconButton
      className="guide-trigger"
      icon={<CircleHelp size={16} strokeWidth={1.6} />}
      label="帮助与引导"
      onClick={guideStore.help}
    />
  );
}
