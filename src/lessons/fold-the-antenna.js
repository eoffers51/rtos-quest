// Stage 9: software timers. A one-shot timer reset by every packet stows the antenna mast once per pass.
import { c, d, rc, si, trs, tst, task, E_, S_, maxGap, gapsOf, pinT, B } from '../kernel.js';
import { lesson as stage8 } from './direct-line.js';
import { manual, realCode, quiz, widgets } from './fold-the-antenna.content.js';
import { briefing, reactions, hints, solutionNote } from './fold-the-antenna.copy.js';

const clone = o => JSON.parse(JSON.stringify(o));
const steady = (a, period, min) => a.length >= min && gapsOf(a).every(x => Math.abs(x - period) <= 3);
const addAntenna = p => {
  p.objs.rx_q = { type: 'queue', len: 4, item: 32 };
  p.objs.stow_tmr = { type: 'timer', period: 200, auto: false, cb: 'onStow' };
  p.units.push({ kind: 'isr', name: 'onPacket', code: [si('rx_q')] });
};
const stats = K => {
  const pk = K.w.irq.onPacket || [], hp = E_(K, 'handlePacket');
  const ant = K.ev.filter(e => e.k === 'ant');
  const stows = ant.filter(e => e.v === 0).map(e => e.t);
  let deploys = 0, out = false;
  for (const e of ant) { if (e.v === 1 && !out) deploys++; out = e.v === 1; }
  const last = pk.filter((t, i) => !pk.some(x => x > t && x - t <= 150));
  // pair each packet with the first handlePacket() that finishes after it and is not already used: a call with no packet
  // behind it (for example one made from the timer callback) must not shift the pairing
  let j = 0; const done = pk.map(t => { while (j < hp.length && hp[j] < t) j++; return j < hp.length ? hp[j++] : undefined; });
  const used = new Set(done.filter(x => x !== undefined)), phantom = hp.filter(x => !used.has(x));
  return { pk, hp, ant, stows, deploys, last, done, phantom };
};

