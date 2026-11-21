// Stage 101 (side mission): ESP32 sleep modes. Stand-alone: start(null) builds the whole program.
import { c, d, bz, wt, ds, task, gapsOf } from '../kernel.js';
import { manual, realCode, quiz, widgets } from './martian-night.content.js';
import { briefing, reactions, hints, solutionNote } from './martian-night.copy.js';

const rd = c('readTemperature'), cn = c('wifiConnect'), sd = c('wifiSend'), st = c('wifiStop');
const reports = K => K.w.reports || [];

export const lesson = {
  id: 101, side: true, power: true, title: 'Martian Night', topic: 'ESP32 sleep modes: light sleep, deep sleep and what a wake-up costs',
  adds: 'Night mode: temperature reports on a power budget',
  file: 'main/night_report.c', T: 30000, cores: 1, pins: [],
  ops: ['call', 'delay', 'busy', 'wakeTimer', 'deepSleep'], fns: ['readTemperature', 'wifiConnect', 'wifiSend', 'wifiStop'],
  goals: [
    'Reporting: at least 3 temperature readings reach Mission Control in 30 s',
    'Reporting: a reading every 10 s (each gap between 9700 and 10300 ms)',
    'Every report is a fresh reading sent over a live Wi-Fi link (no driver errors)',
    'Night budget: average current at most 40 mA',
  ],
  // the pm object puts the esp_pm_configure() line in app_main, so the player can switch automatic light sleep on
  start: () => ({ objs: { pm: { type: 'pm', lightSleep: false } }, units: [task('reporter', 2, [rd, cn, sd, d(10000)], { stack: 4096 })] }),
  solution: () => ({ objs: { pm: { type: 'pm', lightSleep: false } }, units: [task('reporter', 2, [rd, cn, sd, st, wt(10000), ds()], { stack: 4096 })] }),
  check: K => {
    const reps = reports(K), g = gapsOf(reps);
    return [
      [reps.length >= 3, `${reps.length} readings delivered`],
      [g.length >= 2 && g.every(x => x >= 9700 && x <= 10300), `gaps: ${g.join(', ') || 'none'} ms`],
      [K.stats.viol === 0, `${K.stats.viol} driver error(s)`],
      [K.m.avgmA <= 40, `${K.m.avgmA} mA average`],
    ];
  },
  // where on the chart the unmet objective shows: the first driver error, the sleep nothing ended, or the first wrong gap
  evidence: K => {
    const u = K.units.find(x => x.kind === 'task'); if (!u) return [];
    const err = K.ev.find(e => e.k === 'log' && e.c === 'e' && !/Test finished|Rebooting/.test(e.text));
    if (K.stats.viol && err) return [{ unit: u.name, from: Math.max(0, err.t - 200), to: Math.min(err.t + 200, K.end - 1), label: err.text.slice(0, 90) }];
    const reps = reports(K), g = gapsOf(reps);
    if (K.w.sleeps && !K.w.boots) { const from = reps.length ? reps[reps.length - 1] : 0; return [{ unit: u.name, from, to: K.end - 1, label: 'deep sleep with no wake-up source: nothing runs again' }]; }
    const bad = g.findIndex(x => x < 9700 || x > 10300);
    if (bad >= 0) return [{ unit: u.name, from: reps[bad], to: reps[bad + 1], label: `${g[bad]} ms between two reports (want 9700 to 10300)` }];
    return [];
  },
  powerMarks: [40, 3.5, 2.8],   // budget lines on the current row
  bonus: [
    { label: 'Light sleeper: chip sleeps, Wi-Fi off, average current at most 3.5 mA', ok: K => K.m.avgmA <= 3.5 },
    { label: 'Deep sleeper: chip powers down between reports, average current at most 2.8 mA', ok: K => K.m.avgmA <= 2.8 },
  ],
  // Other correct designs the verifier proves reachable, with the stars each earns.
  alts: [
    { name: 'automatic light sleep instead of deep sleep', stars: 2, apply: p => { p.objs.pm.lightSleep = true; p.units[0].code = [rd, cn, sd, st, d(10000)]; } },
    { name: 'Wi-Fi stopped, chip left awake', stars: 1, apply: p => { p.units[0].code = [rd, cn, sd, st, d(10000)]; } },
  ],
  briefing, reactions,
  diagnose: (K, res) => {
    if (!res[0][0] || !res[1][0]) {
      if (K.w.sleeps && !K.w.boots) return reactions.nowake;
      const reps = reports(K);
      if (!reps.length) return reactions.lostState;
      const g = gapsOf(reps);
      if (g.length && Math.min(...g) < 9700) return reactions.tooOften;
      return reactions.fail;
    }
    if (!res[2][0]) return reactions.lostState;
    if (!res[3][0]) return K.lightSleepOn ? reactions.wifiOn : reactions.awake;   // the light-sleep reply only once light sleep is switched on
    return reactions.fail;
  },
  hints, solutionNote,
  // Unit 0 is the reporter. Code: 0 read, 1 connect, 2 send, 3 stop, 4 wake timer, 5 deep sleep.
  wrong: [
    { name: 'deep sleep with no wake source', apply: p => { p.units[0].code.splice(4, 1); }, fails: [0, 1], says: 'nowake' },
    { name: 'forgot Wi-Fi after waking', apply: p => { p.units[0].code.splice(1, 1); }, fails: [0, 1, 2], says: 'lostState' },
    { name: 'forgot to read after waking', apply: p => { p.units[0].code.splice(0, 1); }, fails: [0, 1, 2], says: 'lostState' },
    { name: 'sleeping before sending', apply: p => { p.units[0].code = [rd, cn, wt(10000), ds(), sd, st]; }, fails: [0, 1], says: 'lostState' },
    { name: 'wake timer in the wrong unit', apply: p => { p.units[0].code[4] = wt(10); }, fails: [1, 3], says: 'tooOften' },
    { name: 'light sleep, Wi-Fi left on', apply: p => { p.objs.pm = { type: 'pm', lightSleep: true }; p.units[0].code = [rd, cn, sd, d(10000)]; }, fails: [3], says: 'wifiOn' },
    { name: 'busy-wait instead of delay', apply: p => { p.units[0].code = [rd, cn, sd, st, bz(10000)]; }, crash: 'task_wdt' },
  ],
  widgets, manual, realCode, quiz,
};
