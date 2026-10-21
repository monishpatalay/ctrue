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
export async function startAudio(options: { stream: MediaStream; micId?: string; api: string; accessToken(): string; sessionId: string; openaiKey?: string; signal?: AbortSignal; onText(type: string, id: string, text: string): void; onLevel(level: number): void; onError(error: string): void; onReady(): void; onReconnecting?(): void; onListening?(): void; onSpeech?(speaking: boolean, stoppedAt?: number): void }): Promise<Capture> {
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
    // The API's transcription socket. A dropped connection or a passing failure on OpenAI's side reconnects by itself,
    // up to three times in a row (after 1, 2 and 4 s); a refused key, a paused session or a bad request stops capture.
    const passing = /provider failed|provider response|connect to transcription provider|connection closed|disconnected|timed out|connection failed/i;
    let ready = false, attempts = 0;
    const open = () => new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${options.api.replace(/^http/, 'ws')}/transcription`);
      socket = ws; ready = false;
      let failure = '';
      const timeout = setTimeout(() => { failure = 'Transcription connection timed out.'; ws.close(); }, 15000);
      ws.onopen = () => ws.send(JSON.stringify({ type: 'start', accessToken: options.accessToken(), sessionId: options.sessionId, ...(options.openaiKey ? { openaiKey: options.openaiKey } : {}) }));
      ws.onmessage = event => {
        let value: { type?: string; id?: unknown; text?: unknown; error?: unknown; ago?: unknown };
        try { value = JSON.parse(event.data); } catch { failure = 'Invalid transcription response.'; ws.close(); return; }
        if (value.type === 'ready') { ready = true; attempts = 0; clearTimeout(timeout); flush(ws); options.onReady(); resolve(); }
        else if (value.type === 'partial' || value.type === 'final') options.onText(value.type, String(value.id), String(value.text));
        // OpenAI's turn detection: someone started talking, or stopped `ago` ms before this message.
        else if (value.type === 'speaking') options.onSpeech?.(true);
        else if (value.type === 'quiet') options.onSpeech?.(false, Date.now() - Math.max(0, Number(value.ago) || 0));
        else if (value.type === 'error') failure = String(value.error || 'Transcription failed.');
      };
      ws.onerror = () => { failure ||= 'Transcription connection failed.'; };
      ws.onclose = () => {
        clearTimeout(timeout);
        if (closing || socket !== ws) return;
        const reason = failure || 'Transcription disconnected.';
        if (ready) void reconnect(reason); else reject(new Error(reason));
      };
    });
    async function reconnect(reason: string) {
      while (!closing && passing.test(reason) && attempts < 3) {
        options.onReconnecting?.();
        await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempts++));
        if (closing) return;
        try { await open(); return; } catch (error) { reason = error instanceof Error ? error.message : reason; }
      }
      if (closing) return;
      options.onError(passing.test(reason) ? `${reason.replace(/\.$/, '')}. Reconnecting failed; resume capture to try again.` : reason);
      void stop();
    }
    // Audio is captured from the first moment and held here (up to 8 s, 200 ms per frame) until the connection is ready,
    // then sent in one burst, so listening starts at once and nothing said while connecting is lost.
    const waiting: string[] = [];
    function flush(ws: WebSocket) { for (const data of waiting.splice(0)) ws.send(JSON.stringify({ type: 'audio', data })); }
    processor.port.onmessage = event => {
      const { pcm, level, rate } = event.data;
      if (closing) return;
      options.onLevel(level);
      if (rate !== 24000) { options.onError('Audio sample rate changed. Restart capture.'); void stop(); return; }
      const ws = socket, data = encodeBase64(pcm);
      if (ready && ws?.readyState === WebSocket.OPEN) {
        // ~8 s of queued audio; the API's AudioBudget accepts a 10 s burst, so keep this below that when changing it.
        if (ws.bufferedAmount > 512000) { options.onError('Network is too slow for live audio. Capture stopped.'); void stop(); return; }
        ws.send(JSON.stringify({ type: 'audio', data }));
      } else { waiting.push(data); if (waiting.length > 40) waiting.shift(); }
    };
    for (const media of streams) for (const track of media.getTracks()) track.addEventListener('ended', () => { if (!closing) { options.onError('Capture device or screen sharing ended. Choose the source again.'); void stop(); } });
    await context.resume();
    options.onListening?.();
    // Connect in the background; a failure before the first "ready" stops capture with its reason.
    open().catch(error => { if (!closing) { options.onError(error instanceof Error ? error.message : 'Transcription connection failed.'); void stop(); } });
    return { stream, stop: async () => { options.signal?.removeEventListener('abort', abort); await stop(); } };
  } catch (error) { options.signal?.removeEventListener('abort', abort); await stop(); throw error; }
}
