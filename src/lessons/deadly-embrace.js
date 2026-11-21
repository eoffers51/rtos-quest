// Stage 11: deadlock, lock ordering and starvation. arm and focus both need two mutexes but take them in opposite order.
import { c, d, gv, tk, bz, task, E_, S_, B } from '../kernel.js';
import { lesson as stage10 } from './all-systems-go.js';
import { lesson as stage9 } from './fold-the-antenna.js';
import { manual, realCode, quiz, widgets } from './deadly-embrace.content.js';
import { briefing, reactions, hints, solutionNote } from './deadly-embrace.copy.js';

const clone = o => JSON.parse(JSON.stringify(o));
const armCode = () => [
  d(640),
  tk('arm_mtx'), c('positionArm'), tk('cam_mtx'), c('photograph'), gv('cam_mtx'), gv('arm_mtx'), d(140),
  tk('arm_mtx'), c('positionArm'), tk('cam_mtx'), c('photograph'), gv('cam_mtx'), gv('arm_mtx'),
  d(10000)];
const focusBad = () => [
  d(720),
  tk('cam_mtx'), c('calibrateCamera'), tk('arm_mtx'), c('checkFocus'), gv('arm_mtx'), gv('cam_mtx'), d(60),
  tk('cam_mtx'), c('calibrateCamera'), tk('arm_mtx'), c('checkFocus'), gv('arm_mtx'), gv('cam_mtx'),
  d(10000)];
const focusGood = () => [
  d(720),
  tk('arm_mtx'), tk('cam_mtx'), c('calibrateCamera'), c('checkFocus'), gv('cam_mtx'), gv('arm_mtx'), d(60),
  tk('arm_mtx'), tk('cam_mtx'), c('calibrateCamera'), c('checkFocus'), gv('cam_mtx'), gv('arm_mtx'),
  d(10000)];
const addSession = (p, focus) => {
  p.objs.arm_mtx = { type: 'mutex' };
  p.objs.cam_mtx = { type: 'mutex' };
  p.units.push(task('arm', 2, armCode(), { stack: 1792 }));      // unit 21
  p.units.push(task('focus', 2, focus, { stack: 1536 }));        // unit 22
  return p;
};
// Two tasks that take the same two mutexes in opposite orders can deadlock, whether or not this run happened to:
// the first such pair in the run, or null.
const inversion = K => { const o = K.w.lockOrder || []; for (const b of o) { const a = o.find(x => x.unit !== b.unit && x.first === b.then && x.then === b.first && x.t <= b.t); if (a) return { a, b }; } return null; };
const stuckOf = K => K.units.filter(u => u.kind === 'task' && u.state === 'wait' && u.obj && u.obj.type === 'mutex');

