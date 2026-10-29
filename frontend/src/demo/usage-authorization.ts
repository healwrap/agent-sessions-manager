import type { UsageAuthorizationJob } from '../lib/account-usage';

const jobs = new Map<string, UsageAuthorizationJob>();
const authorized = new Set<string>();
let serial = 0;

export function demoUsageAuthorization(accountId: string) {
  return {
    state: authorized.has(accountId) ? ('ready' as const) : ('none' as const),
    email: '',
    error: '',
  };
}

export function demoAuthorize(path: string, body: Record<string, string>) {
  if (path.endsWith('/authorize')) {
    const job: UsageAuthorizationJob = {
      id: 'demo-usage-' + ++serial,
      account_id: body.account_id,
      account_name: '示例账号',
      state: 'waiting',
      stage: '演示：请粘贴示例授权码，体验后台查询授权',
      error: '',
    };
    jobs.set(job.id, job);
    return job;
  }
  const job = jobs.get(body.id || path.split('/').at(-1)!);
  if (!job) throw new Error('示例授权不存在');
  if (path.endsWith('/authorize-complete')) {
    authorized.add(job.account_id);
    job.state = 'verified';
    job.stage = '演示：后台查询已授权';
  }
  if (path.endsWith('/authorize-cancel') && job.state !== 'verified')
    job.state = 'cancelled';
  return job;
}
