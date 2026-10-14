export function encodePCM16(samples) {
  const result = new ArrayBuffer(samples.length * 2);
  const view = new DataView(result);
  for (let i = 0; i < samples.length; i++) {
    const sample = Number.isFinite(samples[i]) ? Math.max(-1, Math.min(1, samples[i])) : 0;
    view.setInt16(i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return result;
}
// ponytail: the browser resamples the AudioContext to 24 kHz; refuse a different rate.
if (typeof AudioWorkletProcessor !== 'undefined') {
  class PCMProcessor extends AudioWorkletProcessor {
    constructor() { super(); this.samples = new Float32Array(4800); this.offset = 0; }
    process(inputs) {
      const channels = inputs[0];
      if (!channels?.length) return true;
      const size = channels[0].length;
      for (let i = 0; i < size; i++) {
        let sample = 0;
        for (const channel of channels) sample += channel[i] || 0;
        this.samples[this.offset++] = sample / channels.length;
        if (this.offset === this.samples.length) {
          let energy = 0;
          for (const value of this.samples) energy += value * value;
          const pcm = encodePCM16(this.samples);
          this.port.postMessage({ pcm, level: Math.sqrt(energy / this.samples.length), rate: sampleRate }, [pcm]);
          this.offset = 0;
        }
      }
      return true;
    }
  }
  registerProcessor('ctrue-pcm', PCMProcessor);
}
