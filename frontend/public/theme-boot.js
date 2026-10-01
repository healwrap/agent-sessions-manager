// Run before the pre-rendered shell paints. Only a theme enum is cached.
(() => {
  const root = document.documentElement;
  let preference = root.dataset.themePreference;
  if (root.dataset.themeCanonical !== 'true') {
    try { preference = localStorage.getItem('agent-sessions-theme') || preference; } catch { /* Optional cache. */ }
  }
  if (!['light', 'dark', 'system'].includes(preference)) preference = 'system';
  const dark = preference === 'dark' || (preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.style.colorScheme = dark ? 'dark' : 'light';
  document.body.toggleAttribute('data-ds-dark-theme', dark);
})();
