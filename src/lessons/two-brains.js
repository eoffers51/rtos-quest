// Stage 13: two cores, pinning and a short lock. The start pins everything to core 1 (watchdog reset); moving the new tasks to core 0 exposes a torn read of the hazard record.
import { c, d, un, gv, tk, bz, task, E_, S_, B } from '../kernel.js';
import { lesson as stage12 } from './pathfinder.js';
import { lesson as stage9 } from './fold-the-antenna.js';
import { manual, realCode, quiz, widgets } from './two-brains.content.js';
import { briefing, reactions, hints, solutionNote } from './two-brains.copy.js';

const clone = o => JSON.parse(JSON.stringify(o));
const byName = (p, n) => p.units.find(u => u.name === n);
const unlock = u => { u.code = u.code.filter(i => !((i.op === 'take' || i.op === 'give') && i.s === 'hz_lock')); };

export const lesson = {
  id: 13, title: 'Two Brains', topic: 'Dual-core scheduling, pinning and critical sections', file: 'main/rover_main.c',
  T: 1000, cores: 2, heap: 8192, pins: ['BEACON', 'HEART'],
  ops: ['gpio', 'call', 'delay', 'until', 'busy', 'send', 'recv', 'take', 'give', 'giveISR', 'sendISR', 'notifyGive', 'notifyGiveISR', 'notifyTake', 'tReset', 'tStop', 'evSet', 'evWait'],
  fns: [...stage12.fns, 'visionStep', 'publishHazard', 'readHazard', 'fusionStep'],
  irqs: { onBump: [150, 152], onPacket: [100, 420, 500, 580] },
  chartGrid: { unit: 'vision', period: 50 },
  goals: [
    'Vision: at least 18 hazard frames published in 1 s, each within 25 ms of its 50 ms slot',
    'Fusion: at least 18 hazard reads, each done within 15 ms of its 50 ms slot',
    'Hazard record: never read while it is being written, every publish and read made while holding hz_lock, and no task waits for ever for it',
    '<details><summary>Older stages (9 checks): everything from stages 1 to 12 still works</summary><span style="display:block;font-size:.85em">Stage 12: all 9 bus exchanges within 30 ms of their 100 ms slot, at least 4 weather reports, no bus, arm or camera call without its lock</span><span style="display:block;font-size:.85em">Stage 11: both photographs and both focus checks done, arm and focus not stuck on a lock</span><span style="display:block;font-size:.85em">Stage 10: the ground station rejects no packet, exactly one per window within 60 ms of the last bring-up (2 packets)</span><span style="display:block;font-size:.85em">Stage 9: every packet handled within 60 ms, mast stowed once per pass 180 to 250 ms after the last packet, unfolded twice</span><span style="display:block;font-size:.85em">Stages 7 and 8: no ISR longer than 1 ms, motors stopped within 3 ms of both impacts, a thermal check for each within 150 ms</span><span style="display:block;font-size:.85em">Stage 6: no I2C collisions, IMU at least 45 reads, never more than 40 ms apart</span><span style="display:block;font-size:.85em">Stage 5: all 10 samples transmitted, in order, none overwritten</span><span style="display:block;font-size:.85em">Stages 3 and 4: mapper frees its frames (at least 3 frames, 2 paths), spectrometer 47 to 53 samples started in 1 s</span><span style="display:block;font-size:.85em">Stages 1 and 2: motor never more than 11 ms between steps, telemetry never more than 105 ms between packets, at least 9 sent; BEACON every 500 ms and HEART every 200 ms (within 3 ms)</span></details>',
  ],
  start: prev => {
    const p = clone(prev || stage12.solution());
    p.objs.hz_lock = { type: 'mutex' };
    p.units.push(task('vision', 2, [un(50), c('visionStep'), c('publishHazard')], { stack: 2816, core: 1 }));
    p.units.push(task('fusion', 2, [un(50), d(8), c('readHazard'), c('fusionStep')], { stack: 1600, core: 1 }));
    return p;
  },
  solution: () => {
    const p = stage12.solution();
    p.objs.hz_lock = { type: 'mutex' };
    p.units.push(task('vision', 2, [un(50), c('visionStep'), tk('hz_lock'), c('publishHazard'), gv('hz_lock')], { stack: 2816, core: 0 }));
    p.units.push(task('fusion', 2, [un(50), d(8), tk('hz_lock'), c('readHazard'), gv('hz_lock'), c('fusionStep')], { stack: 1600, core: 0 }));
    return p;
  },
  // detail(K): every measurement as its own row. Later stages reuse these rows by index, so only ever append.
  detail: K => {
    const mx = a => a.length ? Math.max(...a) : -1;
    const pub = E_(K, 'publishHazard'), pl = pub.map((t, i) => t - 50 * (i + 1));
    const rd = E_(K, 'readHazard'), rl = rd.map((t, i) => t - 50 * (i + 1));
    const fu = E_(K, 'fusionStep');
    const torn = (K.w.hz || {}).torn || 0, open = ((K.w.hz || {}).open || []).length;
    const stuckHz = K.units.filter(u => ['vision', 'fusion'].includes(u.name) && u.state === 'wait' && u.obj && u.obj.name === 'hz_lock');
    const ex = E_(K, 'exchangeData'), el = ex.map((t, i) => t - 100 * (i + 1));
    const pw = [...E_(K, 'publishWeather'), ...E_(K, 'copyToBus')];
    const ph = E_(K, 'photograph'), cf = E_(K, 'checkFocus');
    const stuck = K.units.filter(u => ['arm', 'focus'].includes(u.name) && u.state === 'wait');
    const up = K.w.up || [], dn = K.w.done || {};
    const okU = up.filter(u => u.ok).map(u => u.t), rej = up.filter(u => !u.ok).length;
    const rounds = [0, 1].map(i => Math.max(...['link', 'time', 'fix'].map(k => (dn[k] || [])[i] ?? -1)));
    const upLat = rounds.map((r, i) => okU[i] === undefined || r < 0 ? -1 : okU[i] - r);
    const r9 = stage9.check(K);
    const rows = [
      [pub.length >= 18 && pl.every(x => x >= 0 && x <= 25), `${pub.length} hazard frames published, worst delay ${mx(pl)} ms`],
      [rd.length >= 18 && fu.length >= 18 && rl.every(x => x >= 0 && x <= 15), `${rd.length} hazard reads, ${fu.length} fusion steps, worst read delay ${mx(rl)} ms`],
      [torn === 0 && stuckHz.length === 0 && open === 0, `${torn} torn reads, ${open} call(s) on the record without hz_lock, ${stuckHz.length} task(s) stuck on hz_lock`],
      [ex.length === 9 && el.every(x => x >= 0 && x <= 30) && pw.length >= 4 && K.stats.viol - torn === 0, `${ex.length} exchanges, delays ${el.join(', ')} ms, ${pw.length} weather reports, ${K.stats.viol - torn} unprotected calls`],
      [ph.length >= 2 && cf.length >= 2 && !K.diag.some(s => /^(arm|focus) /.test(s)) && stuck.length === 0, `${ph.length} photographs, ${cf.length} focus checks, ${stuck.length} task(s) stuck`],
      [rej === 0 && okU.length === 2 && up.length === 2 && upLat.every(x => x >= 0 && x <= 60), `${up.length} packets, ${rej} rejected, accepted at ${okU.join(', ')} ms, delays ${upLat.join(', ')} ms (-1 = never)`],
      [r9[0][0] && r9[1][0] && r9[2][0], `${r9[0][1]} / ${r9[1][1]} / ${r9[2][1]}`],
      r9[3], r9[4], r9[5],
      [r9[6][0] && r9[7][0], `${r9[6][1]}; ${r9[7][1]}`],
      [r9[8][0] && r9[9][0], `${r9[8][1]}; ${r9[9][1]}`],
    ];
    return rows;
  },
  // The nine older-stage checks are shown as one group: one status, and only failing measurements are listed.
  check: K => {
    const rows = lesson.detail(K), bad = rows.slice(3).filter(r => !r[0]);
    return [...rows.slice(0, 3), [bad.length === 0, bad.length ? bad.map(r => r[1]).join(' | ') : 'all 9 older checks pass']];
  },
  evidence: K => {
    if (K.crash) return [];
    const lk = K.units.filter(u => ['vision', 'fusion'].includes(u.name) && u.state === 'wait' && u.obj && u.obj.name === 'hz_lock');
    if (lk.length) {
      const u = lk[0]; let t = K.end - 1; while (t > 0 && u.tr[t] === 3) t--;
      const o = u.obj, h = o.owner ? o.owner.name : 'nobody';
      return [{ unit: u.name, from: t + 1, to: K.end - 1, label: `${u.name} has waited ${K.end - 1 - t} ms for hz_lock, held by ${h}` }];
    }
    const bad = K.ev.filter(e => e.k === 'log' && /hazard record/.test(e.text));
    if (bad.length) {
      const n = (K.w.hz || {}).torn || bad.length;
      return [{ unit: 'fusion', from: Math.max(0, bad[0].t - 4), to: Math.min(bad[0].t + 8, K.end - 1), label: `hazard record torn ${n} times: fusion read it while vision was writing it` }];
    }
    const op = ((K.w.hz || {}).open || [])[0];
    if (op && K.units.some(u => u.name === op.unit)) return [{ unit: op.unit, from: op.t, to: Math.min(op.t + 6, K.end - 1), label: `${op.fn}() at ${op.t} ms without holding hz_lock: nothing collided this time` }];
    const rd = E_(K, 'readHazard'); let w = -1, wl = 15;
    rd.forEach((t, i) => { const l = t - 50 * (i + 1); if (l > wl) { wl = l; w = i; } });
    if (w >= 0) return [{ unit: 'fusion', from: 50 * (w + 1), to: rd[w], label: `hazard read ${wl} ms after its slot: fusion waited for hz_lock or for the CPU` }];
    const pb = E_(K, 'publishHazard'); let pw = -1, pl = 25;
    pb.forEach((t, i) => { const l = t - 50 * (i + 1); if (l > pl) { pl = l; pw = i; } });
    if (pw >= 0) return [{ unit: 'vision', from: 50 * (pw + 1), to: pb[pw], label: `hazard frame published ${pl} ms after its slot` }];
    if (pb.length < 18) return [{ unit: 'vision', from: 0, to: K.end - 1, label: `only ${pb.length} hazard frames published` }];
    if (rd.length < 18) return [{ unit: 'fusion', from: 0, to: K.end - 1, label: `only ${rd.length} hazard reads` }];
    const ex = E_(K, 'exchangeData'); let bw = -1, bl = 30;
    ex.forEach((t, i) => { const l = t - 100 * (i + 1); if (l > bl) { bl = l; bw = i; } });
    if (bw >= 0) return [{ unit: 'bus_mgr', from: 100 * (bw + 1), to: ex[bw], label: `bus exchange ${bl} ms late` }];
    const ms = S_(K, 'motorStep'); let mg = 11, mi = -1;
    for (let i = 1; i < ms.length; i++) if (ms[i] - ms[i - 1] > mg) { mg = ms[i] - ms[i - 1]; mi = i; }
    if (mi >= 0) return [{ unit: 'motor', from: ms[mi - 1], to: ms[mi], label: `${mg} ms between motor steps` }];
    return [];
  },
  bonus: B(70, 39156),
  briefing, reactions,
  diagnose: (K, res) => {
    if (K.crash) return reactions.fail;
    const v = K.units.find(u => u.name === 'vision'), f = K.units.find(u => u.name === 'fusion');
    const takes = u => u.code.some(i => i.op === 'take' && i.s === 'hz_lock');
    if (!res[2][0]) {
      if ([v, f].some(u => u.state === 'wait' && u.obj && u.obj.name === 'hz_lock')) return reactions.forgotGive;
      const torn = (K.w.hz || {}).torn || 0;
      if (!res[1][0] && !takes(f) && !torn) return reactions.delayNotLock;
      if (takes(v) && takes(f)) return torn ? reactions.fail : reactions.outsideLock;
      if (!takes(v) && !takes(f) && !torn) return reactions.hiddenRace;
      return takes(v) || takes(f) ? reactions.halfLocked : reactions.race;
    }
    if (!res[1][0]) {
      if (!takes(f)) return reactions.delayNotLock;
      return v.base > f.base ? reactions.readerStarved : reactions.longSection;
    }
    if (!res[0][0]) return reactions.noVision;
    return res.slice(3).some(r => !r[0]) ? reactions.regress : reactions.fail;
  },
  hints, solutionNote,
  // Unit order: stage 12 units 0..24, then vision (25), fusion (26). Looked up by name.
  wrong: [
    { name: 'both tasks left on core 1 (the start)', apply: p => { byName(p, 'vision').core = 1; byName(p, 'fusion').core = 1; }, crash: 'task_wdt' },
    { name: 'only vision moved', apply: p => { byName(p, 'fusion').core = 1; }, crash: 'task_wdt' },
    { name: 'only fusion moved', apply: p => { byName(p, 'vision').core = 1; }, crash: 'task_wdt' },
    { name: 'vision on any core', apply: p => { byName(p, 'vision').core = -1; }, crash: 'task_wdt' },
    { name: 'no lock', apply: p => { unlock(byName(p, 'vision')); unlock(byName(p, 'fusion')); }, fails: [2], says: 'race' },
    { name: 'no lock, race hidden by priority', apply: p => { unlock(byName(p, 'vision')); unlock(byName(p, 'fusion')); byName(p, 'fusion').prio = 3; }, fails: [2], says: 'hiddenRace' },
    { name: 'vision gives the lock before it publishes', apply: p => { byName(p, 'vision').code = [un(50), c('visionStep'), tk('hz_lock'), gv('hz_lock'), c('publishHazard')]; }, fails: [2], says: 'outsideLock' },
    { name: 'lock in vision only', apply: p => { unlock(byName(p, 'fusion')); }, fails: [2], says: 'halfLocked' },
    { name: 'lock in fusion only', apply: p => { unlock(byName(p, 'vision')); }, fails: [2], says: 'halfLocked' },
    { name: 'lock held across the whole analysis', apply: p => { byName(p, 'vision').code = [un(50), tk('hz_lock'), c('visionStep'), c('publishHazard'), gv('hz_lock')]; }, fails: [1], says: 'longSection' },
    { name: 'a delay instead of a lock', apply: p => { unlock(byName(p, 'vision')); byName(p, 'fusion').code = [un(50), d(20), c('readHazard'), c('fusionStep')]; }, fails: [1], says: 'delayNotLock' },
    { name: 'vision above fusion', apply: p => { byName(p, 'vision').prio = 3; }, fails: [1], says: 'readerStarved' },
    { name: 'vision never gives the lock', apply: p => { byName(p, 'vision').code = [un(50), c('visionStep'), tk('hz_lock'), c('publishHazard')]; }, fails: [0, 1, 2], says: 'forgotGive' },
    { name: 'vision does nothing', apply: p => { byName(p, 'vision').code = [un(50)]; }, fails: [0], says: 'noVision' },
    { name: 'vision spins', apply: p => { const v = byName(p, 'vision'); v.code = [bz(700), ...v.code]; }, crash: 'task_wdt' },
    { name: 'vision stack 1024', apply: p => { byName(p, 'vision').stack = 1024; }, crash: 'stack overflow' },
    { name: 'fusion stack 1024', apply: p => { byName(p, 'fusion').stack = 1024; }, crash: 'stack overflow' },
    { name: 'fusion gives twice', apply: p => { const f = byName(p, 'fusion'); f.code = [...f.code, gv('hz_lock')]; }, crash: 'does not hold' },
  ],
  alts: [
    { name: 'tight stacks', stars: 3, apply: p => { byName(p, 'vision').stack = 2768; byName(p, 'fusion').stack = 1568; } },
    { name: 'fusion above vision, lock kept', stars: 3, apply: p => { byName(p, 'fusion').prio = 3; } },
    { name: 'vision below fusion, lock kept', stars: 3, apply: p => { byName(p, 'vision').prio = 1; } },
    { name: 'fusion keeps the lock through fusionStep', stars: 3, apply: p => { byName(p, 'fusion').code = [un(50), d(8), tk('hz_lock'), c('readHazard'), c('fusionStep'), gv('hz_lock')]; } },
    { name: 'fusion stack 2048', stars: 2, apply: p => { byName(p, 'fusion').stack = 2048; } },
    { name: 'both stacks 4096', stars: 2, apply: p => { byName(p, 'vision').stack = 4096; byName(p, 'fusion').stack = 4096; } },
  ],
  widgets, manual, realCode, quiz,
};
