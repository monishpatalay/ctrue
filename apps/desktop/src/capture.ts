import type { Source } from './types';
export type Capture = { stream: MediaStream; stop(): Promise<void> };
function encodeBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let value = '';
  for (let i = 0; i < bytes.length; i++) value += String.fromCharCode(bytes[i]);
  return btoa(value);
}
export async function acquireScreen(source?: Source): Promise<MediaStream> {
  if (window.ctrue && source) await window.ctrue.selectSource(source.id);
  return navigator.mediaDevices.getDisplayMedia({ video: true, audio: { channelCount: 1, sampleRate: 24000, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
}
export async function startAudio(options: { stream: MediaStream; micId?: string; api: string; accessToken: string; sessionId: string; openaiKey?: string; signal?: AbortSignal; onText(type: string, id: string, text: string): void; onLevel(level: number): void; onError(error: string): void; onReady(): void }): Promise<Capture> {
  const { stream } = options;
  const streams = [stream];
  let context: AudioContext | null = null;
  let socket: WebSocket | null = null;
  let closing = false;
  async function stop() {
    closing = true;
    for (const media of streams) for (const track of media.getTracks()) track.stop();
    socket?.close();
    if (context && context.state !== 'closed') await context.close();
    options.onLevel(0);
  }
  const abort = () => { void stop(); };
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    options.signal?.throwIfAborted();
    if (options.micId !== undefined) streams.push(await navigator.mediaDevices.getUserMedia({ audio: { deviceId: options.micId ? { exact: options.micId } : undefined, echoCancellation: true, noiseSuppression: true } }));
    options.signal?.throwIfAborted();
    const system = stream.getAudioTracks();
    if (!system.length) throw new Error('No system audio track was captured. Check system audio permission and choose a source with shared audio.');
    if (system.some(track => track.readyState === 'ended')) throw new Error('System audio capture was denied or unavailable. Check System Audio Recording permission.');
    context = new AudioContext({ sampleRate: 24000 });
    if (context.sampleRate !== 24000) throw new Error('This device could not create the required 24 kHz audio stream.');
    await context.audioWorklet.addModule(`${import.meta.env.BASE_URL}pcm-worklet.js`);
    options.signal?.throwIfAborted();
    const processor = new AudioWorkletNode(context, 'ctrue-pcm');
    const mute = context.createGain(); mute.gain.value = 0;
    processor.connect(mute).connect(context.destination);
    for (const media of streams) {
      const tracks = media.getAudioTracks();
      if (tracks.length) context.createMediaStreamSource(new MediaStream(tracks)).connect(processor);
    }
    let ready = false;
    socket = new WebSocket(`${options.api.replace(/^http/, 'ws')}/transcription`);
    const ws = socket;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { reject(new Error('Transcription connection timed out.')); }, 15000);
      ws.onopen = () => ws.send(JSON.stringify({ type: 'start', accessToken: options.accessToken, sessionId: options.sessionId, ...(options.openaiKey ? { openaiKey: options.openaiKey } : {}) }));
      ws.onmessage = event => {
        try {
          const value = JSON.parse(event.data);
          if (value.type === 'ready') { ready = true; clearTimeout(timeout); options.onReady(); resolve(); }
          else if (value.type === 'partial' || value.type === 'final') options.onText(value.type, String(value.id), String(value.text));
          else if (value.type === 'error') { const message = String(value.error || 'Transcription failed.'); clearTimeout(timeout); reject(new Error(message)); options.onError(message); void stop(); }
        } catch (error) { clearTimeout(timeout); reject(error); options.onError(error instanceof Error ? error.message : 'Invalid transcription response.'); void stop(); }
      };
      ws.onerror = () => { clearTimeout(timeout); reject(new Error('Transcription connection failed.')); };
      ws.onclose = () => { clearTimeout(timeout); reject(new Error('Transcription disconnected.')); if (!closing) { options.onError('Transcription disconnected. Resume capture to reconnect.'); void stop(); } };
    });
    processor.port.onmessage = event => {
      const { pcm, level, rate } = event.data;
      if (closing) return;
      options.onLevel(level);
      if (rate !== 24000) { options.onError('Audio sample rate changed. Restart capture.'); void stop(); return; }
      if (ready && ws.readyState === WebSocket.OPEN) {
        if (ws.bufferedAmount > 512000) { options.onError('Network is too slow for live audio. Capture stopped.'); void stop(); return; }
        ws.send(JSON.stringify({ type: 'audio', data: encodeBase64(pcm) }));
      }
    };
    for (const media of streams) for (const track of media.getTracks()) track.addEventListener('ended', () => { if (!closing) { options.onError('Capture device or screen sharing ended. Choose the source again.'); void stop(); } });
    await context.resume();
    return { stream, stop: async () => { options.signal?.removeEventListener('abort', abort); await stop(); } };
  } catch (error) { options.signal?.removeEventListener('abort', abort); await stop(); throw error; }
}
