// Stage 12: priority inversion and inheritance. bus_lock is a binary semaphore (no owner, no inheritance); the fix is a mutex.
import { c, d, un, gv, tk, bz, task, E_, S_, B } from '../kernel.js';
import { lesson as stage11 } from './deadly-embrace.js';
import { lesson as stage9 } from './fold-the-antenna.js';
import { manual, realCode, quiz, widgets } from './pathfinder.content.js';
import { briefing, reactions, hints, solutionNote, passState } from './pathfinder.copy.js';

// bus_lock as the player first sees it: the editor select offers all three semaphore kinds (counting added so the choice is not binary/mutex by elimination)
const BINARY = () => ({ type: 'binary', init: 1, max: 8, types: ['binary', 'counting', 'mutex'] });
const seen = { n: 0 }; // browser only: inversion failures shown so far (the verifier runs under gjs, where document is undefined)
const holderName = K => { const o = K.objs.bus_lock, h = o && (o.owner || o.holder); return h ? h.name : 'weather'; }; // weather is the only other user of the lock
const inversionSays = () => typeof document === 'undefined' || seen.n++ > 0 ? reactions.inversion : reactions.observe; // first failure in the game: observation only
const clone = o => JSON.parse(JSON.stringify(o));
const byName = (p, n) => p.units.find(u => u.name === n);
const bmCode = () => [un(100), tk('bus_lock'), c('exchangeData'), gv('bus_lock')];
const wCode = () => [un(190), tk('bus_lock'), c('publishWeather'), gv('bus_lock')];
const addBus = p => {
  const cam = p.units.find(u => u.kind === 'task' && u.code.some(i => i.fn === 'compressFrame'));   // found by what it does: the player may have renamed it
  if (cam) cam.code = [d(240), c('compressFrame'), d(240)];     // was [compressFrame, d(120)]: frees CPU for the bus tasks
  p.units.push(task('bus_mgr', 2, bmCode(), { stack: 1344 }));          // unit 23
  p.units.push(task('weather', 1, wCode(), { stack: 1536 }));           // unit 24
  return p;
};

