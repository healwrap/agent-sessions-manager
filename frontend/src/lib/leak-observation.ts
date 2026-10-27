export interface DnsServer {
  ip: string;
  country: string;
  info: string[];
}

export type LeakObservation =
  | {
      kind: 'dns';
      status: 'observed' | 'failed';
      servers: DnsServer[];
      errors: string[];
    }
  | {
      kind: 'webrtc';
      status: 'complete' | 'timeout' | 'unsupported' | 'restricted' | 'failed';
      candidates: { type: string; address: string }[];
      errors: number[];
      udp_restricted: boolean;
    };
