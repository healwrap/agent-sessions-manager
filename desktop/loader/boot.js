const status = document.getElementById('status');
const recovery = document.querySelector('.boot-recovery');
const restart = document.getElementById('restart');
function failed(message) {
  status.textContent = message;
  recovery.hidden = false;
  document.documentElement.classList.add('startup-failed');
}
window.__TAURI__.core.invoke('backend_status').then(stopped => {
  if (stopped) failed('后台已停止，点击重新启动恢复。');
}).catch(error => failed(String(error)));
restart.addEventListener('click', () => {
  status.textContent = '正在重新启动…';
  restart.disabled = true;
  document.documentElement.classList.remove('startup-failed');
  window.__TAURI__.core.invoke('restart_backend').catch(error => {
    restart.disabled = false;
    failed(String(error));
  });
});