export const lesson = {
  id: 12, title: 'Pathfinder', topic: 'Priority inversion and inheritance', file: 'main/rover_main.c',
  T: 1000, cores: 1, heap: 8192, pins: ['BEACON', 'HEART'],
  ops: ['gpio', 'call', 'delay', 'until', 'busy', 'send', 'recv', 'take', 'give', 'giveISR', 'sendISR', 'notifyGive', 'notifyGiveISR', 'notifyTake', 'tReset', 'tStop', 'evSet', 'evWait'],
  fns: ['stopMotors', 'checkThermals', 'deployAntenna', 'stowAntenna', 'handlePacket', 'acquireLink', 'syncTime', 'acquireFix', 'sendUplink', 'positionArm', 'photograph', 'calibrateCamera', 'checkFocus', 'exchangeData', 'publishWeather', 'formatWeather', 'copyToBus'],
  irqs: { onBump: [150, 152], onPacket: [100, 420, 500, 580] },
  goals: [
    'Bus: all 9 exchanges finish within 30 ms of their 100 ms slot (no stall behind another task)',
    'Weather: at least 4 reports published in 1 s',
    'Locks: no bus, arm or camera call runs without the lock it needs',
    'Still working from stage 11: both photographs and both focus checks done, arm and camera tasks not stuck on a lock',
    'Still working from stage 10: the ground station rejects no packet, exactly one per window within 60 ms of the last bring-up (2 packets)',
    'Still working from stage 9: every packet handled within 60 ms, mast stowed once per pass 180 to 250 ms after the last packet, unfolded twice',
    'Still working from stages 7 and 8: no ISR longer than 1 ms, motors stopped within 3 ms of both impacts, a thermal check for each within 150 ms',
    'Still working from stage 6: no I2C collisions, IMU at least 45 reads, never more than 40 ms apart',
    'Still working from stage 5: all 10 samples transmitted, in order, none overwritten',
    'Still working from stages 3 and 4: mapper frees its frames (at least 3 frames, 2 paths), spectrometer 47 to 53 samples started in 1 s',
    'Still working from stages 1 and 2: motor never more than 11 ms between steps, telemetry never more than 105 ms between packets, at least 9 sent; BEACON every 500 ms and HEART every 200 ms (within 3 ms)',
  ],
  start: prev => {
    const p = addBus(clone(prev || stage11.solution()));
    p.objs.bus_lock = BINARY();
    return p;
  },
  solution: () => {
    const p = addBus(stage11.solution());
    p.objs.bus_lock = { type: 'mutex' };
    return p;
  },
  check: K => {
    const ex = E_(K, 'exchangeData'), lat = ex.map((t, i) => t - 100 * (i + 1));
    const pw = [...E_(K, 'publishWeather'), ...E_(K, 'copyToBus')];
    const wu = K.units.find(u => u.name === 'weather');
    passState.type = K.objs.bus_lock.type; passState.wPrio = wu ? wu.base : 1;
    const ph = E_(K, 'photograph'), cf = E_(K, 'checkFocus');
    const stuck = K.units.filter(u => ['arm', 'focus'].includes(u.name) && u.state === 'wait');
    const up = K.w.up || [], dn = K.w.done || {};
    const okU = up.filter(u => u.ok).map(u => u.t), rej = up.filter(u => !u.ok).length;
    const rounds = [0, 1].map(i => Math.max(...['link', 'time', 'fix'].map(k => (dn[k] || [])[i] ?? -1)));
    const upLat = rounds.map((r, i) => okU[i] === undefined || r < 0 ? -1 : okU[i] - r);
    const r9 = stage9.check(K);
    return [
      [ex.length === 9 && lat.every(x => x >= 0 && x <= 30), `${ex.length} exchanges, delays ${lat.join(', ')} ms`],
      [pw.length >= 4, `${pw.length} weather reports`],
      [K.stats.viol === 0, `${K.stats.viol} unprotected calls`],
      [ph.length >= 2 && cf.length >= 2 && !K.diag.some(s => /^(arm|focus) /.test(s)) && stuck.length === 0, `${ph.length} photographs, ${cf.length} focus checks, ${stuck.length} task(s) stuck`],
      [rej === 0 && okU.length === 2 && up.length === 2 && upLat.every(x => x >= 0 && x <= 60), `${up.length} packets, ${rej} rejected, accepted at ${okU.join(', ')} ms, delays ${upLat.join(', ')} ms (-1 = never)`],
      [r9[0][0] && r9[1][0] && r9[2][0], `${r9[0][1]} / ${r9[1][1]} / ${r9[2][1]}`],
      r9[3], r9[4], r9[5],
      [r9[6][0] && r9[7][0], `${r9[6][1]}; ${r9[7][1]}`],
      [r9[8][0] && r9[9][0], `${r9[8][1]}; ${r9[9][1]}`],
    ];
  },
  evidence: K => {
    if (K.crash) return [];
    const bm = K.units.find(u => u.name === 'bus_mgr');
    if (bm.state === 'wait' && bm.obj && bm.obj.name === 'bus_lock') {
      let t = K.end - 1; while (t > 0 && bm.tr[t] === 3) t--;
      const o = bm.obj, holder = o.owner ? o.owner.name : o.holder ? o.holder.name : 'nobody';
      return [{ unit: 'bus_mgr', from: t + 1, to: K.end - 1, label: `bus_mgr has waited ${K.end - 1 - t} ms for bus_lock, held by ${holder}` }];
    }
    const ex = E_(K, 'exchangeData'); let w = -1, lat = 30;
    ex.forEach((t, i) => { const l = t - 100 * (i + 1); if (l > lat) { lat = l; w = i; } });
    if (w >= 0) return [{ unit: 'bus_mgr', from: 100 * (w + 1), to: ex[w], label: `${lat} ms late: waiting for bus_lock (${holderName(K)} holds it)` }];
    const v = K.ev.find(e => e.k === 'log' && /ran without holding/.test(e.text));
    if (v) return [{ unit: v.text.startsWith('exchangeData') ? 'bus_mgr' : 'weather', from: v.t, to: Math.min(v.t + 12, K.end - 1), label: v.text }];
    const ms = S_(K, 'motorStep'); let mg = 11, mi = -1;
    for (let i = 1; i < ms.length; i++) if (ms[i] - ms[i - 1] > mg) { mg = ms[i] - ms[i - 1]; mi = i; }
    if (mi >= 0) return [{ unit: 'motor', from: ms[mi - 1], to: ms[mi], label: `${mg} ms between motor steps` }];
    const pw = E_(K, 'publishWeather').length + E_(K, 'copyToBus').length;
    if (pw < 4) return [{ unit: 'weather', from: 0, to: K.end - 1, label: `only ${pw} weather reports published` }];
    return [];
  },
  bonus: B(96, 34724),
  briefing, reactions,
  diagnose: (K, res) => {
    if (K.crash && /gave .* but does not hold/.test(K.crash.msg)) return reactions.giveNotHeld;
    if (K.crash && /stack overflow/.test(K.crash.msg)) return reactions.stack;
    if (K.crash && /task_wdt/.test(K.crash.msg)) return reactions.busyLoop;
    if (K.crash) return reactions.fail;
    const bm = K.units.find(u => u.name === 'bus_mgr'), w = K.units.find(u => u.name === 'weather'), lock = K.objs.bus_lock;
    if (!res[2][0]) return reactions.noLock;
    if (!res[0][0] || !res[1][0]) {
      if (bm.state === 'wait' && bm.obj === lock && bm.dl === Infinity && w.state !== 'ready' && w.state !== 'idle' && (w.held.includes(lock) || lock.holder === w)) return reactions.forgotGive;
      const ops = w.code.map(i => i.op), a = ops.indexOf('take'), b = ops.lastIndexOf('give');
      if (a >= 0 && b > a && ops.slice(a, b).some(o => o === 'delay' || o === 'until')) return reactions.sleepsHolding;
      if (!res[0][0]) return lock.type !== 'mutex' ? inversionSays() : bm.prio <= w.prio ? reactions.bmTooLow : reactions.fail;
      return reactions.starved;
    }
    if (!res[10][0] || !res[7][0]) return reactions.hog;
    if (!res[3][0]) return reactions.regress;
    return reactions.fail;
  },
  hints, solutionNote,
  // Unit order: stage 11 units 0..22, then bus_mgr (23), weather (24). Looked up by name.
  wrong: [
    { name: 'binary semaphore left as it is (the start)', apply: p => { p.objs.bus_lock = BINARY(); }, fails: [0], says: 'inversion' },
    { name: 'bus_mgr raised to 3, still binary', apply: p => { p.objs.bus_lock = BINARY(); byName(p, 'bus_mgr').prio = 3; }, fails: [0], says: 'inversion' },
    { name: 'mutex but bus_mgr no higher than weather', apply: p => { byName(p, 'bus_mgr').prio = 1; }, fails: [0], says: 'bmTooLow' },
    { name: 'fix by a huge priority on weather', apply: p => { p.objs.bus_lock = BINARY(); byName(p, 'weather').prio = 5; }, fails: [10], says: 'hog' },
    { name: 'fix by a huge priority on bus_mgr', apply: p => { byName(p, 'bus_mgr').prio = 5; }, fails: [10], says: 'hog' },
    { name: 'no locking at all', apply: p => { for (const n of ['bus_mgr', 'weather']) byName(p, n).code = byName(p, n).code.filter(x => x.op !== 'take' && x.op !== 'give'); }, fails: [2], says: 'noLock' },
    { name: 'weather never gives the lock', apply: p => { const w = byName(p, 'weather'); w.code = w.code.filter(x => x.op !== 'give'); }, fails: [0, 1], says: 'forgotGive' },
    { name: 'weather sleeps holding the lock', apply: p => { byName(p, 'weather').code = [un(190), tk('bus_lock'), c('publishWeather'), d(60), gv('bus_lock')]; }, fails: [0], says: 'sleepsHolding' },
    { name: 'weather publishes nothing', apply: p => { byName(p, 'weather').code = [un(190)]; }, fails: [1], says: 'starved' },
    { name: 'bus_mgr gives twice', apply: p => { byName(p, 'bus_mgr').code.push(gv('bus_lock')); }, crash: 'does not hold' },
    { name: 'weather spins before locking', apply: p => { byName(p, 'weather').code = [bz(700), ...wCode()]; }, crash: 'task_wdt' },
    { name: 'weather stack 1024', apply: p => { byName(p, 'weather').stack = 1024; }, crash: 'stack overflow' },
    { name: 'bus_mgr stack 1024', apply: p => { byName(p, 'bus_mgr').stack = 1024; }, crash: 'stack overflow' },
  ],
  alts: [
    { name: 'fix it by hand: weather at priority 2', stars: 3, apply: p => { p.objs.bus_lock = BINARY(); byName(p, 'weather').prio = 2; } },
    { name: 'short critical section', stars: 3, apply: p => { p.objs.bus_lock = BINARY(); byName(p, 'weather').code = [un(190), c('formatWeather'), tk('bus_lock'), c('copyToBus'), gv('bus_lock')]; } },
    { name: 'short critical section and mutex', stars: 3, apply: p => { byName(p, 'weather').code = [un(190), c('formatWeather'), tk('bus_lock'), c('copyToBus'), gv('bus_lock')]; } },
    { name: 'mutex and weather at priority 2', stars: 3, apply: p => { byName(p, 'weather').prio = 2; } },
    { name: 'tight stacks', stars: 3, apply: p => { byName(p, 'bus_mgr').stack = 1268; byName(p, 'weather').stack = 1468; } },
    { name: 'both stacks 2048', stars: 2, apply: p => { byName(p, 'bus_mgr').stack = 2048; byName(p, 'weather').stack = 2048; } },
    { name: 'both stacks 4096', stars: 2, apply: p => { byName(p, 'bus_mgr').stack = 4096; byName(p, 'weather').stack = 4096; } },
  ],
  widgets, manual, realCode, quiz,
};
