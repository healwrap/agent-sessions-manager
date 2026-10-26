export function TrajectoryLoading({
  empty = false,
  label,
}: {
  empty?: boolean;
  label?: string;
}) {
  return (
    <div
      className={
        'trajectory-loading' + (empty ? ' trajectory-loading-empty' : '')
      }
    >
      <div className="history-load-status" role="status">
        <i className="loading-dot" aria-hidden="true" />
        {label ?? (empty ? '正在读取轨迹…' : '正在更新轨迹…')}
      </div>
      {empty && (
        <div className="trajectory-skeleton" aria-hidden="true">
          {[82, 64, 90, 72, 56, 85].map((width, index) => (
            <div className="trajectory-skeleton-row" key={index}>
              <i className="skeleton-bar" />
              <span className="skeleton-bar" style={{ width: width + '%' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
