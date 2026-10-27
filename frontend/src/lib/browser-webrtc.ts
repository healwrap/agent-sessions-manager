import type { DiagnosticItem } from './claude-diagnostics';

export async function webrtcCandidates(
  managed = false,
): Promise<DiagnosticItem> {
  const base = {
    id: 'webrtc',
    title: 'WebRTC 候选地址',
    scope: '独立浏览器检测页',
  };
  if (typeof RTCPeerConnection === 'undefined')
    return {
      ...base,
      state: 'unknown',
      value: '浏览器不支持 WebRTC',
      detail: '',
    };
  const candidates = new Set<string>();
  const errors = new Set<number>();
  let connection: RTCPeerConnection | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  try {
    connection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
      ],
    });
    const peer = connection;
    const completed = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, 6000);
      const finish = () => {
        finished = true;
        resolve();
      };
      peer.onicecandidateerror = (event) => errors.add(event.errorCode);
      peer.onicegatheringstatechange = () => {
        if (peer.iceGatheringState === 'complete') finish();
      };
      peer.onicecandidate = (event) => {
        if (!event.candidate) return finish();
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
    return {
      ...base,
      state: candidates.size ? 'info' : 'unknown',
      value: candidates.size
        ? [...candidates].join('；')
        : '已检测，未产生 ICE 候选',
      detail: [
        finished ? 'ICE 收集完成' : 'ICE 收集在 6 秒后超时',
        managed ? '非代理 UDP 已禁用' : '',
        errors.size ? `STUN 错误：${[...errors].join('、')}` : '',
      ]
        .filter(Boolean)
        .join('；'),
    };
  } catch (reason) {
    return {
      ...base,
      state: 'unknown',
      value: 'WebRTC 采样失败',
      detail: String(reason),
    };
  } finally {
    clearTimeout(timer);
    connection?.close();
  }
}