export const lesson = {
  id: 11, title: 'Deadly Embrace', topic: 'Deadlock, lock ordering and starvation', file: 'main/rover_main.c',
  T: 1000, cores: 1, heap: 8192, pins: ['BEACON', 'HEART'],
  ops: ['gpio', 'call', 'delay', 'until', 'busy', 'send', 'recv', 'take', 'give', 'giveISR', 'sendISR', 'notifyGive', 'notifyGiveISR', 'notifyTake', 'tReset', 'tStop', 'evSet', 'evWait'],
  fns: ['stopMotors', 'checkThermals', 'deployAntenna', 'stowAntenna', 'handlePacket', 'acquireLink', 'syncTime', 'acquireFix', 'sendUplink', 'positionArm', 'photograph', 'calibrateCamera', 'checkFocus'],
  irqs: { onBump: [150, 152], onPacket: [100, 420, 500, 580] },
  goals: [
    'Photo session: no task waits for ever for a lock, and every task takes the two locks in the same order (no deadlock, no crash)',
    'Arm: at least 2 photographs taken in 1 s',
    'Camera: at least 2 focus checks done in 1 s',
    'Locks: no arm or camera call runs without the locks it needs',
    'Still working from stage 10: the ground station rejects no packet, exactly one per window within 60 ms of the last bring-up (2 packets)',
    'Still working from stage 9: every packet handled within 60 ms, mast stowed once per pass 180 to 250 ms after the last packet, unfolded twice',
    'Still working from stages 7 and 8: no ISR longer than 1 ms, motors stopped within 3 ms of both impacts, a thermal check for each within 150 ms',
    'Still working from stage 6: no I2C collisions, IMU at least 45 reads, never more than 40 ms apart',
    'Still working from stage 5: all 10 samples transmitted, in order, none overwritten',
    'Still working from stages 3 and 4: mapper frees its frames (at least 3 frames, 2 paths), spectrometer 47 to 53 samples started in 1 s',
    'Still working from stages 1 and 2: motor never more than 11 ms between steps, telemetry never more than 105 ms between packets, at least 9 sent; BEACON every 500 ms and HEART every 200 ms (within 3 ms)',
  ],
  start: prev => addSession(clone(prev || stage10.solution()), focusBad()),
  solution: () => addSession(stage10.solution(), focusGood()),
  check: K => {
    const ph = E_(K, 'photograph'), cf = E_(K, 'checkFocus');
    const stuck = stuckOf(K), viol = K.stats.viol, inv = inversion(K);
    const up = K.w.up || [], dn = K.w.done || {};
    const okU = up.filter(u => u.ok).map(u => u.t), rej = up.filter(u => !u.ok).length;
    const rounds = [0, 1].map(i => Math.max(...['link', 'time', 'fix'].map(k => (dn[k] || [])[i] ?? -1)));
    const upLat = rounds.map((r, i) => okU[i] === undefined || r < 0 ? -1 : okU[i] - r);
    const r9 = stage9.check(K);
    return [
      [!K.crash && K.diag.length === 0 && stuck.length === 0 && !inv, `${K.diag.length ? 'deadlock: ' : ''}${stuck.length} task(s) stuck on a lock for ever${inv && !stuck.length ? `, but ${inv.a.unit} takes ${inv.a.first} then ${inv.a.then} and ${inv.b.unit} takes ${inv.b.first} then ${inv.b.then}` : ''}`],
      [ph.length >= 2, `${ph.length} photographs (finished at ${ph.join(', ')} ms)`],
      [cf.length >= 2, `${cf.length} focus checks (finished at ${cf.join(', ')} ms)`],
      [viol === 0, `${viol} call(s) without their lock`],
      [rej === 0 && okU.length === 2 && up.length === 2 && upLat.every(x => x >= 0 && x <= 60), `${up.length} packets, ${rej} rejected, accepted at ${okU.join(', ')} ms, delays ${upLat.join(', ')} ms (-1 = never)`],
      [r9[0][0] && r9[1][0] && r9[2][0], `${r9[0][1]} / ${r9[1][1]} / ${r9[2][1]}`],
      r9[3], r9[4], r9[5],
      [r9[6][0] && r9[7][0], `${r9[6][1]}; ${r9[7][1]}`],
      [r9[8][0] && r9[9][0], `${r9[8][1]}; ${r9[9][1]}`],
    ];
  },
  evidence: K => {
    if (K.crash) return [];
    const out = [];
    for (const u of K.units) {
      if (u.kind !== 'task' || u.state !== 'wait' || !u.obj || u.obj.type !== 'mutex') continue;
      let t = K.end - 1; while (t > 0 && u.tr[t] === 3) t--;
      const from = t + 1, o = u.obj;
      out.push({ unit: u.name, from, to: K.end - 1, label: `${u.name}: ${K.end - from} ms on ${o.name} (held by ${o.owner ? o.owner.name : 'nobody'})` });
    }
    if (out.length) return out;
    const inv = inversion(K);
    if (inv) return [{ unit: inv.b.unit, from: inv.b.t, to: Math.min(inv.b.t + 30, K.end - 1), label: `${inv.b.unit} takes ${inv.b.first} then ${inv.b.then}: the opposite order to ${inv.a.unit}` }, { unit: inv.a.unit, from: inv.a.t, to: Math.min(inv.a.t + 30, K.end - 1), label: `${inv.a.unit} takes ${inv.a.first} then ${inv.a.then}` }];
    const v = K.ev.find(e => e.k === 'log' && /ran without holding/.test(e.text));
    if (v) { const fn = v.text.split('()')[0]; const unit = ['positionArm', 'photograph'].includes(fn) ? 'arm' : 'focus'; return [{ unit, from: v.t, to: Math.min(v.t + 30, K.end - 1), label: v.text }]; }
    return [];
  },
  bonus: B(99, 31892),
  briefing, reactions,
  diagnose: (K, res) => {
    if (K.crash && /gave .* but does not hold/.test(K.crash.msg)) return reactions.giveNotHeld;
    if (K.crash && /stack overflow/.test(K.crash.msg)) return reactions.stack;
    if (K.crash && /task_wdt/.test(K.crash.msg)) return reactions.busyLoop;
    if (K.crash) return reactions.fail;
    const stuck = stuckOf(K);
    if (!res[0][0]) {
      if (K.diag.some(s => /already holds itself/.test(s))) return reactions.forgotGive;
      if (K.diag.length) return reactions.deadlock;
      if (stuck.length) return reactions.keepsLock;
      if (inversion(K)) return reactions.orderLuck;
    }
    if (!res[3][0]) {
      const ops = ['arm', 'focus'].flatMap(n => { const u = K.units.find(x => x.name === n); return u ? u.code : []; });
      const takes = ops.filter(i => i.op === 'take');
      if (!takes.length) return reactions.noLocks;
      if (!takes.some(i => i.s === 'cam_mtx') || !takes.some(i => i.s === 'arm_mtx')) return reactions.oneLock;
      return reactions.releasedEarly;
    }
    if (!res[1][0] || !res[2][0]) return reactions.fail;
    if (!res[10][0] || !res[7][0] || !res[6][0]) return reactions.hog;
    if ([4, 5, 8, 9].some(i => !res[i][0])) return reactions.regress;
    return reactions.fail;
  },
  hints, solutionNote,
  // Unit order: stage 10 units 0..20, then arm (21), focus (22).
  wrong: [
    { name: 'opposite lock order (the start)', apply: p => { p.units[22].code = focusBad(); }, fails: [0, 1, 2], says: 'deadlock' },
    { name: 'opposite order left in one session, no deadlock in this run', apply: p => { const k = focusGood(); k[8] = tk('cam_mtx'); k[9] = tk('arm_mtx'); p.units[22].code = k; }, fails: [0], says: 'orderLuck' },
    { name: 'only the gives swapped', apply: p => { const k = focusBad(); k[5] = gv('cam_mtx'); k[6] = gv('arm_mtx'); k[12] = gv('cam_mtx'); k[13] = gv('arm_mtx'); p.units[22].code = k; }, fails: [0, 1, 2], says: 'deadlock' },
    { name: 'gives up but keeps the lock', apply: p => { const k = focusBad(); k[3] = tk('arm_mtx', 30); k[10] = tk('arm_mtx', 30); p.units[22].code = k; }, fails: [0, 1, 2], says: 'keepsLock' },
    { name: 'arm never gives arm_mtx', apply: p => { p.units[21].code = p.units[21].code.filter(i => !(i.op === 'give' && i.s === 'arm_mtx')); }, fails: [0, 1, 2], says: 'forgotGive' },
    { name: 'no locks at all', apply: p => { for (const i of [21, 22]) p.units[i].code = p.units[i].code.filter(x => x.op !== 'take' && x.op !== 'give'); }, fails: [3], says: 'noLocks' },
    { name: 'one lock for everything', apply: p => { for (const i of [21, 22]) p.units[i].code = p.units[i].code.filter(x => !((x.op === 'take' || x.op === 'give') && x.s === 'cam_mtx')); }, fails: [3], says: 'oneLock' },
    { name: 'camera lock released too early', apply: p => { p.units[22].code = [d(720), tk('arm_mtx'), tk('cam_mtx'), c('calibrateCamera'), gv('cam_mtx'), c('checkFocus'), gv('arm_mtx'), d(60), tk('arm_mtx'), tk('cam_mtx'), c('calibrateCamera'), gv('cam_mtx'), c('checkFocus'), gv('arm_mtx'), d(10000)]; }, fails: [3], says: 'releasedEarly' },
    { name: 'arm above everything', apply: p => { p.units[21].prio = 4; }, fails: [10], says: 'hog' },
    { name: 'gives a lock twice', apply: p => { p.units[22].code.splice(6, 0, gv('cam_mtx')); }, crash: 'does not hold' },
    { name: 'focus spins waiting', apply: p => { p.units[22].code = [d(720), bz(700), ...p.units[22].code.slice(1)]; }, crash: 'task_wdt' },
    { name: 'arm stack 1024', apply: p => { p.units[21].stack = 1024; }, crash: 'stack overflow' },
    { name: 'focus stack 1024', apply: p => { p.units[22].stack = 1024; }, crash: 'stack overflow' },
  ],
  alts: [
    { name: 'fix the arm instead', stars: 3, apply: p => { p.units[22].code = focusBad(); p.units[21].code = [d(640), tk('cam_mtx'), tk('arm_mtx'), c('positionArm'), c('photograph'), gv('arm_mtx'), gv('cam_mtx'), d(140), tk('cam_mtx'), tk('arm_mtx'), c('positionArm'), c('photograph'), gv('arm_mtx'), gv('cam_mtx'), d(10000)]; } },
    { name: 'release before acquiring', stars: 3, apply: p => { p.units[22].code = [d(720), tk('cam_mtx'), c('calibrateCamera'), gv('cam_mtx'), tk('arm_mtx'), tk('cam_mtx'), c('checkFocus'), gv('cam_mtx'), gv('arm_mtx'), d(60), tk('cam_mtx'), c('calibrateCamera'), gv('cam_mtx'), tk('arm_mtx'), tk('cam_mtx'), c('checkFocus'), gv('cam_mtx'), gv('arm_mtx'), d(10000)]; } },
    { name: 'both tasks at priority 1', stars: 3, apply: p => { p.units[21].prio = 1; p.units[22].prio = 1; } },
    { name: 'focus at priority 3', stars: 3, apply: p => { p.units[22].prio = 3; } },
    { name: 'arm at priority 3', stars: 3, apply: p => { p.units[21].prio = 3; } },
    { name: 'arm stack 1668', stars: 3, apply: p => { p.units[21].stack = 1668; } },
    { name: 'focus stack 1368', stars: 3, apply: p => { p.units[22].stack = 1368; } },
    { name: 'arm stack 4096', stars: 2, apply: p => { p.units[21].stack = 4096; } },
    { name: 'focus stack 4096', stars: 2, apply: p => { p.units[22].stack = 4096; } },
  ],
  widgets, manual, realCode, quiz,
};
