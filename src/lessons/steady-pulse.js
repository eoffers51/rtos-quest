// Stage 3: ticks, drift and vTaskDelayUntil. Builds on the firmware from stage 2 and adds a spectrometer task.
import { c, un, d, task, pinT, gapsOf, maxGap, S_, B } from '../kernel.js';
import { lesson as stage2 } from './wheels-and-eyes.js';
import { manual, realCode, quiz } from './steady-pulse.content.js';
import { briefing, reactions, hints, solutionNote } from './steady-pulse.copy.js';

const clone = o => JSON.parse(JSON.stringify(o));
const steady = (a, period, min) => a.length >= min && gapsOf(a).every(x => Math.abs(x - period) <= 3);
const seen = a => a.length > 1 ? 'intervals seen: ' + [...new Set(gapsOf(a))].sort((x, y) => x - y).slice(0, 5).join(', ') + ' ms' : a.length + ' toggle(s)';

export const lesson = {
  id: 3, title: 'Steady Pulse', topic: 'Ticks, drift and vTaskDelayUntil', file: 'main/rover_main.c',
  T: 3000, cores: 1, pins: ['BEACON', 'HEART'], ops: ['gpio', 'call', 'delay', 'until', 'busy'], fns: ['sampleSpectrometer'],
  goals: [
    'Spectrometer: 145 to 155 samples started in 3 s (50 Hz)',
    'Spectrometer: sample k starts within 25 ms of k x 20 ms (no drift)',
    'Still working from stage 2: motor never more than 11 ms between two motorStep() calls',
    'Still working from stage 2: telemetry never more than 105 ms between packets, at least 27 sent',
    'Still working from stage 1: BEACON every 500 ms and HEART every 200 ms (within 3 ms)',
  ],
  start: prev => { const p = clone(prev || stage2.solution()); p.units.push(task('spectro', 1, [c('sampleSpectrometer'), d(20)], { stack: 1280 })); return p; },
  solution: () => { const p = stage2.solution(); p.units.push(task('spectro', 1, [c('sampleSpectrometer'), un(20)], { stack: 1280 })); return p; },
  check: K => {
    const s = S_(K, 'sampleSpectrometer'), n = s.length, drift = n ? Math.max(...s.map((t, k) => Math.abs(t - k * 20))) : Infinity;
    const m = maxGap(S_(K, 'motorStep')), tl = S_(K, 'sendTelemetry'), tg = maxGap(tl), b = pinT(K, 'BEACON'), h = pinT(K, 'HEART');
    return [[n >= 145 && n <= 155, `${n} samples`], [drift <= 25, `worst drift ${drift} ms`],
      [m <= 11, m === Infinity ? 'motorStep() never ran' : `worst gap ${m} ms`],
      [tg <= 105 && tl.length >= 27, `worst gap ${tg === Infinity ? '-' : tg} ms, ${tl.length} packets`],
      [steady(b, 500, 5) && steady(h, 200, 13), seen(b) + ' / ' + seen(h)]];
  },
  // chart evidence: amber ticks show the 20 ms grid; the bracket shows the first sample that misses its slot
  chartGrid: { unit: 'spectro', period: 20 },
  evidence: K => { const s = S_(K, 'sampleSpectrometer'), k = s.findIndex((t, n) => Math.abs(t - n * 20) > 25); return k < 0 ? [] : [{ unit: 'spectro', from: Math.min(k * 20, s[k]), to: Math.max(k * 20, s[k]), label: `sample ${k} starts ${Math.abs(s[k] - k * 20)} ms after its slot` }]; },   // the first sample that is outside the limit, not the worst: a short bracket near the start
  bonus: B(85, 8252),
  briefing, reactions,
  diagnose: (K, res) => {
    if (!res[0][0] || !res[1][0]) return reactions.drift;
    if (!res[2][0] || !res[3][0]) return reactions.hog;
    if (!res[4][0]) return reactions.lights;
    return reactions.fail;
  },
  hints, solutionNote,
  // Unit order: beacon, heart, motor, camera, telemetry, spectro (index 5).
  wrong: [
    { name: 'plain delay (the original bug)', apply: p => { p.units[5].code[1] = d(20); }, fails: [0, 1], says: 'drift' },
    { name: 'delay with a fudge value', apply: p => { p.units[5].code[1] = d(15); }, fails: [0, 1], says: 'drift' },
    { name: 'wrong period in delayUntil', apply: p => { p.units[5].code[1] = un(25); }, fails: [0, 1], says: 'drift' },
    { name: 'spectrometer above everything', apply: p => { p.units[5].prio = 5; }, fails: [2, 3], says: 'hog' },
    { name: 'stack too small', apply: p => { p.units[5].stack = 1024; }, crash: 'stack overflow' },
    { name: 'sample loop without a delay', apply: p => { p.units[5].code.pop(); }, crash: 'task_wdt' },
  ],
  manual, realCode, quiz,
};
