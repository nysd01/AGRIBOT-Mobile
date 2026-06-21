/**
 * useWebrtcFeed — receives the AGRI-PC camera + mic over WebRTC.
 *
 * Flow (matches agribot-edge POST /offer, which uses aiortc / no trickle ICE):
 *   1. create a recvonly peer connection
 *   2. make an SDP offer, wait for ICE gathering to finish
 *   3. POST {sdp,type} → http://<host>:8000/offer
 *   4. apply the SDP answer; the inbound MediaStream arrives via the 'track' event
 *
 * Works the same online and offline — only the ICE servers differ. Offline (LAN)
 * needs STUN only; online (remote/CGNAT) will also need a TURN server (added later
 * from settings).
 *
 * Native only (react-native-webrtc). Web uses RemoteCameraFeed.web.tsx.
 */

import { useEffect, useRef, useState } from 'react';
import { RTCPeerConnection, RTCSessionDescription, type MediaStream } from 'react-native-webrtc';

export type FeedStatus = 'idle' | 'connecting' | 'connected' | 'failed';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const ICE_GATHER_TIMEOUT_MS = 3000;

export function useWebrtcFeed(host: string | null, port = 8000) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<FeedStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    if (!host) {
      setStatus('idle');
      return;
    }

    let cancelled = false;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    setStatus('connecting');
    setError(null);
    setStream(null);

    // We only receive — AGRI-PC is the sender.
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    (pc as any).addEventListener('track', (event: any) => {
      if (event.streams && event.streams[0]) setStream(event.streams[0]);
    });
    (pc as any).addEventListener('connectionstatechange', () => {
      const st = (pc as any).connectionState;
      if (st === 'connected') setStatus('connected');
      else if (st === 'failed' || st === 'disconnected' || st === 'closed') {
        if (!cancelled) setStatus('failed');
      }
    });

    const waitForIce = () =>
      new Promise<void>((resolve) => {
        if ((pc as any).iceGatheringState === 'complete') return resolve();
        const check = () => {
          if ((pc as any).iceGatheringState === 'complete') {
            (pc as any).removeEventListener('icegatheringstatechange', check);
            resolve();
          }
        };
        (pc as any).addEventListener('icegatheringstatechange', check);
        setTimeout(resolve, ICE_GATHER_TIMEOUT_MS); // don't hang if a candidate stalls
      });

    (async () => {
      try {
        const offer = await pc.createOffer({});
        await pc.setLocalDescription(offer);
        await waitForIce();
        if (cancelled) return;

        const res = await fetch(`http://${host}:${port}/offer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sdp: pc.localDescription?.sdp,
            type: pc.localDescription?.type,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const answer = await res.json();
        if (cancelled) return;
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? 'connection failed');
          setStatus('failed');
        }
      }
    })();

    return () => {
      cancelled = true;
      try { pc.close(); } catch {}
      pcRef.current = null;
      setStream(null);
      setStatus('idle');
    };
  }, [host, port]);

  return { stream, status, error };
}
