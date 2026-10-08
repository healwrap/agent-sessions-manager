import { useLayoutEffect, useRef, useState } from 'react';
import { sessionStore, type AppState } from '../state/session-store';
import type { Session } from '../lib/types';
import { sessionTitle } from '../lib/selectors';
import { copyContextReference } from '../lib/context-reference';
import { Dialog, Icon } from './primitives';
export interface SessionMenu {
  item: Session;
  x: number;
  y: number;
}
export function SessionActions({
  state,
  menu,
  onClose,
}: {
  state: AppState;
  menu: SessionMenu | null;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<{
      item: Session;
      kind: 'rename' | 'project';
    } | null>(null),
    [value, setValue] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!menu) return;
    const popup = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const place = () => {
      popup.style.left = `${Math.max(12, Math.min(menu.x, window.innerWidth - popup.offsetWidth - 12))}px`;
      popup.style.top = `${Math.max(12, Math.min(menu.y, window.innerHeight - popup.offsetHeight - 12))}px`;
    };
    const click = (e: PointerEvent) => {
        if (!ref.current?.contains(e.target as Node)) onClose();
      },
      key = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        } else if (
          popup.contains(document.activeElement) &&
          ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)
        ) {
          e.preventDefault();
          const buttons = Array.from(popup.querySelectorAll('button'));
          const current = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const index =
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? buttons.length - 1
                : (current + (e.key === 'ArrowUp' ? -1 : 1) + buttons.length) %
                  buttons.length;
          buttons[index]?.focus({ preventScroll: true });
        }
      };
    place();
    window.addEventListener('resize', place);
    document.addEventListener('pointerdown', click);
    document.addEventListener('keydown', key);
    ref.current?.querySelector('button')?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('pointerdown', click);
      document.removeEventListener('keydown', key);
      if (popup.contains(document.activeElement) && previous?.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, [menu, onClose]);
  const edit = (kind: 'rename' | 'project') => {
    setEditing({ item: menu!.item, kind });
    setValue(
      kind === 'rename'
        ? sessionTitle(menu!.item, state.preferences)
        : menu!.item.project_id,
    );
    onClose();
  };
  const copyContext = async (id: string) => {
    try {
      await copyContextReference(id);
      sessionStore.notify('已复制整个会话的上下文引用。');
    } catch (error) {
      sessionStore.notify(String(error));
    }
  };
  return (
    <>
      {menu && (
        <div
          ref={ref}
          className="session-menu"
          role="menu"
          aria-label="会话操作"
          style={{
            left: Math.min(menu.x, window.innerWidth - 210),
            top: Math.min(menu.y, window.innerHeight - 190),
          }}
        >
          {[
            [
              'pin',
              state.preferences.pinned.includes(menu.item.id)
                ? '取消置顶'
                : '置顶',
              () => void sessionStore.togglePreference(menu.item, 'pinned'),
            ],
            ['edit', '重命名', () => edit('rename')],
            ['folder', '移动到项目', () => edit('project')],
            ['copy', '复制上下文引用', () => void copyContext(menu.item.id)],
            [
              'archive',
              state.preferences.archived.includes(menu.item.id)
                ? '取消归档'
                : '归档',
              () => void sessionStore.togglePreference(menu.item, 'archived'),
            ],
          ].map(([icon, label, action]) => (
            <button
              key={String(icon)}
              role="menuitem"
              onClick={() => {
                (action as () => void)();
                onClose();
              }}
            >
              <Icon name={String(icon)} />
              {String(label)}
            </button>
          ))}
        </div>
      )}
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        id={editing?.kind === 'project' ? 'project-dialog' : 'rename-dialog'}
        title={editing?.kind === 'project' ? '移动到项目' : '重命名会话'}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!editing) return;
            void (
              editing.kind === 'rename'
                ? sessionStore.rename(editing.item, value)
                : sessionStore.moveProject(
                    editing.item,
                    state.projects.find((p) => p.project_id === value),
                  )
            ).then(() => setEditing(null));
          }}
        >
          <h2>{editing?.kind === 'project' ? '移动到项目' : '重命名会话'}</h2>
          {editing?.kind === 'project' ? (
            <select
              aria-label="目标项目"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            >
              <option value="">恢复原始项目</option>
              {state.projects.map((project) => (
                <option key={project.project_id} value={project.project_id}>
                  {project.project_label} · {project.project_path}
                </option>
              ))}
            </select>
          ) : (
            <input
              required
              maxLength={200}
              aria-label="会话名称"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
          <div className="rename-actions">
            <button type="button" onClick={() => setEditing(null)}>
              取消
            </button>
            <button>保存</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
