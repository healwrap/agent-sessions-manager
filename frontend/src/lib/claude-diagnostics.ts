export type CheckState = 'pass' | 'warn' | 'fail' | 'unknown' | 'info';
export interface DiagnosticItem {
  id: string;
  title: string;
  state: CheckState;
  value: string;
  detail: string;
  scope: string;
}
export interface DiagnosticRoute {
  mode: 'direct' | 'proxy';
  label: string;
  endpoint: string;
}
export interface EgressSample {
  ip?: string;
  country?: string;
  colo?: string;
  ms?: number;
}
export interface DiagnosticHistory {
  checked_at: string;
  route: DiagnosticRoute;
  claude_ip: string;
  cloudflare_ip: string;
  country: string;
  org: string;
}
export interface IpReputation {
  provider: string;
  ip: string;
  state: 'ok' | 'unknown';
  queried_at: string;
  cached: boolean;
  message?: string;
  source_url?: string;
  metadata?: Partial<
    Record<'country' | 'region' | 'city' | 'org' | 'isp', string>
  >;
  network_type?: 'Residential' | 'Business' | 'Wireless' | 'Hosting' | null;
  trust_score?: number | null;
  confidence?: number | null;
  detections?: Partial<
    Record<
      'proxy' | 'vpn' | 'tor' | 'hosting' | 'abuse' | 'scraper' | 'anonymous',
      boolean | null
    >
  >;
  last_seen?: string | null;
  updated_at?: string | null;
}
export interface ClaudeReport {
  checked_at: string;
  route: DiagnosticRoute;
  exits: { claude: EgressSample; cloudflare: EgressSample };
  ip_details: Partial<
    Record<'country' | 'region' | 'city' | 'org' | 'timezone', string>
  >;
  ip_reputation: IpReputation;
  checks: DiagnosticItem[];
  local_checks: DiagnosticItem[];
  history: DiagnosticHistory[];
}
export const checkLabels: Record<CheckState, string> = {
  pass: '通过',
  warn: '需关注',
  fail: '失败',
  unknown: '未验证',
  info: '信息',
};
export const routeLabel = (route: DiagnosticRoute) =>
  route.endpoint ? `${route.label} · ${route.endpoint}` : route.label;
export const checkedTime = (value: string) => new Date(value).toLocaleString();

const deviceItem = (
  id: string,
  title: string,
  value: string,
  detail = '',
  state: CheckState = 'info',
): DiagnosticItem => ({
  id,
  title,
  value,
  detail,
  state,
  scope: '当前 Agent Sessions 窗口',
});

async function canvasFingerprint(): Promise<DiagnosticItem> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 280;
    canvas.height = 60;
    const context = canvas.getContext('2d');
    if (!context || !crypto.subtle) throw new Error();
    context.fillStyle = '#dd7755';
    context.fillRect(0, 0, 280, 60);
    context.font = '16px sans-serif';
    context.fillStyle = '#18324f';
    context.fillText('Agent Sessions · Canvas 0123456789', 8, 36);
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(canvas.toDataURL()),
    );
    const value = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    return deviceItem(
      'canvas',
      'Canvas 指纹',
      value,
      '固定绘制样本的 SHA-256；用于比较此窗口，不用于判断账号状态。',
    );
  } catch {
    return deviceItem(
      'canvas',
      'Canvas 指纹',
      '当前窗口未提供绘制或摘要能力',
      '',
      'unknown',
    );
  }
}

function webglRenderer(): DiagnosticItem {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl');
    if (!gl) throw new Error();
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    const value = String(
      gl.getParameter(
        extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
      ),
    );
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return deviceItem('webgl', 'WebGL 渲染器', value);
  } catch {
    return deviceItem(
      'webgl',
      'WebGL 渲染器',
      '当前窗口未提供 WebGL',
      '',
      'unknown',
    );
  }
}

async function webrtcCandidates(): Promise<DiagnosticItem> {
  if (typeof RTCPeerConnection === 'undefined')
    return deviceItem(
      'webrtc',
      'WebRTC 候选地址',
      '当前窗口不支持 WebRTC',
      '',
      'unknown',
    );
  const candidates = new Set<string>();
  let connection: RTCPeerConnection | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    connection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    const peer = connection;
    const completed = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, 6000);
      peer.onicecandidate = (event) => {
        if (!event.candidate) {
          resolve();
          return;
        }
        const candidate = event.candidate;
        const address = candidate.address || candidate.candidate.split(' ')[4];
        if (address) candidates.add(`${candidate.type || '候选'} · ${address}`);
      };
    });
    peer.createDataChannel('diagnostics');
    await Promise.race([
      (async () => {
        await peer.setLocalDescription(await peer.createOffer());
        await completed;
      })(),
      completed,
    ]);
    return deviceItem(
      'webrtc',
      'WebRTC 候选地址',
      candidates.size ? [...candidates].join('；') : '未取得候选地址',
      candidates.size
        ? '本窗口采样，可能包含本地、mDNS、服务器反射地址；未与 Claude 目标环境进行泄漏判定。'
        : 'STUN 无回包或未产生候选；不能据此认定没有泄漏。',
      candidates.size ? 'info' : 'unknown',
    );
  } catch {
    return deviceItem(
      'webrtc',
      'WebRTC 候选地址',
      '未完成采样',
      '当前窗口或网络未完成 ICE 收集。',
      'unknown',
    );
  } finally {
    clearTimeout(timer);
    connection?.close();
  }
}

export async function inspectDiagnosticWindow(): Promise<DiagnosticItem[]> {
  const [canvas, webrtc] = await Promise.all([
    canvasFingerprint(),
    webrtcCandidates(),
  ]);
  return [
    deviceItem(
      'window-timezone',
      '窗口时区',
      Intl.DateTimeFormat().resolvedOptions().timeZone || '未取得',
    ),
    deviceItem(
      'window-language',
      '窗口语言',
      navigator.languages.join('、') || navigator.language,
    ),
    deviceItem('window-ua', '浏览器标识', navigator.userAgent),
    deviceItem(
      'window-screen',
      '屏幕与触屏',
      `${screen.width} × ${screen.height} · ${devicePixelRatio}x · ${navigator.maxTouchPoints} 个触点`,
    ),
    webglRenderer(),
    canvas,
    webrtc,
  ];
}
