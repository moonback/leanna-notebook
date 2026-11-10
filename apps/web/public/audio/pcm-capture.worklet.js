class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(2048);
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    let cursor = 0;
    while (cursor < input.length) {
      const count = Math.min(this.buffer.length - this.offset, input.length - cursor);
      this.buffer.set(input.subarray(cursor, cursor + count), this.offset);
      this.offset += count;
      cursor += count;
      if (this.offset === this.buffer.length) {
        const chunk = this.buffer.slice();
        this.port.postMessage(chunk, [chunk.buffer]);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
