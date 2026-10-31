"""Validate the next exit before stopping clients; never move their login directories."""
import time
from .fallback_plan import chain
from .fallback import now


def switch(fallbacks, root, target, automatic):
    manager, key = fallbacks.manager, root['id']
    settings = manager.environments.read()
    plan = chain(settings['proxies'], key)
    active = fallbacks.active(key)
    with fallbacks.lock:
        current = fallbacks.selected.get(key, key)
        country = fallbacks.exits.get(current, {}).get('country', '')
    country = next((run.get('resolved', {}).get('country') for _, _, run in active
                    if run.get('resolved', {}).get('country')), country)
    if automatic and not country: raise ValueError('尚未确认当前国家，未执行自动切换')
    start = next((i for i, row in enumerate(plan) if row['id'] == current), 0)
    candidates = plan[:1] if target == 'primary' else plan[start+1:]
    if not candidates: raise ValueError('已经是回退链的最后一个节点')
    errors, chosen = [], None
    for candidate in candidates:
        if fallbacks.closed.is_set(): return
        expected = next((profile.get('expected_ip', '') for _, profile, _ in active
                         if profile.get('expected_ip')), '') if candidate['id'] == key else ''
        try:
            fallbacks.check_candidate(candidate, country, expected)
            chosen = candidate
            break
        except (ValueError, OSError) as error: errors.append(candidate['name']+'：'+str(error))
    if chosen is None: raise ValueError('没有通过检查的备用节点；'+'；'.join(errors))
    active = fallbacks.active(key)
    if any(run.get('status') == 'checking' for _, _, run in active):
        raise ValueError('环境正在启动，未执行切换')
    # Other accounts retain their route and are never stopped by this operation.
    if any(profile['proxy_id'] != key for profile in manager.active()):
        raise ValueError('另一个账号环境正在使用网络，请先停止它再切换')
    stopped = []
    for runtime, profile, run in active:
        if fallbacks.closed.is_set(): return
        try: runtime.stop(profile['id'])
        except (ValueError, OSError):
            # Restore already-stopped clients on their previous selection if one client cannot stop.
            for previous, old_profile, old_run in stopped:
                previous.launch({'profile_id': old_profile['id'], **({'account_id': old_run['account_id']} if old_run.get('account_id') else {})}, fallback=True)
            raise
        stopped.append((runtime, profile, run))
    if fallbacks.closed.is_set(): return
    with fallbacks.lock:
        fallbacks.selected[key] = chosen['id']
        fallbacks.save()
    for runtime, profile, run in active:
        if fallbacks.closed.is_set(): return
        value = {'profile_id': profile['id']}
        if run.get('account_id'): value['account_id'] = run['account_id']
        runtime.launch(value, fallback=True)
    deadline = time.monotonic()+200
    while active and not fallbacks.closed.is_set():
        runs = [runtime.runs.get(profile['id'], {}) for runtime, profile, _ in active]
        failure = next((run for run in runs if run.get('status') in ('failed', 'blocked', 'stopped')), None)
        if failure: raise ValueError('节点已切换，环境重启未完成：'+(failure.get('error') or failure.get('stage', '')))
        if all(run.get('status') == 'running' for run in runs): break
        if time.monotonic() >= deadline: raise ValueError('节点已切换，环境重启检查尚未完成，请查看账号状态')
        fallbacks.closed.wait(.25)
    if fallbacks.closed.is_set(): return
    fallbacks.update(key, state='backup' if chosen['id'] != key else 'healthy', failures=0,
                     message=('自动回退至' if automatic else '已切换至')+chosen['name'],
                     switched_at=now(), checked_at=now())
