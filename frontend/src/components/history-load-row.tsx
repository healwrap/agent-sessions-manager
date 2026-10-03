import { sessionStore } from '../state/session-store';
export function HistoryLoadRow({
  direction,
  loading,
}: {
  direction: 'before' | 'after';
  loading: boolean;
}) {
  return (
    <tr data-history-load="true">
      <td colSpan={2}>
        <button
          type="button"
          disabled={loading}
          onClick={() => void sessionStore.loadTrace(false, direction)}
        >
          {loading
            ? '正在读取历史记录…'
            : direction === 'before'
              ? '加载更早记录'
              : '加载后续记录'}
        </button>
      </td>
    </tr>
  );
}
