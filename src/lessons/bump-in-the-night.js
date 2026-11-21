// Stage 7: interrupts, binary semaphores and deferred work. Builds on stage 6 and adds a bumper ISR.
import { c, tk, gi, task, pinT, gapsOf, maxGap, S_, E_, B } from '../kernel.js';
import { lesson as stage6 } from './one-bus-two-masters.js';
import { manual, realCode, quiz, widgets } from './bump-in-the-night.content.js';
import { briefing, reactions, hints, solutionNote } from './bump-in-the-night.copy.js';

const clone = o => JSON.parse(JSON.stringify(o));
const steady = (a, period, min) => a.length >= min && gapsOf(a).every(x => Math.abs(x - period) <= 3);

export const lesson = {
  id: 7, title: 'Bump in the Night', topic: 'Interrupts, semaphores, deferred work', file: 'main/rover_main.c',
  T: 1000, cores: 1, heap: 8192, pins: ['BEACON', 'HEART'], ops: ['gpio', 'call', 'delay', 'until', 'busy', 'send', 'recv', 'take', 'give', 'giveISR'],
  fns: ['stopMotors', 'checkThermals'],
  irqs: { onBump: [150, 420, 703] },   // the third bump lands while higher tasks are busy: a stop left to a priority 1 task is late there
  chartGrid: { unit: 'motor', period: 10 },
  goals: [
    'Interrupt handler: no ISR runs longer than 1 ms',
    'Safety: motors stopped within 3 ms of every bump (3 of 3)',
    'Follow-up: thermals checked within 100 ms of every bump',
    'Still working from stage 6: no I2C collisions, IMU at least 45 reads, never more than 40 ms apart',
    'Still working from stage 5: all 10 samples transmitted, in order, none overwritten',
    'Still working from stage 4: mapper frees its frames, at least 3 frames processed and 2 paths planned in 1 s',
    'Still working from stage 3: spectrometer 47 to 53 samples started in 1 s',
    'Still working from stage 2: motor never more than 11 ms between steps, telemetry never more than 105 ms between packets, at least 9 sent',
    'Still working from stage 1: BEACON every 500 ms and HEART every 200 ms (within 3 ms)',
  ],
  start: prev => {
    const p = clone(prev || stage6.solution());
    p.objs.bump_sem = { type: 'binary' };
    p.units.push({ kind: 'isr', name: 'onBump', code: [c('stopMotors'), c('checkThermals')] });
    return p;
  },
  solution: () => {
    const p = stage6.solution();
    p.objs.bump_sem = { type: 'binary' };
    p.units.push({ kind: 'isr', name: 'onBump', code: [c('stopMotors'), gi('bump_sem')] });
    p.units.push(task('bumper', 1, [tk('bump_sem', -1), c('checkThermals')], { stack: 1280 }));
    return p;
  },
  check: K => {
    const irq = K.w.irq.onBump || [];
    const lat = (a, strict) => irq.map(t => { const x = a.find(v => strict ? v > t : v >= t); return x === undefined ? -1 : x - t; });
    const stopLat = lat(E_(K, 'stopMotors'), false), ckLat = lat(E_(K, 'checkThermals'), true);
    const coll = K.w.coll || 0, im = S_(K, 'i2cReadIMU'), ids = K.w.sent || [], lost = K.w.lost || 0;
    const sp = S_(K, 'sampleSpectrometer').length;
    const mg = maxGap(S_(K, 'motorStep')), tl = S_(K, 'sendTelemetry'), tg = maxGap(tl), b = pinT(K, 'BEACON'), h = pinT(K, 'HEART');
    const mp = E_(K, 'processFrame').length, pl = E_(K, 'planPath').length;
    const f = x => x === Infinity ? '-' : x;
    return [
      [K.stats.isrMax <= 1, `longest ISR ${K.stats.isrMax} ms`],
      [irq.length === 3 && stopLat.every(x => x >= 0 && x <= 3), `stop delays ${stopLat.join(', ')} ms`],
      [irq.length === 3 && ckLat.every(x => x >= 0 && x <= 100), `thermal check ${ckLat.join(', ')} ms after the bumps`],
      [coll === 0 && im.length >= 45 && maxGap(im) <= 40, `${coll} collisions, ${im.length} IMU reads, longest gap ${f(maxGap(im))} ms`],
      [lost === 0 && ids.length === 10 && ids.every((v, i) => v === i), `${ids.length} of 10 delivered`],
      [K.heap >= 6144 && mp >= 3 && pl >= 2, `${mp} frames, ${pl} paths, ${K.heap} B of heap free`],
      [sp >= 47 && sp <= 53, `${sp} samples`],
      [mg <= 11 && tg <= 105 && tl.length >= 9, `motor gap ${f(mg)} ms, telemetry gap ${f(tg)} ms, ${tl.length} packets`],
      [steady(b, 500, 2) && steady(h, 200, 5), `BEACON ${b.length} toggles, HEART ${h.length} toggles`],
    ];
  },
  evidence: K => {
    const irq = K.w.irq.onBump || [], t0 = irq[0] === undefined ? 0 : irq[0];
    const late = (a, lim) => { for (let i = 1; i < a.length; i++) if (a[i] - a[i - 1] > lim) return [a[i - 1], a[i]]; return null; };
    if (K.crash) return /ISR/.test(K.crash.msg) ? [{ unit: 'onBump', from: t0, to: K.crash.t, label: K.crash.msg.split('.')[0] }] : [];
    const mg = late(S_(K, 'motorStep'), 11), tg = late(S_(K, 'sendTelemetry'), 105);
    if (K.stats.isrMax > 1) { const g = mg || [t0, t0 + K.stats.isrMax];
      return [{ unit: 'onBump', from: t0, to: t0 + K.stats.isrMax, label: `ISR ran ${K.stats.isrMax} ms: motor steps ${g[1] - g[0]} ms apart` }]; }
    if (mg) return [{ unit: 'motor', from: mg[0], to: mg[1], label: `${mg[1] - mg[0]} ms between motor steps: the bump follow-up ran above the motor task` }];
    if (tg) return [{ unit: 'telemetry', from: tg[0], to: tg[1], label: `${tg[1] - tg[0]} ms between telemetry packets: the bump follow-up shared priority 2 with telemetry` }];
    const st = E_(K, 'stopMotors'), miss = irq.find(t => !st.some(x => x >= t && x <= t + 3));
    if (miss !== undefined) return [{ unit: 'onBump', from: miss, to: miss + 3, label: `bump at ${miss} ms: stopMotors() did not run within 3 ms` }];
    const ck = E_(K, 'checkThermals'), m2 = irq.find(t => !ck.some(x => x > t && x <= t + 100));
    if (m2 !== undefined) return [{ unit: 'bumper', from: m2, to: Math.min(m2 + 100, K.end - 1), label: `bump at ${m2} ms: no thermal check within 100 ms` }];
    return [];
  },
  bonus: B(99, 20296),
  briefing, reactions,
  diagnose: (K, res) => {
    if (K.crash && /called inside an ISR/.test(K.crash.msg)) return reactions.isrBlock;
    if (K.crash && /Cache disabled/.test(K.crash.msg)) return reactions.isrFlash;
    if (K.crash && /stack overflow/.test(K.crash.msg)) return reactions.stack;
    if (K.crash && /task_wdt/.test(K.crash.msg)) return reactions.busyLoop;
    if (!res[0][0]) return reactions.slowIsr;
    if (!res[1][0]) return K.units.some(u => u.kind === 'task' && u.code.some(i => i.fn === 'stopMotors')) ? reactions.lateStop : reactions.noStop;
    if (!res[2][0]) return reactions.neverWakes;
    if (!res[7][0]) return reactions.hog;
    if ([3, 4, 5, 6, 8].some(i => !res[i][0])) return reactions.regress;
    return reactions.fail;
  },
  hints, solutionNote,
  // Unit order: ... imu (10), thermo (11), onBump (12, isr), bumper (13, task).
  wrong: [
    { name: 'work still in the ISR (the original bug)', apply: p => { p.units[12].code = [c('stopMotors'), c('checkThermals')]; }, fails: [0, 7], says: 'slowIsr' },
    { name: 'bumper above the motor', apply: p => { p.units[13].prio = 4; }, fails: [7], says: 'hog' },
    { name: 'bumper at priority 3', apply: p => { p.units[13].prio = 3; }, fails: [7], says: 'hog' },
    { name: 'bumper shares priority with telemetry', apply: p => { p.units[13].prio = 2; }, fails: [7], says: 'hog' },
    { name: 'semaphore never given', apply: p => { p.units[12].code = [c('stopMotors')]; }, fails: [2], says: 'neverWakes' },
    { name: 'stop moved into the task', apply: p => { p.units[12].code = [gi('bump_sem')]; p.units[13].code = [tk('bump_sem', -1), c('stopMotors'), c('checkThermals')]; }, fails: [1], says: 'lateStop' },
    { name: 'forgot to stop the motors', apply: p => { p.units[12].code = [gi('bump_sem')]; }, fails: [1], says: 'noStop' },
    { name: 'xSemaphoreGive instead of the FromISR version', apply: p => { p.units[12].code[1] = { op: 'give', s: 'bump_sem' }; }, crash: 'xSemaphoreGive' },
    { name: 'flash write in the ISR', apply: p => { p.units[12].code = [c('stopMotors'), c('logToFlash')]; }, crash: 'Cache disabled' },
    { name: 'bumper stack 1024', apply: p => { p.units[13].stack = 1024; }, crash: 'stack overflow' },
    { name: 'bumper polls with no timeout', apply: p => { p.units[13].code = [tk('bump_sem', 0), c('checkThermals')]; }, crash: 'task_wdt' },
  ],
  alts: [
    { name: 'counting semaphore', stars: 3, apply: p => { p.objs.bump_sem = { type: 'counting', max: 8 }; } },
    { name: 'bumper stack 1536', stars: 3, apply: p => { p.units[13].stack = 1536; } },
    { name: 'bumper stack 2048', stars: 2, apply: p => { p.units[13].stack = 2048; } },
    { name: 'bumper stack 4096', stars: 2, apply: p => { p.units[13].stack = 4096; } },
    { name: 'take with a 50 ms timeout', stars: 3, apply: p => { p.units[13].code[0] = tk('bump_sem', 50); } },
  ],
  widgets, manual, realCode, quiz,
};
