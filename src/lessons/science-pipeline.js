// Stage 5: queues. Builds on stage 4 and adds the mass spectrometer's science pipeline: a fast reader and a slow radio decoupled by a queue.
import { c, d, task, sn, rc, pinT, gapsOf, maxGap, S_, E_, B } from '../kernel.js';
import { lesson as stage4 } from './every-byte-counts.js';
import { manual, realCode, quiz } from './science-pipeline.content.js';
import { briefing, reactions, hints, solutionNote } from './science-pipeline.copy.js';

const clone = o => JSON.parse(JSON.stringify(o));
const steady = (a, period, min) => a.length >= min && gapsOf(a).every(x => Math.abs(x - period) <= 3);

export const lesson = {
  id: 5, title: 'Science Pipeline', topic: 'Queues', file: 'main/rover_main.c',
  T: 1000, cores: 1, heap: 8192, pins: ['BEACON', 'HEART'], ops: ['gpio', 'call', 'delay', 'until', 'busy', 'send', 'recv'],
  fns: ['readSample', 'transmit'],
  goals: [
    'Instrument: no sample overwritten before it was read',
    'Uplink: all 10 samples transmitted, in order, none missing',
    'Queue: no sample dropped because the queue was full',
    'Still working from stage 4: mapper frees its frames, at least 3 frames processed and 2 paths planned in 1 s',
    'Still working from stage 3: spectrometer 47 to 53 samples started in 1 s',
    'Still working from stage 2: motor never more than 11 ms between steps, telemetry never more than 105 ms between packets, at least 9 sent',
    'Still working from stage 1: BEACON every 500 ms and HEART every 200 ms (within 3 ms)',
  ],
  start: prev => {
    const p = clone(prev || stage4.solution());
    p.objs = { samples: { type: 'queue', len: 1, item: 128 } };
    p.units.push(task('science', 2, [c('readSample'), c('transmit')], { stack: 2048 }));
    return p;
  },
  solution: () => {
    const p = stage4.solution();
    p.objs = { samples: { type: 'queue', len: 3, item: 128 } };
    p.units.push(task('science', 2, [c('readSample'), sn('samples', -1)], { stack: 1280 }));
    p.units.push(task('radio', 1, [rc('samples', -1), c('transmit')], { stack: 2048 }));
    return p;
  },
  check: K => {
    const ids = K.w.sent || [], lost = K.w.lost || 0, sp = S_(K, 'sampleSpectrometer').length;
    const mg = maxGap(S_(K, 'motorStep')), tl = S_(K, 'sendTelemetry'), tg = maxGap(tl), b = pinT(K, 'BEACON'), h = pinT(K, 'HEART');
    const mp = E_(K, 'processFrame').length, pl = E_(K, 'planPath').length;
    const f = x => x === Infinity ? '-' : x;
    return [
      [lost === 0, `${lost} samples overwritten`],
      [ids.length === 10 && ids.every((v, i) => v === i), `${ids.length} of 10 delivered`],
      [K.stats.sendFail === 0, `${K.stats.sendFail} dropped`],
      [K.heap >= 6144 && mp >= 3 && pl >= 2, `${mp} frames, ${pl} paths, ${K.heap} B of heap free`],
      [sp >= 47 && sp <= 53, `${sp} samples`],
      [mg <= 11 && tg <= 105 && tl.length >= 9, `motor gap ${f(mg)} ms, telemetry gap ${f(tg)} ms, ${tl.length} packets`],
      [steady(b, 500, 2) && steady(h, 200, 5), `BEACON ${b.length} toggles, HEART ${h.length} toggles`],
    ];
  },
  evidence: K => {
    const lost = K.w.lost || 0, marks = K.ev.filter(e => e.k === 'mark' && e.row === '!').map(e => e.t);
    const drops = K.w.drops || [];
    if (!marks.length && drops.length) return [{ unit: 'science', from: Math.max(0, drops[0] - 25), to: drops[0], label: `${drops.length} sample${drops.length > 1 ? 's' : ''} dropped at ${drops[0]} ms: xQueueSend() found the queue full and did not wait` }];
    if (!marks.length) {
      const ms = S_(K, 'motorStep'); let at = -1;
      for (let i = 1; i < ms.length; i++) if (ms[i] - ms[i - 1] > 11) { at = i; break; }
      return at < 0 ? [] : [{ unit: 'motor', from: ms[at - 1], to: ms[at], label: `motor waited ${ms[at] - ms[at - 1]} ms between steps (limit 11): a task above it held the CPU` }];
    }
    const tb = marks[0], before = E_(K, 'readSample').filter(t => t <= tb), from = before.length ? before[before.length - 1] : 0;
    if (lost) {
      const sci = K.units.find(u => u.name === 'science'), busy = sci && sci.code.some(i => i.fn === 'transmit');
      const cam = K.units.find(u => u.name === 'camera'), q = K.objs.samples;
      const why = sci && cam && sci.base <= cam.base ? 'reader not above the camera, so it reached the instrument late' : q && q.len < 2 ? 'reader stuck in xQueueSend(), the queue was full' : 'reader stuck in xQueueSend(), the radio fell behind';
      const tx0 = S_(K, 'transmit').filter(t => t <= tb), win = busy && tx0.length ? tx0[tx0.length - 1] + 48 : tb;
      return [{ unit: 'science', from, to: Math.max(tb, win), label: `${lost} sample${lost > 1 ? 's' : ''} lost (first at ${tb} ms): ${busy ? 'reader busy in transmit()' : why}` }];
    }
    const tx = S_(K, 'transmit');
    return [{ unit: 'radio', from: tx.length ? tx[0] : 0, to: tb, label: `transmit() sent an empty packet at ${tb} ms: x holds no sample` }];
  },
  bonus: B(92, 16432),
  briefing, reactions,
  diagnose: (K, res) => {
    const sci = K.units.find(u => u.name === 'science'), cam = K.units.find(u => u.name === 'camera'), radio = K.units.find(u => u.name === 'radio');
    if (!res[0][0]) {
      if (sci.code.some(i => i.fn === 'transmit')) return reactions.oneTask;
      if (sci.base <= cam.base) return reactions.lowPrio;
      if (K.objs.samples && K.objs.samples.len < 2) return reactions.shortQueue;
      return reactions.backlog;
    }
    if (!res[2][0]) return reactions.dropped;
    if (!res[1][0]) return (!radio || !radio.code.some(i => i.op === 'recv')) ? reactions.empty : reactions.dropped;
    if (!res[3][0] || !res[4][0] || !res[5][0] || !res[6][0]) return reactions.hog;
    return reactions.fail;
  },
  hints, solutionNote,
  // Unit order: beacon, heart, motor, camera, telemetry, spectro, nav, mapper, science (8), radio (9).
  wrong: [
    { name: 'one task does both (the original bug)', apply: p => { p.units.pop(); p.units[8].code = [c('readSample'), c('transmit')]; p.units[8].stack = 2048; }, fails: [0, 1], says: 'oneTask' },
    { name: 'queue length 1', apply: p => { p.objs.samples.len = 1; }, fails: [0, 1], says: 'shortQueue' },
    { name: 'reader at default priority', apply: p => { p.units[8].prio = 1; }, fails: [0, 1], says: 'lowPrio' },
    { name: 'radio throttled', apply: p => { p.units[9].code.push(d(100)); }, fails: [0, 1], says: 'backlog' },
    { name: 'drop when full', apply: p => { p.units[8].code[1] = sn('samples', 0); }, fails: [1, 2], says: 'dropped' },
    { name: 'radio never receives', apply: p => { p.units[9].code.shift(); }, fails: [1], says: 'empty' },
    { name: 'radio above the motor', apply: p => { p.units[9].prio = 5; }, fails: [5], says: 'hog' },
    { name: 'radio stack 1536', apply: p => { p.units[9].stack = 1536; }, crash: 'stack overflow' },
    { name: 'reader stack 1024', apply: p => { p.units[8].stack = 1024; }, crash: 'stack overflow' },
  ],
  alts: [
    { name: 'queue length 2', stars: 3, apply: p => { p.objs.samples.len = 2; } },
    { name: 'queue length 4', stars: 3, apply: p => { p.objs.samples.len = 4; } },
    { name: 'queue length 5', stars: 2, apply: p => { p.objs.samples.len = 5; } },
    { name: 'queue length 20', stars: 2, apply: p => { p.objs.samples.len = 20; } },
    { name: 'science stack 2048', stars: 2, apply: p => { p.units[8].stack = 2048; } },
    { name: 'polling recv with timeout 0', stars: 2, apply: p => { p.units[9].code[0] = rc('samples', 0); } },
    { name: 'reader priority 5', stars: 3, apply: p => { p.units[8].prio = 5; } },
    { name: 'radio priority 2', stars: 3, apply: p => { p.units[9].prio = 2; } },
  ],
  manual, realCode, quiz,
};
