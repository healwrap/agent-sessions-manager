import { useEffect, useRef, useState } from 'react';
import { sessionStore, type AppState } from '../state/session-store';
import type { Session } from '../lib/types';
import { sessionTitle } from '../lib/selectors';
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
  useEffect(() => {
    if (!menu) return;
    const click = (e: PointerEvent) => {
        if (!ref.current?.contains(e.target as Node)) onClose();
      },
      key = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
    document.addEventListener('pointerdown', click);
    document.addEventListener('keydown', key);
    ref.current?.querySelector('button')?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('pointerdown', click);
      document.removeEventListener('keydown', key);
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
  return (
    <>
      {menu && (
        <div
          ref={ref}
          className="session-menu"
          role="menu"
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
