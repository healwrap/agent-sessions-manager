import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { Button } from './ui';

export function ProxyFileButton({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".yaml,.yml,.json,.txt"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onSelect(file);
          event.target.value = '';
        }}
      />
      <Button disabled={disabled} onClick={() => input.current?.click()}>
        <Upload size={16} />
        导入配置文件
      </Button>
    </>
  );
}
