import { useState } from 'react';
import { Button, ContentDialog, Panel, toast } from '../components/ui';

export function ToastPreview() {
  const [dialog, setDialog] = useState(false);
  return (
    <Panel title="Toast 提示">
      <div className="ui-actions">
        <Button onClick={() => toast('已复制文件地址。', { tone: 'success' })}>
          成功提示
        </Button>
        <Button onClick={() => toast('请先选择一个账号。')}>普通提示</Button>
        <Button
          onClick={() =>
            toast('本机系统代理已关闭，Clash 设置仍为开启。', {
              tone: 'warning',
            })
          }
        >
          警告提示
        </Button>
        <Button
          onClick={() =>
            toast('连接超时，请重试。', {
              tone: 'error',
              action: {
                label: '重试',
                onClick: () => toast('连接已恢复。', { tone: 'success' }),
              },
            })
          }
        >
          错误提示
        </Button>
        <Button onClick={() => setDialog(true)}>弹窗内提示</Button>
      </div>
      {dialog && (
        <ContentDialog
          title="弹窗内的 Toast"
          onClose={() => setDialog(false)}
          footer={<Button onClick={() => setDialog(false)}>关闭</Button>}
        >
          <Button
            onClick={() =>
              toast('保存失败，请重试。', {
                tone: 'error',
                action: {
                  label: '重试保存',
                  onClick: () => toast('保存完成。', { tone: 'success' }),
                },
              })
            }
          >
            显示提示
          </Button>
        </ContentDialog>
      )}
    </Panel>
  );
}
