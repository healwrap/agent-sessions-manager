export function StartupContent({ sidebar = false }: { sidebar?: boolean }) {
  if (sidebar)
    return (
      <div className="startup-projects" aria-hidden="true">
        {[78, 58, 86, 64, 72, 52].map((width, index) => (
          <div className="startup-project" key={index}>
            <i className="skeleton-bar" />
            <span className="skeleton-bar" style={{ width: width + '%' }} />
          </div>
        ))}
      </div>
    );
  return (
    <section
      className="startup-content"
      aria-label="正在加载会话"
      role="status"
    >
      <div className="startup-message">
        <i className="skeleton-bar" />
        <span className="skeleton-bar" />
        <span className="skeleton-bar" />
        <span className="skeleton-bar" />
      </div>
      <div className="startup-message startup-user">
        <span className="skeleton-bar" />
      </div>
      <div className="startup-message">
        <i className="skeleton-bar" />
        <span className="skeleton-bar" />
        <span className="skeleton-bar" />
      </div>
      <p id="status">正在读取本地会话…</p>
    </section>
  );
}
