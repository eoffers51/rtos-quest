// Tiny synthesised sound effects (WebAudio), so the game needs no audio files.
let ctx = null, muted = false;
try { muted = localStorage.getItem('rq.muted') === '1'; } catch (e) { /* storage unavailable */ }

function tone(freq, at, dur, type = 'square', vol = 0.05) {
  if (!ctx || muted) return;
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + at;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
}
const seq = (notes, step, dur, type, vol) => notes.forEach((f, i) => tone(f, i * step, dur, type, vol));

export const sfx = {
  /** Must be called from a user gesture. */
  unlock() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } } else if (ctx.state === 'suspended') ctx.resume(); },
  get muted() { return muted; },
  toggle() { muted = !muted; try { localStorage.setItem('rq.muted', muted ? '1' : '0'); } catch (e) { /* ignore */ } return muted; },
  click() { tone(880, 0, 0.04, 'square', 0.03); },
  type() { tone(1400 + Math.random() * 300, 0, 0.015, 'square', 0.012); },
  flash() { seq([330, 440, 587, 784], 0.07, 0.09, 'sawtooth', 0.04); },
  crash() { seq([220, 147, 98, 65], 0.11, 0.22, 'sawtooth', 0.08); },
  fail() { seq([330, 262], 0.16, 0.22, 'triangle', 0.07); },
  win() { seq([523, 659, 784, 1047, 1319], 0.1, 0.28, 'triangle', 0.08); },
  star() { tone(1568, 0, 0.25, 'triangle', 0.07); },
};
