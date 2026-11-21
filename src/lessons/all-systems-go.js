// Stage 10: event groups. The uplink may only send when the radio link, the clock and the position fix are all ready.
import { c, d, gv, tk, es, ew, task, E_, S_, maxGap, gapsOf, pinT, B } from '../kernel.js';
import { lesson as stage9 } from './fold-the-antenna.js';
import { manual, realCode, quiz, widgets } from './all-systems-go.content.js';
import { briefing, reactions, hints, solutionNote } from './all-systems-go.copy.js';

const clone = o => JSON.parse(JSON.stringify(o));
const steady = (a, period, min) => a.length >= min && gapsOf(a).every(x => Math.abs(x - period) <= 3);
const BITS = ['LINK_UP', 'TIME_OK', 'FIX_OK'];

// a ready bit that was set while its fact was not true yet: a lie to every task that waits on the group
const FACT = { LINK_UP: 'link', TIME_OK: 'time', FIX_OK: 'fix' };
const WORK = { LINK_UP: 'acquireLink', TIME_OK: 'syncTime', FIX_OK: 'acquireFix' };
// A set is a lie when the fact has never been made true before it. (Later rounds are not judged: once a send has used a
// fact, a late but honest set is hard to tell from a stale one, and a wrong verdict would be worse than none.)
const lies = K => (K.w.sets || []).filter(s => FACT[s.bit] && !((K.w.done || {})[FACT[s.bit]] || []).some(t => t <= s.t));

