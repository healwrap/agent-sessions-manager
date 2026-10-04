import { sessionStore } from '../state/session-store';
export function HistoryLoadRow({
  direction,
  loading,
  active,
}: {
  direction: 'before' | 'after';
  loading: boolean;
  active: boolean;
}) {
  return (
    <tr data-history-load="true">
      <td colSpan={2}>
        <button
          type="button"
          disabled={loading}
          onClick={() => void sessionStore.loadTrace(false, direction)}
        >
          {active ? (
            <span className="history-load-status" role="status">
              <i className="loading-dot" aria-hidden="true" />
              正在读取历史记录…
            </span>
          ) : direction === 'before' ? (
            '加载更早记录'
          ) : (
            '加载后续记录'
          )}
        </button>
      </td>
    </tr>
  );
}
