import type { DiagnosticItem } from './claude-diagnostics';
import type { LeakObservation } from './leak-observation';

export async function webrtcCandidates(
  managed = false,
): Promise<DiagnosticItem> {
  const base = {
    id: 'webrtc',
    title: 'WebRTC 候选地址',
    scope: '独立浏览器检测页',
  };
  const observation: Extract<LeakObservation, { kind: 'webrtc' }> = {
    kind: 'webrtc',
    status: 'unsupported',
    candidates: [],
    errors: [],
    udp_restricted: managed,
  };
  if (typeof RTCPeerConnection === 'undefined')
    return {
      ...base,
      state: 'info',
      label: '不支持',
      value: '浏览器不支持 WebRTC',
      detail: '',
      observation,
    };
  const candidates = new Map<string, { type: string; address: string }>();
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
        if (address)
          candidates.set(`${candidate.type}:${address}`, {
            type: candidate.type || 'unknown',
            address,
          });
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
    observation.status = finished ? 'complete' : 'timeout';
    observation.candidates = [...candidates.values()];
    observation.errors = [...errors];
    return {
      ...base,
      state: candidates.size ? 'info' : 'unknown',
      label: !finished
        ? '检测超时'
        : errors.size
          ? 'STUN 连接异常'
          : '采样完成',
      value: candidates.size
        ? [...candidates.values()]
            .map(({ type, address }) => `${type} · ${address}`)
            .join('；')
        : '已检测，未产生 ICE 候选',
      detail: [
        finished ? 'ICE 收集完成' : 'ICE 收集在 6 秒后超时',
        managed ? '非代理 UDP 已禁用' : '',
        errors.size ? `STUN 错误：${[...errors].join('、')}` : '',
      ]
        .filter(Boolean)
        .join('；'),
      observation,
    };
  } catch (reason) {
    const restricted =
      reason instanceof DOMException &&
      ['NotAllowedError', 'SecurityError', 'NotSupportedError'].includes(
        reason.name,
      );
    observation.status = restricted ? 'restricted' : 'failed';
    return {
      ...base,
      state: restricted ? 'info' : 'unknown',
      label: restricted ? '功能受限' : '检测失败',
      value: restricted ? 'WebRTC 功能被浏览器限制' : 'WebRTC 采样失败',
      detail: String(reason),
      observation,
    };
  } finally {
    clearTimeout(timer);
    connection?.close();
  }
}
