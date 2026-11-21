// Stage 14: production hardening. The start has a naive watchdog setup and a leaking diag task; the player fixes the watchdog, the heap leak and the thin stacks.
import { c, d, un, bz, wa, wr, task, E_, B } from '../kernel.js';
import { lesson as stage13 } from './two-brains.js';
import { lesson as stage12 } from './pathfinder.js';
import { manual, realCode, quiz, widgets } from './flight-readiness-review.content.js';
import { briefing, reactions, hints, solutionNote } from './flight-readiness-review.copy.js';

const clone = o => JSON.parse(JSON.stringify(o));
const byName = (p, n) => p.units.find(u => u.name === n);
const unwd = u => { u.code = u.code.filter(i => i.op !== 'wdtAdd' && i.op !== 'wdtReset'); };
const fix = p => { byName(p, 'beacon').stack = 800; byName(p, 'heart').stack = 800; byName(p, 'motor').stack = 1100; byName(p, 'spectro').stack = 1300; };
const mkDiag = code => task('diag', 1, code, { stack: 2200, core: 0 });
const diagLoop = [un(150), c('allocFrame'), c('logStatus'), c('logToFlash')];

export const lesson = {
  id: 14, title: 'Flight Readiness Review', topic: 'Production hardening', file: 'main/rover_main.c',
  T: 1000, cores: 2, heap: 8192, wdtTimeout: 300, pins: ['BEACON', 'HEART'],
  ops: [...stage13.ops, 'wdtAdd', 'wdtReset'],
  fns: [...new Set([...stage13.fns, 'allocFrame', 'freeFrame', 'logStatus', 'logToFlash'])],
  irqs: { onBump: [150, 152], onPacket: [100, 420, 500, 580] },
  chartGrid: { unit: 'diag', period: 150 },
  goals: [
    'Watchdog: no task reset by the watchdog, the motor task still watched, and every watched task feeds it',
    'Heap: all frames given back, never more than the 8192 B that exist',
    'Stack margin: every task keeps at least 32 B of unused stack',
    'Diagnostics: at least 6 snapshots written to flash, each within 100 ms of its 150 ms slot',
    'Still working from stage 13: 18 hazard frames within 25 ms and 18 reads within 15 ms of their 50 ms slots, never torn, nobody stuck on hz_lock',
    'Still working from stage 12: all 9 bus exchanges within 30 ms of their slot, at least 4 weather reports, no call without its lock',
    'Still working from stages 10 and 11: both photographs and focus checks done, uplink accepted once per window',
    'Still working from stage 9: every packet handled within 60 ms, mast stowed once per pass, unfolded twice',
    'Still working from stages 7 and 8: no ISR longer than 1 ms, motors stopped within 3 ms of both impacts, thermal check within 150 ms',
    'Still working from stages 5 and 6: no I2C collisions, IMU at least 45 reads never 40 ms apart, all 10 samples transmitted in order',
    'Still working from stages 1 to 4: mapper frees its frames, spectrometer 47 to 53 samples, motor never more than 11 ms between steps, telemetry never more than 105 ms apart, BEACON and HEART on time',
  ],
  start: prev => {
    const p = clone(prev || stage13.solution());
    // The review team subscribes three tasks to the watchdog. They are found by what they do (the player may have renamed
    // them) and keep the player's own loop: the subscription goes in front of it and the reset at its end.
    for (const fn of ['motorStep', 'compressFrame', 'readSample']) {
      const u = p.units.find(x => x.kind === 'task' && x.code.some(i => i.fn === fn));
      if (u && !u.code.some(i => i.op === 'wdtAdd')) u.code = [wa(), ...u.code, wr()];
    }
    p.units.push(mkDiag(diagLoop));
    return p;
  },
  solution: () => {
    const p = stage13.solution();
    byName(p, 'motor').code = [wa(), c('motorStep'), d(8), wr()];
    p.units.push(mkDiag([...diagLoop, c('freeFrame')]));
    fix(p);
    return p;
  },
  check: K => {
    const mx = a => a.length ? Math.max(...a) : -1;
    const sub = [...K.wdt.keys()], names = sub.map(u => u.name);
    const feeds = sub.every(u => u.code.some(i => i.op === 'wdtReset'));
    const spare = K.units.filter(u => u.kind === 'task').map(u => ({ n: u.name, s: u.stack - u.hw }));
    const thin = spare.filter(x => x.s < 32);
    const lg = E_(K, 'logToFlash'), ll = lg.map((t, i) => t - 150 * (i + 1));
    const r13 = stage13.detail(K), r12 = stage12.check(K);   // detail(): one row per measurement, stable order
    const pub = E_(K, 'publishHazard'), pl = pub.map((t, i) => t - 50 * (i + 1));
    const rd = E_(K, 'readHazard'), rl = rd.map((t, i) => t - 50 * (i + 1));
    const fu = E_(K, 'fusionStep');
    const torn = (K.w.hz || {}).torn || 0;
    const stuckHz = K.units.filter(u => ['vision', 'fusion'].includes(u.name) && u.state === 'wait' && u.obj && u.obj.name === 'hz_lock');
    return [
      [names.includes('motor') && feeds, `watched: ${names.join(', ') || 'nobody'}`],
      [K.heap >= 6144 && K.heap <= 8192, `${K.heap} B heap free at the end`],
      [thin.length === 0, thin.length ? thin.map(x => `${x.n} ${x.s} B`).join(', ') : `least spare ${Math.min(...spare.map(x => x.s))} B`],
      [lg.length >= 6 && ll.every(x => x >= 0 && x <= 100), `${lg.length} snapshots, worst delay ${mx(ll)} ms`],
      [pub.length >= 18 && pl.every(x => x >= 0 && x <= 25) && rd.length >= 18 && fu.length >= 18 && rl.every(x => x >= 0 && x <= 15) && torn === 0 && stuckHz.length === 0 && r13[2][0], `${pub.length} frames worst ${mx(pl)} ms, ${rd.length} reads worst ${mx(rl)} ms, ${r13[2][1]}`],
      r13[3],
      [r13[4][0] && r13[5][0], `${r13[4][1]}; ${r13[5][1]}`],
      r13[6], r13[7], [r13[8][0] && r13[9][0] && r13[10][0], `${r13[8][1]}; ${r13[9][1]}`],
      [r13[10][0] && r13[11][0], `${r13[10][1]}; ${r13[11][1]}`],
    ];
  },
  evidence: K => {
    if (K.crash) return [];
    const sub = [...K.wdt.keys()], first = u => { let t = 0; while (t < K.end - 1 && u.tr[t] !== 1 && u.tr[t] !== 4) t++; return t; };
    const unfed = sub.find(u => !u.code.some(i => i.op === 'wdtReset'));
    if (unfed) return [{ unit: unfed.name, from: first(unfed), to: Math.min(first(unfed) + 30, K.end - 1), label: `${unfed.name} called esp_task_wdt_add() but never calls esp_task_wdt_reset()` }];
    if (!sub.some(u => u.name === 'motor')) { const m = K.units.find(u => u.name === 'motor'); return [{ unit: 'motor', from: first(m), to: Math.min(first(m) + 30, K.end - 1), label: 'motor is not watched: a hung motor task would go unnoticed' }]; }
    if (K.heap > 8192) { const dg = K.units.find(u => u.name === 'diag'); return [{ unit: 'diag', from: first(dg), to: K.end - 1, label: `heap grew to ${K.heap} B: more was freed than was allocated (diag frees twice)` }]; }
    if (K.heap < 6144) { const dg = K.units.find(u => u.name === 'diag'); return [{ unit: 'diag', from: first(dg), to: K.end - 1, label: `heap down to ${K.heap} B: ${Math.round((8192 - K.heap) / 2048)} frame(s) taken by diag and never freed` }]; }
    const th = K.units.filter(u => u.kind === 'task').map(u => ({ u, s: u.stack - u.hw })).filter(x => x.s < 32).sort((a, b) => a.s - b.s)[0];
    if (th) return [{ unit: th.u.name, from: first(th.u), to: Math.min(first(th.u) + 12, K.end - 1), label: `${th.u.name}: peak stack use ${th.u.hw} of ${th.u.stack} B, only ${th.s} B spare` }];
    const lg = E_(K, 'logToFlash'); let w = -1, wl = 100;
    lg.forEach((t, i) => { const l = t - 150 * (i + 1); if (l > wl) { wl = l; w = i; } });
    if (w >= 0) return [{ unit: 'diag', from: 150 * (w + 1), to: lg[w], label: `snapshot ${wl} ms after its slot` }];
    if (lg.length < 6) return [{ unit: 'diag', from: 0, to: K.end - 1, label: `only ${lg.length} snapshots written to flash` }];
    return stage13.evidence(K);
  },
  bonus: B(74, 41324),
  briefing, reactions,
  diagnose: (K, res) => {
    if (K.crash && /stack overflow/.test(K.crash.msg)) return reactions.stack;
    if (K.crash && /pvPortMalloc/.test(K.crash.msg)) return reactions.heap;
    if (K.crash && /task_wdt/.test(K.crash.msg)) return /IDLE\d/.test(K.crash.msg) ? reactions.coreFull : reactions.watchdog;
    if (K.crash) return reactions.fail;
    if (!res[0][0]) {
      const sub = [...K.wdt.keys()];
      return sub.some(u => !u.code.some(i => i.op === 'wdtReset')) ? reactions.neverFeeds : reactions.noWatch;
    }
    if (!res[1][0]) return reactions.doubleFree;
    if (!res[2][0]) return reactions.thinStack;
    if (!res[3][0]) return reactions.fewLogs;
    if (!res[4][0]) { const dg = K.units.find(u => u.name === 'diag'); return dg.base > 1 ? reactions.diagHog : reactions.regress; }
    return res.slice(5).some(r => !r[0]) ? reactions.regress : reactions.fail;
  },
  hints, solutionNote,
  wrong: [
    { name: 'the start (camera and science still watched)', apply: p => { byName(p, 'camera').code = [wa(), d(240), c('compressFrame'), d(240), wr()]; byName(p, 'science').code = [wa(), ...byName(p, 'science').code, wr()]; byName(p, 'diag').code = diagLoop; }, crash: 'task_wdt' },
    { name: 'camera fixed, science still watched', apply: p => { const s = byName(p, 'science'); s.code = [wa(), ...s.code, wr()]; byName(p, 'diag').code = diagLoop; }, crash: 'task_wdt' },
    { name: 'watch the arm too', apply: p => { const a = byName(p, 'arm'); a.code = [wa(), ...a.code, wr()]; }, crash: 'task_wdt' },
    { name: 'diag on the full core', apply: p => { byName(p, 'diag').core = 1; }, crash: 'task_wdt' },
    { name: 'diag spins', apply: p => { const dg = byName(p, 'diag'); dg.code = [bz(700), ...dg.code]; }, crash: 'task_wdt' },
    { name: 'leak left', apply: p => { byName(p, 'diag').code = diagLoop; }, crash: 'pvPortMalloc' },
    { name: 'diag stack 2048', apply: p => { byName(p, 'diag').stack = 2048; }, crash: 'stack overflow' },
    { name: 'watchdog removed everywhere', apply: p => { unwd(byName(p, 'motor')); }, fails: [0], says: 'noWatch' },
    { name: 'subscribed but never fed', apply: p => { byName(p, 'motor').code = [wa(), c('motorStep'), d(8)]; }, fails: [0], says: 'neverFeeds' },
    { name: 'diag frees twice', apply: p => { byName(p, 'diag').code = [...diagLoop, c('freeFrame'), c('freeFrame')]; }, crash: 'double free' },
    { name: 'stacks left tight', apply: p => { byName(p, 'beacon').stack = 768; byName(p, 'heart').stack = 768; byName(p, 'motor').stack = 1088; byName(p, 'spectro').stack = 1280; }, fails: [2], says: 'thinStack' },
    { name: 'only one stack fixed', apply: p => { byName(p, 'spectro').stack = 1280; }, fails: [2], says: 'thinStack' },
    { name: 'diag stack exactly at the peak', apply: p => { byName(p, 'diag').stack = 2168; }, fails: [2], says: 'thinStack' },
    { name: 'diagnostics on the slow side', apply: p => { byName(p, 'diag').code[0] = un(300); }, fails: [3], says: 'fewLogs' },
    { name: 'diagnostics removed', apply: p => { byName(p, 'diag').code = [un(150)]; }, fails: [3], says: 'fewLogs' },
    { name: 'diag at priority 3', apply: p => { byName(p, 'diag').prio = 3; }, fails: [4], says: 'diagHog' },
    { name: 'diag at priority 2', apply: p => { byName(p, 'diag').prio = 2; }, fails: [4], says: 'diagHog' },
    { name: 'hazard lock removed', apply: p => { for (const n of ['vision', 'fusion']) { const u = byName(p, n); u.code = u.code.filter(i => !((i.op === 'take' || i.op === 'give') && i.s === 'hz_lock')); } }, fails: [4], says: 'regress' },
  ],
  alts: [
    { name: 'camera kept on the watchdog, fed between phases', stars: 3, apply: p => { byName(p, 'camera').code = [wa(), d(240), wr(), c('compressFrame'), wr(), d(240)]; } },
    { name: 'telemetry watched too', stars: 3, apply: p => { byName(p, 'telemetry').code = [wa(), c('sendTelemetry'), d(85), wr()]; } },
    { name: 'vision watched too', stars: 3, apply: p => { const v = byName(p, 'vision'); v.code = [wa(), ...v.code, wr()]; } },
    { name: 'motor fed in the middle of its loop', stars: 3, apply: p => { byName(p, 'motor').code = [wa(), c('motorStep'), wr(), d(8)]; } },
    { name: 'diag frees before logging', stars: 3, apply: p => { byName(p, 'diag').code = [un(150), c('allocFrame'), c('logStatus'), c('freeFrame'), c('logToFlash')]; } },
    { name: 'diag watched', stars: 3, apply: p => { const dg = byName(p, 'diag'); dg.code = [wa(), ...dg.code, wr()]; } },
    { name: '64 B margins', stars: 3, apply: p => { byName(p, 'beacon').stack = 832; byName(p, 'heart').stack = 832; byName(p, 'motor').stack = 1132; byName(p, 'spectro').stack = 1332; } },
    { name: 'every stack 4096', stars: 2, apply: p => { p.units.filter(u => u.kind === 'task').forEach(u => { u.stack = 4096; }); } },
  ],
  widgets, manual, realCode, quiz,
};
