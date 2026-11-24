// Stage 102 (side mission): state machines. One task waits on an event queue and dispatches each event through a
// table of transitions: in state S, on event E, run action A and go to state N. Stand-alone: start(null) builds the program.
import { rc, fs, row, task, leanRam, SPARE, DRILL } from '../kernel.js';
import { manual, realCode, quiz, widgets } from './mode-control.content.js';
import { briefing, reactions, hints, solutionNote } from './mode-control.copy.js';

const STATES = ['IDLE', 'DRIVING', 'SAMPLING', 'SAFE'];
const EVENTS = ['CMD_DRIVE', 'CMD_STOP', 'CMD_SAMPLE', 'DRILL_DONE', 'HAZARD', 'CMD_RESUME'];
const ACTIONS = ['startMotors', 'stopMotors', 'startDrill', 'drillSample', 'retractDrill', 'sendReport'];
// What Mission Control and the sensors send during the test. `want` is what a correct rover does with a command:
// 'go' = obey it, 'no' = it must not act on it (the reason is in `why`).
const SCRIPT = [
  { t: 100, ev: 'CMD_DRIVE', want: 'go' }, { t: 400, ev: 'CMD_SAMPLE', want: 'no', why: 'the wheels are turning' },
  { t: 500, ev: 'HAZARD' }, { t: 650, ev: 'CMD_DRIVE', want: 'no', why: 'the hazard is not cleared' }, { t: 800, ev: 'CMD_RESUME' },
  { t: 900, ev: 'CMD_SAMPLE', want: 'go' }, { t: 1050, ev: 'CMD_DRIVE', want: 'no', why: 'the drill is in the ground' },
  { t: 1400, ev: 'HAZARD' }, { t: 1500, ev: 'CMD_DRIVE', want: 'no', why: 'the hazard is not cleared' }, { t: 1600, ev: 'CMD_RESUME' },
  { t: 1700, ev: 'CMD_DRIVE', want: 'go' }, { t: 1900, ev: 'CMD_STOP' }, { t: 2000, ev: 'CMD_SAMPLE', want: 'go' },
  { t: 2200, ev: 'HAZARD' }, { t: 2350, ev: 'CMD_SAMPLE', want: 'no', why: 'the hazard is not cleared' }, { t: 2500, ev: 'CMD_RESUME' },
  { t: 2600, ev: 'CMD_SAMPLE', want: 'go' },
];
const at = ev => SCRIPT.filter(e => e.ev === ev).map(e => e.t);
const rv = K => K.w.rv || { mot: [], dr: [], rep: [], smp: [], hz: [] };
/** level of a logged on/off signal at time t (inclusive) */
const level = (log, t) => { let v = 0; for (const e of log) { if (e.t > t) break; v = e.on; } return v; };
const within = (log, t, on, ms) => log.find(e => e.on === on && e.t >= t && e.t <= t + ms);
const faults = (K, re) => K.ev.filter(e => e.k === 'log' && e.c === 'e' && re.test(e.text));
const trs = K => (K.w.fsm || { tr: [] }).tr;
const mode = K => K.units.find(u => u.code.some(i => i.op === 'fsm')) || K.units.find(u => u.kind === 'task');
const rowsOf = p => { for (const u of p.units) for (const i of u.code) if (i.op === 'fsm') return i.rows; return []; };

/** every measurement, one row each; check() groups nothing, so the rows are the objectives */
function measure(K) {
  const v = rv(K), T = trs(K), evs = K.w.evs || [];
  const go = SCRIPT.filter(e => e.ev === 'CMD_DRIVE' && e.want === 'go'), late = go.filter(e => !within(v.mot, e.t, 1, 20)), stopLate = at('CMD_STOP').filter(t => level(v.mot, t + 20));
  const hzBad = at('HAZARD').filter(t => t + 10 < K.end && (level(v.mot, t + 10) || level(v.dr, t + 10)));
  const hzF = faults(K, /hazard is not cleared/), drF = faults(K, /drill bit snapped|already in the ground/);
  const lat = T.map(r => r.t - r.tq), worst = lat.length ? Math.max(...lat) : 0, unseen = evs.length - T.length;
  return { v, T, late, stopLate, hzBad, hzF, drF, worst, unseen, lost: (K.w.evLost || []).length };
}

