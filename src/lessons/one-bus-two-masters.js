// Stage 6: mutexes. Builds on stage 5 and adds an IMU and a thermometer that share one I2C bus.
import { c, d, un, tk, gv, task, pinT, gapsOf, maxGap, S_, E_, B } from '../kernel.js';
import { lesson as stage5 } from './science-pipeline.js';
import { manual, realCode, quiz, widgets } from './one-bus-two-masters.content.js';
import { briefing, reactions, hints, solutionNote } from './one-bus-two-masters.copy.js';

const clone = o => JSON.parse(JSON.stringify(o));
const steady = (a, period, min) => a.length >= min && gapsOf(a).every(x => Math.abs(x - period) <= 3);

export const lesson = {
  id: 6, title: 'One Bus, Two Masters', topic: 'Race conditions, mutexes', file: 'main/rover_main.c',
  T: 1000, cores: 1, heap: 8192, pins: ['BEACON', 'HEART'], ops: ['gpio', 'call', 'delay', 'until', 'busy', 'send', 'recv', 'take', 'give'],
  fns: ['i2cReadIMU', 'i2cReadThermo'],
  chartGrid: { unit: 'imu', period: 20 },
  goals: [
    'I2C bus: never two transactions on the bus at the same time',
    'IMU: at least 45 reads in 1 s, never more than 40 ms between reads',
    'Thermometer: at least 8 reads in 1 s, never more than 150 ms between reads',
    'Still working from stage 5: all 10 samples transmitted, in order, none overwritten',
    'Still working from stage 4: mapper frees its frames, at least 3 frames processed and 2 paths planned in 1 s',
    'Still working from stage 3: spectrometer 47 to 53 samples started in 1 s',
    'Still working from stage 2: motor never more than 11 ms between steps, telemetry never more than 105 ms between packets, at least 9 sent',
    'Still working from stage 1: BEACON every 500 ms and HEART every 200 ms (within 3 ms)',
  ],
  start: prev => {
    const p = clone(prev || stage5.solution());
    p.objs.i2c_lock = { type: 'mutex' };
    p.units.push(task('imu', 2, [c('i2cReadIMU'), un(20)], { stack: 1280 }));
    p.units.push(task('thermo', 2, [c('i2cReadThermo'), d(100)], { stack: 1280 }));
    return p;
  },
  solution: () => {
    const p = stage5.solution();
    p.objs.i2c_lock = { type: 'mutex' };
    p.units.push(task('imu', 2, [tk('i2c_lock', -1), c('i2cReadIMU'), gv('i2c_lock'), un(20)], { stack: 1280 }));
    p.units.push(task('thermo', 2, [tk('i2c_lock', -1), c('i2cReadThermo'), gv('i2c_lock'), d(100)], { stack: 1280 }));
    return p;
  },
  check: K => {
    const coll = K.w.coll || 0, im = S_(K, 'i2cReadIMU'), th = S_(K, 'i2cReadThermo'), ids = K.w.sent || [], lost = K.w.lost || 0;
    const sp = S_(K, 'sampleSpectrometer').length;
    const mg = maxGap(S_(K, 'motorStep')), tl = S_(K, 'sendTelemetry'), tg = maxGap(tl), b = pinT(K, 'BEACON'), h = pinT(K, 'HEART');
    const mp = E_(K, 'processFrame').length, pl = E_(K, 'planPath').length;
    const f = x => x === Infinity ? '-' : x;
    return [
      [coll === 0, `${coll} collisions`],
      [im.length >= 45 && maxGap(im) <= 40, `${im.length} reads, longest gap ${f(maxGap(im))} ms`],
      [th.length >= 8 && maxGap(th) <= 150, `${th.length} reads, longest gap ${f(maxGap(th))} ms`],
      [lost === 0 && ids.length === 10 && ids.every((v, i) => v === i), `${ids.length} of 10 delivered`],
      [K.heap >= 6144 && mp >= 3 && pl >= 2, `${mp} frames, ${pl} paths, ${K.heap} B of heap free`],
      [sp >= 47 && sp <= 53, `${sp} samples`],
      [mg <= 11 && tg <= 105 && tl.length >= 9, `motor gap ${f(mg)} ms, telemetry gap ${f(tg)} ms, ${tl.length} packets`],
      [steady(b, 500, 2) && steady(h, 200, 5), `BEACON ${b.length} toggles, HEART ${h.length} toggles`],
    ];
  },
  evidence: K => {
    const marks = K.ev.filter(e => e.k === 'mark' && e.row === '!').map(e => e.t);
    if (K.diag.length) {
      const nm = K.diag[0].split(' ')[0], e = E_(K, nm === 'imu' ? 'i2cReadIMU' : 'i2cReadThermo');
      return [{ unit: nm, from: e.length ? e[e.length - 1] : 0, to: K.end - 1, label: K.diag[0] }];
    }
    if (K.w.coll) {
      const tc = marks[0], s = S_(K, 'i2cReadThermo').filter(t => t <= tc), st = s[s.length - 1], en = E_(K, 'i2cReadThermo').find(t => t > st);
      const ev = [{ unit: 'thermo', from: st, to: en, label: `collision at ${tc} ms: imu and thermo on the bus together (${K.w.coll} in 1 s)` }];
      const is = S_(K, 'i2cReadIMU').filter(t => t <= tc), ist = is[is.length - 1], ien = ist === undefined ? undefined : E_(K, 'i2cReadIMU').find(t => t > ist);
      if (ist !== undefined && ien !== undefined && ien >= tc) ev.push({ unit: 'imu', from: ist, to: ien, label: 'imu read' });
      return ev;
    }
    const im = S_(K, 'i2cReadIMU'); let bi = -1, bg = 0;
    for (let i = 1; i < im.length; i++) if (im[i] - im[i - 1] > bg) { bg = im[i] - im[i - 1]; bi = i; }
    if (bg > 40) return [{ unit: 'imu', from: im[bi - 1], to: im[bi], label: `${bg} ms between IMU reads: imu waited for the bus lock` }];
    return [];
  },
  bonus: B(97, 18792),
  briefing, reactions,
  diagnose: (K, res) => {
    const imu = K.units.find(u => u.name === 'imu'), th = K.units.find(u => u.name === 'thermo');
    const uses = u => !!u && u.code.some(i => i.op === 'take');
    const across = u => { if (!u) return false; const a = u.code.findIndex(i => i.op === 'take'), z = u.code.findIndex(i => i.op === 'give');
      return a >= 0 && z > a && u.code.slice(a, z).some(i => i.op === 'delay' || i.op === 'until'); };
    if (!res[0][0]) return uses(imu) || uses(th) ? reactions.oneSided : reactions.race;
    if (K.diag.length) return reactions.neverReleased;
    if (!res[1][0] || !res[2][0]) return across(imu) || across(th) ? reactions.heldTooLong : reactions.missing;
    if (!res[3][0] || !res[4][0] || !res[5][0] || !res[6][0] || !res[7][0]) return reactions.hog;
    return reactions.fail;
  },
  hints, solutionNote,
  // Unit order: beacon, heart, motor, camera, telemetry, spectro, nav, mapper, science, radio, imu (10), thermo (11).
  wrong: [
    { name: 'no locking (the original bug)', apply: p => { p.units[10].code = [c('i2cReadIMU'), un(20)]; p.units[11].code = [c('i2cReadThermo'), d(100)]; }, fails: [0], says: 'race' },
    { name: 'only the IMU task locks', apply: p => { p.units[11].code = [c('i2cReadThermo'), d(100)]; }, fails: [0], says: 'oneSided' },
    { name: 'only the thermometer task locks', apply: p => { p.units[10].code = [c('i2cReadIMU'), un(20)]; }, fails: [0], says: 'oneSided' },
    { name: 'thermometer never gives the lock back', apply: p => { p.units[11].code = [tk('i2c_lock', -1), c('i2cReadThermo'), d(100)]; }, fails: [1, 2], says: 'neverReleased' },
    { name: 'IMU never gives the lock back', apply: p => { p.units[10].code = [tk('i2c_lock', -1), c('i2cReadIMU'), un(20)]; }, fails: [1, 2], says: 'neverReleased' },
    { name: 'lock held across the delay', apply: p => { p.units[11].code = [tk('i2c_lock', -1), c('i2cReadThermo'), d(100), gv('i2c_lock')]; }, fails: [1], says: 'heldTooLong' },
    { name: 'both tasks spin on the lock', apply: p => { p.units[10].code[0] = tk('i2c_lock', 0); p.units[11].code[0] = tk('i2c_lock', 0); }, fails: [6], says: 'hog' },
    { name: 'thermometer task deleted', apply: p => { p.units.pop(); }, fails: [2], says: 'missing' },
    { name: 'IMU stack 1024', apply: p => { p.units[10].stack = 1024; }, crash: 'stack overflow' },
    { name: 'thermo stack 1024', apply: p => { p.units[11].stack = 1024; }, crash: 'stack overflow' },
  ],
  alts: [
    { name: 'stacks 1200', stars: 3, apply: p => { p.units[10].stack = 1200; p.units[11].stack = 1200; } },
    { name: 'stacks 1536', stars: 2, apply: p => { p.units[10].stack = 1536; p.units[11].stack = 1536; } },
    { name: 'one stack 1536', stars: 2, apply: p => { p.units[10].stack = 1536; } },
    { name: 'stacks 4096', stars: 2, apply: p => { p.units[10].stack = 4096; p.units[11].stack = 4096; } },
    { name: 'thermo priority 1', stars: 3, apply: p => { p.units[11].prio = 1; } },
    { name: 'thermometer every 50 ms', stars: 3, apply: p => { p.units[11].code[3] = d(50); } },
    { name: 'take with a 50 ms timeout', stars: 3, apply: p => { p.units[10].code[0] = tk('i2c_lock', 50); p.units[11].code[0] = tk('i2c_lock', 50); } },
    { name: 'one task reads both devices', stars: 2, apply: p => { p.units.pop(); p.units[10].code = [c('i2cReadIMU'), c('i2cReadThermo'), un(20)]; } },
  ],
  widgets, manual, realCode, quiz,
};