export const lesson = {
  id: 9, title: 'Fold the Antenna', topic: 'Software timers and the timer service task', file: 'main/rover_main.c',
  T: 1000, cores: 1, heap: 8192, pins: ['BEACON', 'HEART'],
  ops: ['gpio', 'call', 'delay', 'until', 'busy', 'send', 'recv', 'take', 'give', 'giveISR', 'sendISR', 'notifyGive', 'notifyGiveISR', 'notifyTake', 'tReset', 'tStop'],
  fns: ['stopMotors', 'checkThermals', 'deployAntenna', 'stowAntenna', 'handlePacket'],
  irqs: { onBump: [150, 152], onPacket: [100, 420, 500, 580] },
  goals: [
    'Uplink: every packet handled within 60 ms of arriving (4 of 4)',
    'Antenna: stowed once per pass, 180 to 250 ms after the last packet of each pass',
    'Mast: unfolds once per pass and stays out until the pass ends (2 unfolds in total)',
    'Still working from stages 7 and 8: no ISR longer than 1 ms, motors stopped within 3 ms of both impacts, a thermal check for each within 150 ms',
    'Still working from stage 6: no I2C collisions, IMU at least 45 reads, never more than 40 ms apart',
    'Still working from stage 5: all 10 samples transmitted, in order, none overwritten',
    'Still working from stage 4: mapper frees its frames, at least 3 frames processed and 2 paths planned in 1 s',
    'Still working from stage 3: spectrometer 47 to 53 samples started in 1 s',
    'Still working from stage 2: motor never more than 11 ms between steps, telemetry never more than 105 ms between packets, at least 9 sent',
    'Still working from stage 1: BEACON every 500 ms and HEART every 200 ms (within 3 ms)',
  ],
  start: prev => {
    const p = clone(prev || stage8.solution());
    addAntenna(p);
    p.units.push(task('antenna', 1, [rc('rx_q', -1), c('deployAntenna'), c('handlePacket'), d(250), c('stowAntenna')], { stack: 1792 }));
    p.units.push({ kind: 'timer', name: 'onStow', code: [c('stowAntenna')] });
    return p;
  },
  solution: () => {
    const p = stage8.solution();
    addAntenna(p);
    p.units.push(task('antenna', 1, [rc('rx_q', -1), c('deployAntenna'), trs('stow_tmr'), c('handlePacket')], { stack: 1792 }));
    p.units.push({ kind: 'timer', name: 'onStow', code: [c('stowAntenna')] });
    return p;
  },
  check: K => {
    const { pk, stows, deploys, last, done, phantom } = stats(K);
    const lat = pk.map((t, i) => done[i] === undefined ? -1 : done[i] - t);
    const stowLat = last.map(t => { const x = stows.find(v => v >= t); return x === undefined ? -1 : x - t; });
    const irq = K.w.irq.onBump || [];
    const st = E_(K, 'stopMotors'), ck = E_(K, 'checkThermals');
    const stopLat = irq.map(t => { const x = st.find(v => v >= t); return x === undefined ? -1 : x - t; });
    const ckLat = irq.map((t, i) => ck[i] === undefined ? -1 : ck[i] - t);
    const coll = K.w.coll || 0, im = S_(K, 'i2cReadIMU'), ids = K.w.sent || [], lost = K.w.lost || 0;
    const sp = S_(K, 'sampleSpectrometer').length;
    const mg = maxGap(S_(K, 'motorStep')), tl = S_(K, 'sendTelemetry'), tg = maxGap(tl), b = pinT(K, 'BEACON'), h = pinT(K, 'HEART');
    const mp = E_(K, 'processFrame').length, pl = E_(K, 'planPath').length;
    const f = x => x === Infinity ? '-' : x;
    return [
      [pk.length === 4 && lat.every(x => x >= 0 && x <= 60) && !phantom.length, `packet delays ${lat.join(', ')} ms (-1 = never)${phantom.length ? `, and handlePacket() ran ${phantom.length} time${phantom.length > 1 ? 's' : ''} with no packet` : ''}`],
      [stows.length === 2 && stowLat.every(x => x >= 180 && x <= 250), `${stows.length} stows, ${stowLat.join(', ')} ms after the last packets`],
      [deploys === 2, `${deploys} unfolds`],
      [K.stats.isrMax <= 1 && irq.length === 2 && stopLat.every(x => x >= 0 && x <= 3) && ck.length >= 2 && ckLat.every(x => x >= 0 && x <= 150), `longest ISR ${K.stats.isrMax} ms, stop delays ${stopLat.join(', ')} ms, thermal checks ${ckLat.join(', ')} ms after the impacts`],
      [coll === 0 && im.length >= 45 && maxGap(im) <= 40, `${coll} collisions, ${im.length} IMU reads, longest gap ${f(maxGap(im))} ms`],
      [lost === 0 && ids.length === 10 && ids.every((v, i) => v === i), `${ids.length} of 10 delivered`],
      [K.heap >= 6144 && mp >= 3 && pl >= 2, `${mp} frames, ${pl} paths, ${K.heap} B of heap free`],
      [sp >= 47 && sp <= 53, `${sp} samples`],
      [mg <= 11 && tg <= 105 && tl.length >= 9, `motor gap ${f(mg)} ms, telemetry gap ${f(tg)} ms, ${tl.length} packets`],
      [steady(b, 500, 2) && steady(h, 200, 5), `BEACON ${b.length} toggles, HEART ${h.length} toggles`],
    ];
  },
  evidence: K => {
    const pk = K.w.irq.onPacket || [], hp = E_(K, 'handlePacket'), ant = K.ev.filter(e => e.k === 'ant');
    const last = pk.filter((t, i) => i === pk.length - 1 || pk[i + 1] - t > 150);
    if (K.crash) return /ISR/.test(K.crash.msg) ? [{ unit: 'onPacket', from: pk[0], to: K.crash.t, label: K.crash.msg.split('.')[0] }] : [];
    const { done, phantom } = stats(K);
    const bad = pk.findIndex((t, i) => done[i] === undefined || done[i] - t > 60);
    if (bad >= 0) return [{ unit: 'antenna', from: pk[bad], to: done[bad] === undefined ? K.end - 1 : done[bad], label: `packet at ${pk[bad]} ms waited ${done[bad] === undefined ? 'forever' : done[bad] - pk[bad] + ' ms'}: antenna was asleep, not at xQueueReceive` }];
    if (phantom.length) { const u = K.units.find(x => x.name !== 'antenna' && x.code.some(i => i.fn === 'handlePacket')) || K.units.find(x => x.code.some(i => i.fn === 'handlePacket'));
      return [{ unit: u ? u.name : 'antenna', from: Math.max(0, phantom[0] - 4), to: phantom[0], label: `handlePacket() ran at ${phantom[0]} ms with no packet to handle` }]; }
    const stows = ant.filter(e => e.v === 0).map(e => e.t);
    const m = stows.find(s => { const p = pk.filter(t => t <= s).pop(), n = pk.find(t => t > s); return p !== undefined && n !== undefined && n - p <= 150; });
    if (m !== undefined) { const p = pk.filter(t => t <= m).pop(), n = pk.find(t => t > m); return [{ unit: 'antenna', from: m, to: n, label: `stowed at ${m} ms, ${m - p} ms after a packet, and packet at ${n} ms followed: it must stay out during a pass` }]; }
    for (const l of last) { const s = stows.find(x => x >= l); if (s === undefined || s - l < 180 || s - l > 250) return [{ unit: 'antenna', from: l, to: Math.min(l + 250, K.end - 1), label: s === undefined ? `last packet at ${l} ms, antenna never stowed` : `last packet at ${l} ms, antenna stowed ${s - l} ms later (want 180 to 250)` }]; }
    const extra = stows.length > last.length ? stows[stows.length - 1] : undefined;
    if (extra !== undefined) return [{ unit: 'onStow', from: extra, to: extra + 1, label: `${stows.length} stows for ${last.length} passes: stowAntenna() ran again at ${extra} ms with nothing to stow` }];
    if (!ant.some(e => e.v === 1)) return [{ unit: 'antenna', from: pk[0], to: hp[0] || pk[0] + 10, label: 'deployAntenna() was never called: the mast stayed folded' }];
    return [];
  },
  bonus: B(99, 21896),
  briefing, reactions,
  diagnose: (K, res) => {
    const tm = K.units.find(u => u.name === 'onStow');
    const { deploys, stows } = stats(K);
    if (K.crash && /called inside an ISR/.test(K.crash.msg)) return reactions.isrBlock;
    if (K.crash && /timer callback/.test(K.crash.msg)) return reactions.timerBlocks;
    if (K.crash && /stack overflow/.test(K.crash.msg)) return reactions.stack;
    if (K.crash && /task_wdt/.test(K.crash.msg)) {
      const heavy = tm && tm.code.some(i => (i.op === 'call' && i.fn !== 'stowAntenna' && i.fn !== 'deployAntenna') || i.op === 'busy');
      return heavy ? reactions.heavyCallback : reactions.busyLoop;
    }
    if (!res[0][0]) return stats(K).phantom.length ? reactions.phantom : reactions.blocked;
    if (!res[2][0] && deploys > 2) return reactions.foldsMidPass;
    if (!res[2][0] && deploys < 2 && stows.length > 0) return reactions.noDeploy;
    if (!res[1][0] && stows.length === 0) return reactions.neverStows;
    if (!res[1][0] && stows.length > 2) return reactions.repeatStow;
    if (!res[1][0]) return reactions.stowTiming;
    if (!res[8][0] || !res[4][0] || !res[3][0]) return reactions.hog;
    if ([5, 6, 7, 9].some(i => !res[i][0])) return reactions.regress;
    return reactions.fail;
  },
  hints, solutionNote,
  // Unit order: ... bumper (13), onPacket (14, isr), antenna (15, task), onStow (16, timer callback).
  wrong: [
    { name: 'the antenna sleeps instead of using a timer (start)', apply: p => { p.units[15].code = [rc('rx_q', -1), c('deployAntenna'), c('handlePacket'), d(250), c('stowAntenna')]; }, fails: [0, 1, 2], says: 'blocked' },
    { name: 'timer period 50 ms', apply: p => { p.objs.stow_tmr.period = 50; }, fails: [1, 2], says: 'foldsMidPass' },
    { name: 'antenna also stows itself', apply: p => { p.units[15].code.push(c('stowAntenna')); }, fails: [1, 2], says: 'foldsMidPass' },
    { name: 'timer period 150 ms', apply: p => { p.objs.stow_tmr.period = 150; }, fails: [1], says: 'stowTiming' },
    { name: 'timer period 260 ms', apply: p => { p.objs.stow_tmr.period = 260; }, fails: [1], says: 'stowTiming' },
    { name: 'timer period 300 ms', apply: p => { p.objs.stow_tmr.period = 300; }, fails: [1], says: 'stowTiming' },
    { name: 'timer period 500 ms', apply: p => { p.objs.stow_tmr.period = 500; }, fails: [1, 2], says: 'neverStows' },
    { name: 'timer stopped, not reset', apply: p => { p.units[15].code[2] = tst('stow_tmr'); }, fails: [1, 2], says: 'neverStows' },
    { name: 'timer never started', apply: p => { p.units[15].code.splice(2, 1); }, fails: [1, 2], says: 'neverStows' },
    { name: 'auto-reload timer', apply: p => { p.objs.stow_tmr.auto = true; }, fails: [1], says: 'repeatStow' },
    { name: 'callback also handles a packet', apply: p => { p.units[16].code = [c('stowAntenna'), c('handlePacket')]; }, fails: [0], says: 'phantom' },
    { name: 'callback stows twice', apply: p => { p.units[16].code = [c('stowAntenna'), c('stowAntenna')]; }, fails: [1], says: 'repeatStow' },
    { name: 'task never unfolds the mast', apply: p => { p.units[15].code = [rc('rx_q', -1), trs('stow_tmr'), c('handlePacket')]; }, fails: [2], says: 'noDeploy' },
    { name: 'xTimerReset called in the ISR', apply: p => { p.units[14].code = [si('rx_q'), trs('stow_tmr')]; p.units[15].code.splice(2, 1); }, crash: 'called inside an ISR' },
    { name: 'callback waits', apply: p => { p.units[16].code = [d(10), c('stowAntenna')]; }, crash: 'timer callback' },
    { name: 'callback calls a blocking driver', apply: p => { p.units[16].code = [c('stowAntenna'), c('transmit')]; }, crash: 'timer callback' },
    { name: 'callback does heavy work', apply: p => { p.units[16].code = [c('stowAntenna'), c('planPath')]; }, crash: 'task_wdt' },
    { name: 'antenna polls the queue', apply: p => { p.units[15].code = [rc('rx_q', 0), c('deployAntenna'), trs('stow_tmr'), c('handlePacket'), d(5)]; }, crash: 'task_wdt' },
    { name: 'antenna above the motor', apply: p => { p.units[15].prio = 3; }, fails: [8], says: 'hog' },
    { name: 'antenna stack 1024', apply: p => { p.units[15].stack = 1024; }, crash: 'stack overflow' },
  ],
  alts: [
    { name: 'timer period 190', stars: 3, apply: p => { p.objs.stow_tmr.period = 190; } },
    { name: 'timer period 230', stars: 3, apply: p => { p.objs.stow_tmr.period = 230; } },
    { name: 'timer period 240', stars: 3, apply: p => { p.objs.stow_tmr.period = 240; } },
    { name: 'reset after handling', stars: 3, apply: p => { p.units[15].code = [rc('rx_q', -1), c('deployAntenna'), c('handlePacket'), trs('stow_tmr')]; } },
    { name: 'antenna stack 1668', stars: 3, apply: p => { p.units[15].stack = 1668; } },
    { name: 'antenna stack 4096', stars: 2, apply: p => { p.units[15].stack = 4096; } },
    { name: 'antenna stack 2048', stars: 2, apply: p => { p.units[15].stack = 2048; } },
    { name: 'queue length 1', stars: 3, apply: p => { p.objs.rx_q.len = 1; } },
  ],
  widgets, manual, realCode, quiz,
};
