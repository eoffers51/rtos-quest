// Stage 4: stacks, heap and high-water marks. Builds on stage 3 and adds navigation and terrain mapping within a RAM budget.
import { F, c, d, task, pinT, gapsOf, maxGap, S_, E_, B } from '../kernel.js';
import { lesson as stage3 } from './steady-pulse.js';
import { manual, realCode, quiz } from './every-byte-counts.content.js';
import { briefing, reactions, hints, solutionNote } from './every-byte-counts.copy.js';

const clone = o => JSON.parse(JSON.stringify(o));
const steady = (a, period, min) => a.length >= min && gapsOf(a).every(x => Math.abs(x - period) <= 3);
const seen = a => a.length > 1 ? 'intervals seen: ' + [...new Set(gapsOf(a))].sort((x, y) => x - y).slice(0, 5).join(', ') + ' ms' : a.length + ' toggle(s)';
// Presentation only: during stage 4 each successful frame allocation prints the free heap on the serial monitor, so the drain is visible before the panic.
const allocEnd = F.allocFrame.end;
F.allocFrame.end = K => { allocEnd(K); if (K.L && K.L.id === 4 && !K.crash) K.log(`mapper: heap free ${K.heap} B`, 'd'); };
const room = K => { const nm = K.units.filter(u => u.name === 'nav' || u.name === 'mapper'); return nm.length ? Math.min(...nm.map(u => u.stack - u.hw)) : 0; };

export const lesson = {
  id: 4, title: 'Every Byte Counts', topic: 'Stacks, heap, high-water marks', file: 'main/rover_main.c',
  T: 1500, cores: 1, heap: 8192, pins: ['BEACON', 'HEART'], ops: ['gpio', 'call', 'delay', 'until', 'busy'],
  fns: ['planPath', 'allocFrame', 'processFrame', 'freeFrame'],
  goals: [
    'Mapper: at least 5 frames processed in 1.5 s',
    'Navigation: at least 4 paths planned in 1.5 s',
    'No leak: at most one 2048 B frame still allocated when the test ends',
    'Memory budget: stacks and kernel objects use at most 14500 bytes of RAM',
    'Stack headroom: nav and mapper keep at least 128 bytes of stack unused at their peak',
    'Still working from stage 3: spectrometer 72 to 78 samples started in 1.5 s',
    'Still working from stage 2: motor never more than 11 ms between steps, telemetry never more than 105 ms between packets, at least 13 sent',
    'Still working from stage 1: BEACON every 500 ms and HEART every 200 ms (within 3 ms)',
  ],
  start: prev => {
    const p = clone(prev || stage3.solution());
    p.units.push(task('nav', 1, [c('planPath'), d(250)], { stack: 4096 }));
    p.units.push(task('mapper', 1, [c('allocFrame'), c('processFrame'), d(250)], { stack: 4096 }));
    return p;
  },
  solution: () => {
    const p = stage3.solution();
    p.units.push(task('nav', 1, [c('planPath'), d(250)], { stack: 3328 }));
    p.units.push(task('mapper', 1, [c('allocFrame'), c('processFrame'), c('freeFrame'), d(250)], { stack: 1536 }));
    return p;
  },
  check: K => {
    const mp = E_(K, 'processFrame').length, pl = E_(K, 'planPath').length, sp = S_(K, 'sampleSpectrometer').length;
    const mg = maxGap(S_(K, 'motorStep')), tl = S_(K, 'sendTelemetry'), tg = maxGap(tl), b = pinT(K, 'BEACON'), h = pinT(K, 'HEART');
    return [
      [mp >= 5, `${mp} frames`],
      [pl >= 4, `${pl} paths`],
      [K.heap >= 8192 - 2048, `${K.heap} B of heap free`],
      [K.m.ram <= 14500, `${K.m.ram} B of RAM`],
      [room(K) >= 128, `smallest free stack ${room(K)} B`],
      [sp >= 72 && sp <= 78, `${sp} samples`],
      [mg <= 11 && tg <= 105 && tl.length >= 13, `motor gap ${mg === Infinity ? '-' : mg} ms, telemetry gap ${tg === Infinity ? '-' : tg} ms, ${tl.length} packets`],
      [steady(b, 500, 2) && steady(h, 200, 6), seen(b) + ' / ' + seen(h)],
    ];
  },
  evidence: K => {
    const a = S_(K, 'allocFrame');
    if (K.heap >= 8192 - 2048 || !a.length) return [];
    const n = a.length - E_(K, 'freeFrame').length;
    return [{ unit: 'mapper', from: a[0], to: K.end - 1, label: `${n} frame buffers allocated and never freed, ${K.heap} B of 8192 B heap left` }];
  },
  bonus: B(92, 13024),
  briefing, reactions,
  diagnose: (K, res) => {
    if (!res[0][0] || !res[2][0]) return reactions.leak;
    if (!res[4][0]) return reactions.headroom;
    if (!res[3][0]) return reactions.budget;
    if (!res[5][0] || !res[6][0] || !res[7][0]) return reactions.hog;
    return reactions.fail;
  },
  hints, solutionNote,
  // Unit order: beacon, heart, motor, camera, telemetry, spectro, nav (index 6), mapper (index 7).
  wrong: [
    { name: 'mapper never frees (the original bug)', apply: p => { p.units[7].code.splice(2, 1); }, crash: 'pvPortMalloc' },
    { name: 'nav stack guessed at 3072', apply: p => { p.units[6].stack = 3072; }, crash: 'stack overflow' },
    { name: 'mapper stack 1024', apply: p => { p.units[7].stack = 1024; }, crash: 'stack overflow' },
    { name: 'frame freed before it is processed', apply: p => { p.units[7].code = [c('allocFrame'), c('freeFrame'), c('processFrame'), d(250)]; }, crash: 'use after free' },
    { name: 'frame freed twice', apply: p => { p.units[7].code = [c('allocFrame'), c('processFrame'), c('freeFrame'), c('freeFrame'), d(250)]; }, crash: 'double free' },
    { name: 'leak hidden by a slow loop', apply: p => { p.units[7].code = [c('allocFrame'), c('processFrame'), d(400)]; }, fails: [0, 2], says: 'leak' },
    { name: 'stacks sized exactly to the peak', apply: p => { p.units[6].stack = 3168; p.units[7].stack = 1368; }, fails: [4], says: 'headroom' },
    { name: 'stacks left at 4096', apply: p => { p.units[6].stack = 4096; p.units[7].stack = 4096; }, fails: [3], says: 'budget' },
    { name: 'nav above everything', apply: p => { p.units[6].prio = 5; }, fails: [6, 7], says: 'hog' },
  ],
  alts: [
    { name: 'tight margins', stars: 3, apply: p => { p.units[6].stack = 3296; p.units[7].stack = 1496; } },
    { name: 'nav keeps its 4096', stars: 2, apply: p => { p.units[6].stack = 4096; } },
    { name: 'slower loops', stars: 3, apply: p => { p.units[6].code[1] = d(400); p.units[7].code[3] = d(300); } },
  ],
  manual, realCode, quiz,
};
