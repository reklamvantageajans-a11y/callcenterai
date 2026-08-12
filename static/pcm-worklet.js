// Mic capture worklet: runs off the main thread for low-latency, jitter-free
// PCM16 capture. Posts Int16 PCM buffers back to the main thread.
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const ch = input[0];
      const pcm16 = new Int16Array(ch.length);
      for (let i = 0; i < ch.length; i++) {
        let s = Math.max(-1, Math.min(1, ch[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
