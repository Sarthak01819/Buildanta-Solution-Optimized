/**
 * One loudness meter for the Sound button's EQ bars (D-095). Insert `node`
 * between a sound's output and the destination; `level()` is 0..1 of what is
 * actually heard (after mute / fades), on the same curve as the scores'.
 */
export function createMeter(ctx) {
  const node = ctx.createAnalyser();
  node.fftSize = 256;
  const buf = new Uint8Array(node.frequencyBinCount);
  node.connect(ctx.destination);
  return {
    node,
    level() {
      if (ctx.state !== "running") return 0;
      node.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      return Math.min(1, Math.sqrt(Math.sqrt(sum / buf.length)) * 1.6);
    },
  };
}