export const lesson = {
  id: 10, title: 'All Systems Go', topic: 'Event groups', file: 'main/rover_main.c',
  T: 1000, cores: 1, heap: 8192, pins: ['BEACON', 'HEART'],
  ops: ['gpio', 'call', 'delay', 'until', 'busy', 'send', 'recv', 'take', 'give', 'giveISR', 'sendISR', 'notifyGive', 'notifyGiveISR', 'notifyTake', 'tReset', 'tStop', 'evSet', 'evWait'],
  fns: ['stopMotors', 'checkThermals', 'deployAntenna', 'stowAntenna', 'handlePacket', 'acquireLink', 'syncTime', 'acquireFix', 'sendUplink'],
  irqs: { onBump: [150, 152], onPacket: [100, 420, 500, 580] },
  goals: [
    'Uplink: the ground station rejects no packet, and no ready bit is set before its work is done (radio link, clock, position fix)',
    'Uplink: exactly one packet per window, sent within 60 ms of the last of the three being ready (2 packets)',
    'Still working from stage 9: every packet handled within 60 ms, mast stowed once per pass 180 to 250 ms after the last packet, unfolded twice',
    'Still working from stages 7 and 8: no ISR longer than 1 ms, motors stopped within 3 ms of both impacts, a thermal check for each within 150 ms',
    'Still working from stage 6: no I2C collisions, IMU at least 45 reads, never more than 40 ms apart',
    'Still working from stage 5: all 10 samples transmitted, in order, none overwritten',
    'Still working from stage 4: mapper frees its frames, at least 3 frames processed and 2 paths planned in 1 s',
    'Still working from stage 3: spectrometer 47 to 53 samples started in 1 s',
    'Still working from stage 2: motor never more than 11 ms between steps, telemetry never more than 105 ms between packets, at least 9 sent',
    'Still working from stage 1: BEACON every 500 ms and HEART every 200 ms (within 3 ms)',
  ],
  start: prev => {
    const p = clone(prev || stage9.solution());
    p.objs.sys_ev = { type: 'events', bits: BITS.slice() };
    p.objs.ready_sem = { type: 'binary' };
    p.units.push(task('radio_link', 1, [c('acquireLink'), gv('ready_sem'), d(40), gv('ready_sem'), d(220), c('acquireLink'), gv('ready_sem'), d(10000)], { stack: 1536 }));
    p.units.push(task('time_sync', 1, [c('syncTime'), gv('ready_sem'), d(20), c('syncTime'), gv('ready_sem'), d(10000)], { stack: 1792 }));
    p.units.push(task('gps_fix', 1, [c('acquireFix'), gv('ready_sem'), d(60), c('acquireFix'), gv('ready_sem'), d(10000)], { stack: 1664 }));
    p.units.push(task('uplink', 1, [tk('ready_sem', -1), c('sendUplink')], { stack: 2048 }));
    return p;
  },
  solution: () => {
    const p = stage9.solution();
    p.objs.sys_ev = { type: 'events', bits: BITS.slice() };
    p.units.push(task('radio_link', 1, [c('acquireLink'), es('sys_ev', 'LINK_UP'), d(40), es('sys_ev', 'LINK_UP'), d(220), c('acquireLink'), es('sys_ev', 'LINK_UP'), d(10000)], { stack: 1536 }));
    p.units.push(task('time_sync', 1, [c('syncTime'), es('sys_ev', 'TIME_OK'), d(20), c('syncTime'), es('sys_ev', 'TIME_OK'), d(10000)], { stack: 1792 }));
    p.units.push(task('gps_fix', 1, [c('acquireFix'), es('sys_ev', 'FIX_OK'), d(60), c('acquireFix'), es('sys_ev', 'FIX_OK'), d(10000)], { stack: 1664 }));
    p.units.push(task('uplink', 1, [ew('sys_ev', 'all', -1), c('sendUplink')], { stack: 2048 }));
    return p;
  },
  check: K => {
    const up = K.w.up || [], dn = K.w.done || {};
    const okU = up.filter(u => u.ok).map(u => u.t), rej = up.filter(u => !u.ok).length, lie = lies(K);
    const rounds = [0, 1].map(i => Math.max(...['link', 'time', 'fix'].map(k => (dn[k] || [])[i] ?? -1)));
    const upLat = rounds.map((r, i) => okU[i] === undefined || r < 0 ? -1 : okU[i] - r);
    const pk = K.w.irq.onPacket || [], hp = E_(K, 'handlePacket');
    const ant = K.ev.filter(e => e.k === 'ant');
    const stows = ant.filter(e => e.v === 0).map(e => e.t);
    let unf = 0, out = false;
    for (const e of ant) { if (e.v === 1 && !out) unf++; out = e.v === 1; }
    const last = pk.filter((t, i) => !pk.some(x => x > t && x - t <= 150));
    let hj = 0; const lat = pk.map(t => { while (hj < hp.length && hp[hj] < t) hj++; return hj < hp.length ? hp[hj++] - t : -1; });   // each packet pairs with its own handlePacket(), as in stage 9
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
      [rej === 0 && !lie.length, `${rej} rejected${lie.length ? `, and ${lie[0].unit} set ${lie[0].bit} at ${lie[0].t} ms, before that was true` : ''}`],
      [okU.length === 2 && up.length === 2 && upLat.every(x => x >= 0 && x <= 60), `${up.length} packets sent, 2 expected. Accepted at ${okU.length ? okU.join(' and ') + ' ms' : 'never'}, ${upLat.some(x => x < 0) ? 'a delay is missing' : upLat.join(' and ') + ' ms after the last fact was ready'}.`],
      [pk.length === 4 && lat.every(x => x >= 0 && x <= 60) && stows.length === 2 && stowLat.every(x => x >= 180 && x <= 250) && unf === 2, `packet delays ${lat.join(', ')} ms, stows ${stowLat.join(', ')} ms after the last packets, ${unf} unfolds`],
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
    const up = K.w.up || [], dn = K.w.done || {}, ss = S_(K, 'sendUplink');
    if (K.crash) return [];
    const logs = K.ev.filter(e => e.k === 'log' && /packet rejected/.test(e.text)).map(e => e.text.split('missing: ')[1]);
    const ri = up.findIndex(u => !u.ok);
    if (ri >= 0) {
      const rj = up.slice(0, ri).filter(u => !u.ok).length, tr = up[ri].t;
      const no = { 'radio link': 'no radio', 'time sync': 'no clock', 'position fix': 'no fix' };
      const why = (logs[rj] || '').split(', ').map(m => no[m] || m).filter(Boolean).join(', ');
      const out = [{ unit: 'uplink', from: ss[ri], to: tr, label: `rejected: ${why || 'not ready'}` }];
      for (const [k, unit, label] of [['link', 'radio_link', 'radio up'], ['time', 'time_sync', 'clock ok'], ['fix', 'gps_fix', 'fix ok']]) {
        const t = (dn[k] || []).filter(x => x <= tr).pop();
        if (t !== undefined) out.push({ unit, from: t, to: Math.min(t + 25, K.end - 1), label });
      }
      return out;
    }
    const rounds = [0, 1].map(i => Math.max(...['link', 'time', 'fix'].map(k => (dn[k] || [])[i] ?? -1)));
    const ok = up.filter(u => u.ok).map(u => u.t);
    const lie = lies(K);
    if (lie.length) return [{ unit: lie[0].unit, from: lie[0].t, to: Math.min(lie[0].t + 30, K.end - 1), label: `${lie[0].bit} set at ${lie[0].t} ms, before the work that makes it true had finished` }];
    const miss = rounds.findIndex((r, i) => r >= 0 && ok[i] === undefined);
    if (miss >= 0) return [{ unit: 'uplink', from: rounds[miss], to: Math.min(rounds[miss] + 250, K.end - 1), label: `the last bring-up task finished at ${rounds[miss]} ms but uplink never sent: it never saw all three bits` }];
    const late = rounds.findIndex((r, i) => r >= 0 && ok[i] - r > 60);
    if (late >= 0) return [{ unit: 'uplink', from: rounds[late], to: ok[late], label: `packet sent ${ok[late] - rounds[late]} ms after the last condition was ready` }];
    return [];
  },
  bonus: B(99, 28664),
  briefing, reactions,
  diagnose: (K, res) => {
    const up = K.w.up || [], okU = up.filter(u => u.ok);
    const ul = K.units.find(u => u.name === 'uplink');
    const waits = ul ? ul.code.filter(i => i.op === 'evWait') : [], takes = ul ? ul.code.filter(i => i.op === 'take') : [];
    if (K.crash && /stack overflow/.test(K.crash.msg)) return reactions.stack;
    if (K.crash && /task_wdt/.test(K.crash.msg)) return reactions.watchdog;
    if (K.crash) return reactions.crash;
    // a bit set by a task that does not do that bit's work is the wrong bit; set by the right task too early, it is a false bit
    const lie = lies(K), foreign = lie.find(s => { const u = K.units.find(x => x.name === s.unit); return u && !u.code.some(i => i.fn === WORK[s.bit]); });
    if (foreign) return reactions.wrongBit;
    if (!res[0][0] && !up.some(u => !u.ok)) return reactions.falseBit;
    if (!res[0][0] && takes.length > 1) return reactions.countsGives;
    if (!res[0][0] && takes.length === 1) return reactions.sendsEarly;
    if (!res[0][0] && waits.some(w => w.mode === 'any')) return reactions.anyBit;
    if (!res[0][0] && up.find(u => !u.ok).t < 100) return reactions.setsEarly;
    if (!res[0][0] && waits.length === 1 && /^bit:/.test(waits[0].mode)) return reactions.oneBit;
    if (up.length === 0) return takes.length && !waits.length ? reactions.stillSemaphore : reactions.neverSends;
    if (!res[1][0] && okU.length === 1) return BITS.some(b => (K.w.sets || []).filter(s => s.bit === b).length < 2) ? reactions.missingBit : reactions.oneWindow;
    if (!res[8][0] || !res[4][0] || !res[3][0] || !res[2][0]) return reactions.hog;
    if ([5, 6, 7, 9].some(i => !res[i][0])) return reactions.regress;
    return reactions.fail;
  },
  hints, solutionNote,
  // Unit order: ... antenna (15), onStow (16), radio_link (17), time_sync (18), gps_fix (19), uplink (20).
  wrong: [
    { name: 'one semaphore for all three (start)', apply: p => { p.objs.ready_sem = { type: 'binary' }; p.units[17].code = [c('acquireLink'), gv('ready_sem'), d(40), gv('ready_sem'), d(220), c('acquireLink'), gv('ready_sem'), d(10000)]; p.units[18].code = [c('syncTime'), gv('ready_sem'), d(20), c('syncTime'), gv('ready_sem'), d(10000)]; p.units[19].code = [c('acquireFix'), gv('ready_sem'), d(60), c('acquireFix'), gv('ready_sem'), d(10000)]; p.units[20].code = [tk('ready_sem', -1), c('sendUplink')]; }, fails: [0, 1], says: 'sendsEarly' },
    { name: 'waits for any bit', apply: p => { p.units[20].code[0] = ew('sys_ev', 'any', -1); }, fails: [0, 1], says: 'anyBit' },
    { name: 'waits for FIX_OK only', apply: p => { p.units[20].code[0] = ew('sys_ev', 'bit:FIX_OK', -1); }, fails: [0, 1], says: 'oneBit' },
    { name: 'waits for LINK_UP only', apply: p => { p.units[20].code[0] = ew('sys_ev', 'bit:LINK_UP', -1); }, fails: [0, 1], says: 'oneBit' },
    { name: 'waits for TIME_OK only', apply: p => { p.units[20].code[0] = ew('sys_ev', 'bit:TIME_OK', -1); }, fails: [0, 1], says: 'oneBit' },
    { name: 'bit set before the work', apply: p => { for (const i of [17, 18, 19]) { const k = p.units[i].code; for (let j = 0; j < k.length - 1; j++) if (k[j].op === 'call' && k[j + 1].op === 'evSet') { const t = k[j]; k[j] = k[j + 1]; k[j + 1] = t; j++; } } }, fails: [0, 1], says: 'setsEarly' },
    { name: 'gps_fix never sets its bit', apply: p => { p.units[19].code = p.units[19].code.filter(i => i.op !== 'evSet'); }, fails: [1], says: 'neverSends' },
    { name: 'time_sync sets the wrong bit', apply: p => { p.units[18].code[1] = es('sys_ev', 'FIX_OK'); p.units[18].code[4] = es('sys_ev', 'FIX_OK'); }, fails: [0, 1], says: 'wrongBit' },
    { name: 'radio_link sets its bit only once', apply: p => { p.units[17].code = [c('acquireLink'), es('sys_ev', 'LINK_UP'), d(10000)]; }, fails: [1], says: 'missingBit' },
    { name: 'one bit set before its work, hidden by a later fact', apply: p => { const k = p.units[18].code, t = k[0]; k[0] = k[1]; k[1] = t; }, fails: [0], says: 'falseBit' },
    { name: 'gps_fix sets a bit that is already true instead of its own', apply: p => { p.units[19].code[1] = es('sys_ev', 'TIME_OK'); }, fails: [1], says: 'missingBit' },
    { name: 'waits twice (one bit, then all)', apply: p => { p.units[20].code = [ew('sys_ev', 'bit:LINK_UP', -1), ew('sys_ev', 'all', -1), c('sendUplink')]; }, fails: [1], says: 'oneWindow' },
    { name: 'counting the gives (3 takes)', apply: p => { p.objs.ready_sem = { type: 'binary' }; p.units[17].code = [c('acquireLink'), gv('ready_sem'), d(40), gv('ready_sem'), d(220), c('acquireLink'), gv('ready_sem'), d(10000)]; p.units[18].code = [c('syncTime'), gv('ready_sem'), d(20), c('syncTime'), gv('ready_sem'), d(10000)]; p.units[19].code = [c('acquireFix'), gv('ready_sem'), d(60), c('acquireFix'), gv('ready_sem'), d(10000)]; p.units[20].code = [tk('ready_sem', -1), tk('ready_sem', -1), tk('ready_sem', -1), c('sendUplink')]; }, fails: [0, 1], says: 'countsGives' },
    { name: 'uplink polls', apply: p => { p.units[20].code[0] = ew('sys_ev', 'all', 0); }, crash: 'task_wdt' },
    { name: 'uplink stack 1024', apply: p => { p.units[20].stack = 1024; }, crash: 'stack overflow' },
  ],
  alts: [
    { name: 'three waits in sequence', stars: 3, apply: p => { p.units[20].code = [ew('sys_ev', 'bit:LINK_UP', -1), ew('sys_ev', 'bit:TIME_OK', -1), ew('sys_ev', 'bit:FIX_OK', -1), c('sendUplink')]; } },
    { name: 'uplink priority 2', stars: 3, apply: p => { p.units[20].prio = 2; } },
    { name: 'uplink priority 3', stars: 3, apply: p => { p.units[20].prio = 3; } },
    { name: 'uplink stack 1968', stars: 3, apply: p => { p.units[20].stack = 1968; } },
    { name: 'ready_sem left unused', stars: 2, apply: p => { p.objs.ready_sem = { type: 'binary' }; } },
    { name: 'uplink stack 4096', stars: 2, apply: p => { p.units[20].stack = 4096; } },
    { name: 'time_sync stack 4096', stars: 2, apply: p => { p.units[18].stack = 4096; } },
  ],
  widgets, manual, realCode, quiz,
};
