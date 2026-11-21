// Stage 8: task notifications. Builds on stage 7: the bumper is woken directly instead of through bump_sem.
import { c, gi, tk, ngi, ng, nt, E_, S_, maxGap, gapsOf, pinT, B } from '../kernel.js';
import { lesson as stage7 } from './bump-in-the-night.js';
import { manual, realCode, quiz, widgets } from './direct-line.content.js';
import { briefing, reactions, hints, solutionNote } from './direct-line.copy.js';

const clone = o => JSON.parse(JSON.stringify(o));
const steady = (a, period, min) => a.length >= min && gapsOf(a).every(x => Math.abs(x - period) <= 3);

export const lesson = {
  id: 8, title: 'Direct Line', topic: 'Task notifications', file: 'main/rover_main.c',
  T: 1000, cores: 1, heap: 8192, pins: ['BEACON', 'HEART'],
  ops: ['gpio', 'call', 'delay', 'until', 'busy', 'send', 'recv', 'take', 'give', 'giveISR', 'notifyGive', 'notifyGiveISR', 'notifyTake'],
  fns: ['stopMotors', 'checkThermals'],
  irqs: { onBump: [150, 152, 500, 502] },
  chartGrid: { unit: 'motor', period: 10 },
  goals: [
    'Interrupt handler: no ISR runs longer than 1 ms',
    'Safety: motors stopped within 3 ms of every impact (4 of 4)',
    'Follow-up: one thermal check for every impact, each within 150 ms of its impact',
    'Still working from stage 6: no I2C collisions, IMU at least 45 reads, never more than 40 ms apart',
    'Still working from stage 5: all 10 samples transmitted, in order, none overwritten',
    'Still working from stage 4: mapper frees its frames, at least 3 frames processed and 2 paths planned in 1 s',
    'Still working from stage 3: spectrometer 47 to 53 samples started in 1 s',
    'Still working from stage 2: motor never more than 11 ms between steps, telemetry never more than 105 ms between packets, at least 9 sent',
    'Still working from stage 1: BEACON every 500 ms and HEART every 200 ms (within 3 ms)',
  ],
  start: prev => {
    const p = clone(prev || stage7.solution());
    p.objs.bump_sem = { type: 'binary', types: ['binary', 'counting'], max: 8 };
    return p;
  },
  solution: () => {
    const p = stage7.solution();
    delete p.objs.bump_sem;
    p.units[12].code = [c('stopMotors'), ngi('bumper')];
    p.units[13].code = [nt(-1, 0), c('checkThermals')];
    return p;
  },
  check: K => {
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
      [K.stats.isrMax <= 1, `longest ISR ${K.stats.isrMax} ms`],
      [irq.length === 4 && stopLat.every(x => x >= 0 && x <= 3), `stop delays ${stopLat.join(', ')} ms`],
      [irq.length === 4 && ck.length >= 4 && ckLat.every(x => x >= 0 && x <= 150), `${ck.length} checks for ${irq.length} impacts, delays ${ckLat.join(', ')} ms`],
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
    if (K.crash) return /ISR/.test(K.crash.msg) ? [{ unit: 'onBump', from: t0, to: K.crash.t, label: K.crash.msg.split('.')[0] }] : [];
    if (K.stats.isrMax > 1) return [{ unit: 'onBump', from: t0, to: t0 + K.stats.isrMax, label: `onBump ran ${K.stats.isrMax} ms inside the interrupt at ${t0} ms: no task could run` }];
    const st = E_(K, 'stopMotors'), miss = irq.find(t => !st.some(x => x >= t && x <= t + 3));
    if (miss !== undefined) return [{ unit: 'onBump', from: miss, to: miss + 3, label: `impact at ${miss} ms: stopMotors() did not run within 3 ms` }];
    const ck = E_(K, 'checkThermals'), bad = irq.findIndex((t, i) => ck[i] === undefined || ck[i] - t > 150);
    if (bad >= 0) {
      const g = irq.filter(t => Math.abs(t - irq[bad]) <= 10), a = g[0], z = g[g.length - 1], n = ck.filter(x => x > a && x <= z + 150).length;
      return [{ unit: 'bumper', from: a, to: Math.min(z + 150, K.end - 1), label: `${g.length} impacts within ${z - a} ms at ${a} ms but only ${n} thermal check${n === 1 ? '' : 's'} followed: ${n ? 'the extra wake-ups were lost' : 'bumper was never woken'}` }];
    }
    return [];
  },
  bonus: B(99, 19896),
  briefing, reactions,
  diagnose: (K, res) => {
    const bumper = K.units.find(u => u.name === 'bumper'), isr = K.units.find(u => u.name === 'onBump');
    if (K.crash && /called inside an ISR/.test(K.crash.msg)) return reactions.isrBlock;
    if (K.crash && /Cache disabled/.test(K.crash.msg)) return reactions.isrFlash;
    if (K.crash && /stack overflow/.test(K.crash.msg)) return reactions.stack;
    if (K.crash && /task_wdt/.test(K.crash.msg)) return reactions.busyLoop;
    if (!res[0][0]) return reactions.slowIsr;
    if (!res[1][0]) {
      return E_(K, 'stopMotors').length === 0 ? reactions.noStop : reactions.lateStop;
    }
    if (!res[2][0]) {
      if (E_(K, 'checkThermals').length === 0) return reactions.neverWakes;
      if (bumper && bumper.code.some(i => i.op === 'notifyTake' && String(i.clear) !== '0') && isr && isr.code.some(i => i.op === 'notifyGiveISR')) return reactions.clearsCount;
      return reactions.lostImpacts;
    }
    if (!res[7][0] || !res[3][0]) return reactions.hog;
    if ([4, 5, 6, 8].some(i => !res[i][0])) return reactions.regress;
    return reactions.fail;
  },
  hints, solutionNote,
  // Unit order: ... imu (10), thermo (11), onBump (12, isr), bumper (13, task).
  wrong: [
    { name: 'the original binary semaphore (start)', apply: p => { p.objs.bump_sem = { type: 'binary' }; p.units[12].code = [c('stopMotors'), gi('bump_sem')]; p.units[13].code = [tk('bump_sem', -1), c('checkThermals')]; }, fails: [2], says: 'lostImpacts' },
    { name: 'take clears the count (pdTRUE)', apply: p => { p.units[13].code[0] = nt(-1, 1); }, fails: [2], says: 'clearsCount' },
    { name: 'notify the wrong task', apply: p => { p.units[12].code[1] = ngi('telemetry'); }, fails: [2], says: 'neverWakes' },
    { name: 'ISR never notifies', apply: p => { p.units[12].code = [c('stopMotors')]; }, fails: [2], says: 'neverWakes' },
    { name: 'ISR gives the semaphore, task waits for a notification', apply: p => { p.objs.bump_sem = { type: 'binary' }; p.units[12].code = [c('stopMotors'), gi('bump_sem')]; }, fails: [2], says: 'neverWakes' },
    { name: 'xTaskNotifyGive in the ISR', apply: p => { p.units[12].code[1] = ng('bumper'); }, crash: 'called inside an ISR' },
    { name: 'thermal check back in the ISR', apply: p => { p.units[12].code = [c('stopMotors'), c('checkThermals')]; }, fails: [0, 1, 7, 8], says: 'slowIsr' },
    { name: 'flash write in the ISR', apply: p => { p.units[12].code = [c('stopMotors'), c('logToFlash')]; }, crash: 'Cache disabled' },
    { name: 'motors stopped late (stop moved into the task)', apply: p => { p.units[12].code = [ngi('bumper')]; p.units[13].code = [nt(-1, 0), c('stopMotors'), c('checkThermals')]; }, fails: [1], says: 'lateStop' },
    { name: 'forgot to stop the motors', apply: p => { p.units[12].code = [ngi('bumper')]; }, fails: [1], says: 'noStop' },
    { name: 'bumper above the motor', apply: p => { p.units[13].prio = 4; }, fails: [7], says: 'hog' },
    { name: 'bumper at priority 3', apply: p => { p.units[13].prio = 3; }, fails: [3, 7], says: 'hog' },
    { name: 'bumper shares priority 2 with telemetry', apply: p => { p.units[13].prio = 2; }, fails: [7], says: 'hog' },
    { name: 'bumper polls the notification with no timeout', apply: p => { p.units[13].code[0] = nt(0, 0); }, crash: 'task_wdt' },
    { name: 'bumper stack 1024', apply: p => { p.units[13].stack = 1024; }, crash: 'stack overflow' },
  ],
  alts: [
    { name: 'counting semaphore (editor type select)', stars: 2, apply: p => { p.objs.bump_sem = { type: 'counting', max: 8, types: ['binary', 'counting'] }; p.units[12].code = [c('stopMotors'), gi('bump_sem')]; p.units[13].code = [tk('bump_sem', -1), c('checkThermals')]; } },
    { name: 'notification, bump_sem left unused', stars: 2, apply: p => { p.objs.bump_sem = { type: 'binary', types: ['binary', 'counting'], max: 8 }; } },
    { name: 'bumper stack 1536', stars: 2, apply: p => { p.units[13].stack = 1536; } },
    { name: 'bumper stack 1200', stars: 3, apply: p => { p.units[13].stack = 1200; } },
    { name: 'take with a 50 ms timeout', stars: 3, apply: p => { p.units[13].code[0] = nt(50, 0); } },
  ],
  widgets, manual, realCode, quiz,
};