export const lesson = {
  id: 102, side: true, title: 'Mode Control', topic: 'State machines: states, events and transitions in one task',
  adds: 'A mode manager: drive, drill and safe mode that never mix',
  file: 'main/mode_manager.c', T: 3200, cores: 1, pins: [],
  ops: ['call', 'delay'], fns: ACTIONS,
  fsm: { states: STATES, events: EVENTS, actions: ACTIONS, init: 'IDLE', queue: 'events', script: SCRIPT },
  goals: [
    'Drive: the wheels start within 20 ms of every CMD_DRIVE the rover may obey and stop within 20 ms of CMD_STOP',
    'Hazard: 10 ms after every HAZARD the wheels are stopped and the drill is up',
    'Safe mode: after a hazard nothing moves until CMD_RESUME',
    'Drill safety: the drill is never down while the wheels turn',
    'Science: 2 samples drilled and reported, no empty report',
    'Responsive: every event is handled within 10 ms of its arrival',
  ],
  // The naive firmware has no states: every event is answered the same way whatever the rover is doing.
  start: () => ({ objs: { events: { type: 'queue', len: 8, item: 16 } }, units: [task('mode', 3, [rc('events', -1), fs([
    row('IDLE', 'CMD_DRIVE', 'startMotors', 'IDLE'), row('IDLE', 'CMD_STOP', 'stopMotors', 'IDLE'), row('IDLE', 'CMD_SAMPLE', 'drillSample', 'IDLE'),
    row('IDLE', 'DRILL_DONE', 'sendReport', 'IDLE'), row('IDLE', 'HAZARD', 'stopMotors', 'IDLE')])], { stack: 4096 })] }),
  solution: () => ({ objs: { events: { type: 'queue', len: 8, item: 16 } }, units: [task('mode', 3, [rc('events', -1), fs([
    row('IDLE', 'CMD_DRIVE', 'startMotors', 'DRIVING'), row('IDLE', 'CMD_SAMPLE', 'startDrill', 'SAMPLING'), row('IDLE', 'HAZARD', '', 'SAFE'),
    row('DRIVING', 'CMD_STOP', 'stopMotors', 'IDLE'), row('DRIVING', 'HAZARD', 'stopMotors', 'SAFE'), row('DRIVING', 'CMD_SAMPLE', '', 'DRIVING'),
    row('SAMPLING', 'DRILL_DONE', 'sendReport', 'IDLE'), row('SAMPLING', 'HAZARD', 'retractDrill', 'SAFE'), row('SAMPLING', 'CMD_DRIVE', '', 'SAMPLING'),
    row('SAFE', 'CMD_RESUME', '', 'IDLE'), row('SAFE', 'CMD_DRIVE', '', 'SAFE'), row('SAFE', 'CMD_SAMPLE', '', 'SAFE')])], { stack: 2048 })] }),
  check: K => {
    const m = measure(K);
    return [
      [!m.late.length && !m.stopLate.length, m.late.length ? `no wheels within 20 ms of CMD_DRIVE at ${m.late.map(e => e.t).join(', ')} ms` : m.stopLate.length ? `wheels still turning 20 ms after CMD_STOP at ${m.stopLate.join(', ')} ms` : 'every drive and stop command obeyed in time'],
      [!m.hzBad.length, m.hzBad.length ? `not safe 10 ms after the HAZARD at ${m.hzBad.join(', ')} ms` : 'safe within 10 ms of every hazard'],
      [!m.hzF.length, `${m.hzF.length} movement(s) while a hazard was not cleared`],
      [!m.drF.length, `${m.drF.length} time(s) drill and wheels together`],
      [m.v.rep.length >= 2 && !faults(K, /empty report/).length, `${m.v.smp.length} drilled, ${m.v.rep.length} reported`],
      [m.worst <= 10 && !m.unseen && !m.lost, m.lost ? `${m.lost} event(s) dropped: the queue was full` : m.worst > 10 ? `slowest: ${m.worst} ms` : m.unseen ? `${m.unseen} event(s) never handled` : `slowest: ${m.worst} ms`],
    ];
  },
  bonus: [
    { label: 'Deliberate: every event that arrives finds a row in the table, even if the row only says "stay"', ok: K => trs(K).length > 0 && trs(K).every(r => r.hit) },
    { label: `Lean: at most 2200 bytes of RAM, not counting up to ${SPARE} B of spare stack per task`, ok: K => leanRam(K) <= 2200 },
  ],
  // where on the chart the first unmet objective shows
  evidence: K => {
    const u = mode(K); if (!u) return []; const m = measure(K), n = u.name, end = K.end - 1, B = (from, to, label) => [{ unit: n, from: Math.max(0, from), to: Math.min(Math.max(to, from + 1), end), label }];
    const slow = m.T.find(r => r.t - r.tq > 10); if (slow) return B(slow.tq, slow.t, `${slow.ev} waited ${slow.t - slow.tq} ms: the task was busy inside an action`);
    if (m.drF.length) return B(m.drF[0].t - 5, m.drF[0].t + 5, m.drF[0].text.slice(0, 80));
    if (m.hzBad.length) { const t = m.hzBad[0], r = m.T.find(x => x.ev === 'HAZARD' && x.tq === t); return B(t, t + 10, r && !r.hit ? `HAZARD in state ${r.from}: no row, so nothing was made safe` : `10 ms after the HAZARD at ${t} ms the rover is not safe`); }
    if (m.hzF.length) return B(m.hzF[0].t - 5, m.hzF[0].t + 5, m.hzF[0].text.slice(0, 80));
    if (m.late.length) { const e = m.late[0], r = m.T.find(x => x.ev === 'CMD_DRIVE' && x.tq === e.t); return B(e.t, e.t + 20, r ? `CMD_DRIVE in state ${r.from}: ${r.hit ? 'the row did not start the wheels' : 'no row'}` : 'CMD_DRIVE was never handled'); }
    if (m.stopLate.length) { const t = m.stopLate[0], r = m.T.find(x => x.ev === 'CMD_STOP' && x.tq === t); return B(t, t + 20, r ? `CMD_STOP in state ${r.from}: ${r.hit ? 'the row did not stop the wheels' : 'no row, the wheels kept turning'}` : 'CMD_STOP was never handled'); }
    if (m.v.rep.length < 2) { const r = m.T.find(x => x.ev === 'DRILL_DONE' && x.act !== 'sendReport'); return r ? B(r.tq, r.t + 5, `DRILL_DONE in state ${r.from}: ${r.hit ? 'the row sends no report' : 'no row, the sample was never reported'}`) : B(0, end, `${m.v.smp.length} sample(s) drilled: a sample needs CMD_SAMPLE handled in IDLE and ${DRILL} ms without an abort`); }
    return [];
  },
  diagnose: (K, res) => {
    if (K.crash) return /stack overflow/.test(K.crash.msg) ? reactions.stack : reactions.crash;
    const m = measure(K), rows = (mode(K) || { code: [] }).code.filter(i => i.op === 'fsm').flatMap(i => i.rows || []), ok = i => res[i] && res[i][0];
    if (!rows.length) return reactions.noTable;
    if (rows.every(r => r.n === r.s)) return reactions.stateless;
    if (rows.some(r => (r.a === 'startMotors' || r.a === 'startDrill' || r.a === 'drillSample') && r.n === r.s)) return reactions.forgotNext;
    if (!ok(5) && rows.some(r => r.a === 'drillSample')) return reactions.blockingAction;
    if (!ok(5)) return reactions.slow;
    if (!ok(3)) return reactions.drillAndWheels;
    if (!ok(1)) { const r = m.T.find(x => x.ev === 'HAZARD' && m.hzBad.includes(x.tq)); return r && !r.hit ? reactions.hazardNoRow : reactions.hazardWrongAction; }
    if (!ok(2)) return reactions.safeLeak;
    if (!ok(0)) return m.late.length ? reactions.driveIgnored : reactions.stopIgnored;
    if (!ok(4)) return reactions.noReport;
    return reactions.fail;
  },
  hintFloor: (K, res) => (res[5] && res[5][0] ? 1 : 0),
  wrong: [
    { name: 'no HAZARD row in SAMPLING', apply: p => { const r = rowsOf(p); r.splice(r.findIndex(x => x.s === 'SAMPLING' && x.e === 'HAZARD'), 1); }, fails: [1], says: 'hazardNoRow' },
    { name: 'no HAZARD row in IDLE', apply: p => { const r = rowsOf(p); r.splice(r.findIndex(x => x.s === 'IDLE' && x.e === 'HAZARD'), 1); }, fails: [2], says: 'safeLeak' },
    { name: 'blocking drillSample() as the action', apply: p => { rowsOf(p).find(x => x.s === 'IDLE' && x.e === 'CMD_SAMPLE').a = 'drillSample'; }, fails: [5], says: 'blockingAction' },
    { name: 'CMD_SAMPLE obeyed while DRIVING', apply: p => { const x = rowsOf(p).find(x => x.s === 'DRIVING' && x.e === 'CMD_SAMPLE'); x.a = 'startDrill'; x.n = 'SAMPLING'; }, fails: [3], says: 'drillAndWheels' },
    { name: 'HAZARD in SAMPLING stops the wheels instead of raising the drill', apply: p => { rowsOf(p).find(x => x.s === 'SAMPLING' && x.e === 'HAZARD').a = 'stopMotors'; }, fails: [1], says: 'hazardWrongAction' },
    { name: 'CMD_DRIVE starts the wheels but the state stays IDLE', apply: p => { rowsOf(p).find(x => x.s === 'IDLE' && x.e === 'CMD_DRIVE').n = 'IDLE'; }, fails: [1], says: 'forgotNext' },
    { name: 'CMD_DRIVE obeyed in SAFE', apply: p => { const x = rowsOf(p).find(x => x.s === 'SAFE' && x.e === 'CMD_DRIVE'); x.a = 'startMotors'; x.n = 'DRIVING'; }, fails: [2], says: 'safeLeak' },
    { name: 'DRILL_DONE goes back to IDLE without a report', apply: p => { rowsOf(p).find(x => x.e === 'DRILL_DONE').a = ''; }, fails: [4], says: 'noReport' },
    { name: 'no states at all: the starting table', apply: p => { const r = rowsOf(p); r.length = 0; r.push(row('IDLE', 'CMD_DRIVE', 'startMotors', 'IDLE'), row('IDLE', 'CMD_STOP', 'stopMotors', 'IDLE'), row('IDLE', 'CMD_SAMPLE', 'startDrill', 'IDLE'), row('IDLE', 'DRILL_DONE', 'sendReport', 'IDLE'), row('IDLE', 'HAZARD', 'stopMotors', 'IDLE')); }, says: 'stateless' },
    { name: 'stack of 1024 bytes', apply: p => { p.units[0].stack = 1024; }, crash: 'stack overflow' },
    { name: 'polling the queue with timeout 0', apply: p => { p.units[0].code[0].to = 0; }, crash: 'task_wdt' },
  ],
  alts: [
    { name: 'no "stay" rows: unwanted events fall through', stars: 2, apply: p => { const r = rowsOf(p); for (let i = r.length - 1; i >= 0; i--) if (!r[i].a && r[i].n === r[i].s) r.splice(i, 1); } },
    { name: 'stack left at 4096 bytes', stars: 2, apply: p => { p.units[0].stack = 4096; } },
    { name: 'HAZARD in SAFE handled explicitly too', stars: 3, apply: p => { rowsOf(p).push(row('SAFE', 'HAZARD', '', 'SAFE')); } },
  ],
  briefing, reactions, hints, solutionNote, manual, realCode, quiz, widgets,
};
