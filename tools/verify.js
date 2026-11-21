// Stage verifier: the accuracy gate for every lesson. No browser, no build step.
//
//   gjs -m tools/verify.js            all stages
//   gjs -m tools/verify.js 3          one stage
//   node tools/verify.js              the same, if Node.js is installed
//
// For each stage it proves, on the real kernel simulator:
//   - the lesson object has the required shape, and its manual, quiz and widgets line up
//   - the starting code does NOT pass (there is something to fix)
//   - the reference solution passes every objective and earns all three stars
//   - every declared wrong answer fails the objectives it claims to fail, and mission control has a reply for it
//   - every declared crash is marked on the timing chart at the unit that caused it
//   - the stage composes with the firmware handed over from the stage before
//   - the simulation is deterministic and survives empty programs
// Exit code 0 = everything green. Agents must not report a stage as done while this is red.
import { LESSONS, JOURNEY, SIDE } from '../src/lessons/index.js';
import { runSim, F } from '../src/kernel.js';
import { WIDGETS } from '../src/widgets.js';
import { defaultInstruction } from '../src/editor.js';
import { chartDensity, autoZoom, READABLE, ZOOMS, evidenceOf } from '../src/timeline.js';

const argv = globalThis.ARGV ?? (globalThis.process ? globalThis.process.argv.slice(2) : []);
const only = argv.length ? +argv[0] : 0;
const out = globalThis.print ?? console.log;
const clone = o => JSON.parse(JSON.stringify(o));
const OPS = ['gpio', 'call', 'delay', 'until', 'busy', 'send', 'recv', 'take', 'give', 'giveISR', 'sendISR', 'tReset', 'tStop', 'wakeTimer', 'deepSleep', 'notifyGive', 'notifyGiveISR', 'notifyTake', 'evSet', 'evWait', 'wdtAdd', 'wdtReset'];

let failures = 0;
const stageLog = [];
const ok = (cond, msg) => { if (cond) return true; failures++; stageLog.push('  FAIL  ' + msg); return false; };
const info = msg => stageLog.push('  ' + msg);

/** run a program and summarise it: pass, per-goal results, stars */
function grade(L, prog) {
  const K = runSim(L, clone(prog));
  if (K.crash) return { K, pass: false, crash: K.crash.msg.split('\n')[0], res: null, stars: 0 };
  const res = L.check(K), pass = res.every(r => r[0]);
  return { K, pass, crash: null, res, stars: pass ? 1 + L.bonus.filter(b => b.ok(K)).length : 0 };
}
const show = g => g.crash ? 'crash: ' + g.crash : g.res.map((r, i) => `${r[0] ? 'ok' : 'NO'}#${i}[${r[1]}]`).join(' ') + ` cpu ${g.K.m.cpu}% ram ${g.K.m.ram}` + (g.K.L.power ? ` avg ${g.K.m.avgmA} mA` : '');

for (const L of [...LESSONS, ...SIDE]) {
  if (only && L.id !== only) continue;
  stageLog.length = 0; const before = failures;
  const prevL = L.side ? null : LESSONS.find(l => l.id === L.id - 1), prev = prevL ? prevL.solution() : null;
  if (L.side) { ok(L.id > 100, 'a side mission needs an id above 100'); ok(!!L.adds, 'a side mission needs an "adds" line for the build log'); ok(SIDE.includes(L) && !LESSONS.includes(L), 'side missions are registered in SIDE only'); }

  // ---- shape ----
  for (const k of ['id', 'title', 'topic', 'file', 'T', 'pins', 'ops', 'fns', 'goals', 'start', 'solution', 'solutionNote', 'check', 'bonus', 'briefing', 'reactions', 'hints', 'manual', 'realCode', 'quiz', 'wrong'])
    ok(L[k] !== undefined, `lesson is missing "${k}"`);
  ok(String(L.topic).length <= 90, `topic is ${String(L.topic).length} characters: it is a short heading (90 at most), not a summary`);
  ok(L.side || JOURNEY.some(j => j.id === L.id && j.title === L.title), 'no matching entry (id and title) in JOURNEY');
  ok(L.side || L.id === 1 || !!prevL, 'previous stage is not in LESSONS: stages must be contiguous');
  (L.ops || []).forEach(o => ok(OPS.includes(o), `unknown op "${o}"`));
  (L.fns || []).forEach(f => ok(!!F[f], `rover function "${f}" is not defined in kernel.js F`));
  ok((L.hints || []).length >= 2, 'need at least 2 hints'); ok((L.briefing || []).length >= 2, 'need at least 2 briefing lines');
  for (const k of ['watchdog', 'crash', 'fail', 'pass']) ok(L.reactions && Array.isArray(L.reactions[k]) && L.reactions[k].length, `reactions.${k} missing`);
  ok(Array.isArray(L.solutionNote) && L.solutionNote.length === 2, 'solutionNote must be two strings');
  // ---- theory ----
  const man = L.manual || [], quiz = L.quiz || [];
  ok(man.length >= 4, 'manual needs at least 4 sections'); ok(quiz.length === man.length, `quiz has ${quiz.length} entries, manual has ${man.length} sections (use null for "no question")`);
  ok(quiz.filter(Boolean).length >= 3, 'need at least 3 check questions');
  quiz.forEach((q, i) => { if (!q) return; ok(q.q && Array.isArray(q.opts) && q.opts.length >= 3 && Number.isInteger(q.a) && q.a >= 0 && q.a < q.opts.length && q.why, `quiz ${i} is malformed`);
    ok(Array.isArray(q.wrong) && q.wrong.length === q.opts.length && q.wrong.every((w, j) => j === q.a ? w === null : typeof w === 'string' && w.length > 20), `quiz ${i} needs "wrong": one explanation per option (null for the right one), so a wrong answer is explained, not just rejected`); });
  let widgets = 0;
  man.forEach((m, i) => { ok(Array.isArray(m) && m.length === 2 && m[0] && m[1], `manual section ${i} must be [title, html]`);
    for (const w of String(m[1]).matchAll(/data-w="([^"]+)"/g)) { widgets++; ok(!!WIDGETS[w[1]] || typeof (L.widgets || {})[w[1]] === 'function', `manual section ${i} uses unknown widget "${w[1]}" (not in src/widgets.js and not in the lesson's own widgets)`); } });
  ok(widgets >= 1, 'manual needs at least one interactive widget'); ok(man.some(m => /<svg/.test(m[1])), 'manual needs at least one diagram');
  const text = JSON.stringify([man, quiz, L.briefing, L.reactions, L.hints, L.goals]) + L.realCode;
  for (const banned of ['Arduino', 'digitalWrite', 'attachInterrupt', 'void setup(', 'void loop(']) ok(!text.includes(banned), `content mentions "${banned}": examples must be ESP-IDF style`);
  ok(/app_main/.test(L.realCode) && /#include "freertos\/FreeRTOS.h"/.test(L.realCode), 'realCode must be a complete ESP-IDF file (includes and app_main)');

  if (failures === before) {
    // ---- behaviour ----
    const start = L.start(prev ? clone(prev) : null), gs = grade(L, start);
    ok(!gs.pass, 'starting code already passes: nothing for the player to fix'); info('start     ' + show(gs));
    ok(gs.res ? gs.res.length === L.goals.length : true, `check() returned ${gs.res && gs.res.length} results for ${L.goals.length} goals`);
    const sol = L.solution(prev ? clone(prev) : null), gg = grade(L, sol);
    ok(gg.pass, 'reference solution does not pass'); ok(gg.stars === 3, `reference solution earns ${gg.stars} stars, expected 3`); ok(gg.K.stats.viol === 0, 'reference solution logs faults');
    info('solution  ' + show(gg));
    ok(JSON.stringify(grade(L, sol).res) === JSON.stringify(gg.res), 'simulation is not deterministic');
    if (prevL) { // the stage must build on the code handed over, not replace it
      const names = prev.units.map(u => u.name);
      ok(names.every(n => start.units.some(u => u.name === n)), 'start(prev) dropped units from the previous stage');
      ok(L.goals.length > 0 && L.goals.some(g => /stage \d|still/i.test(g)), 'no regression objective: at least one goal must re-check an earlier stage');
    }
    // ---- the timing chart must be readable for a person (see src/timeline.js: readability) ----
    for (const [name, g] of [['starting code', gs], ['solution', gg]]) {
      const d = chartDensity(g.K), z = autoZoom(g.K);
      ok(z > 0, `timing chart unreadable for the ${name}: row "${d.row}" has ${d.per100} state changes per 100 px (limit ${READABLE}) and even ${ZOOMS[ZOOMS.length - 1]}x zoom does not separate them. Shorten T, or slow down the busiest task.`);
      info(`chart     ${name}: busiest row "${d.row}" ${d.per100} changes/100 px, AUTO zoom ${z || 'none'}x, ${Math.round(g.K.T / (z || 1))} ms visible at once`);
      if (L.evidence && !g.pass && !g.crash) ok((L.evidence(g.K) || []).every(e => g.K.units.some(u => u.name === e.unit) && e.to >= e.from && e.label), `evidence() for the ${name} is malformed`);
    }
    ok(L.side || !!L.evidence || !!L.power, 'no chart evidence: add evidence(K) that brackets the stretch of the chart an unmet objective is about');
    // ---- wrong answers ----
    ok(Array.isArray(L.wrong) && L.wrong.length >= 3, 'need at least 3 wrong answers in lesson.wrong');
    for (const w of L.wrong || []) {
      const p = L.solution(prev ? clone(prev) : null); w.apply(p); const g = grade(L, p);
      if (w.crash) ok(!!g.crash && new RegExp(w.crash).test(g.crash), `wrong "${w.name}": expected a crash matching /${w.crash}/, got ${show(g)}`)
      if (w.crash && g.crash) { let e = []; try { e = evidenceOf(g.K, L); } catch (x) { e = []; } ok(e.length > 0 && e.every(v => g.K.units.some(u => u.name === v.unit) && v.label), `wrong "${w.name}": the crash is not marked on the chart (evidenceOf gave nothing)`); }
      else if (ok(!g.crash, `wrong "${w.name}": crashed unexpectedly: ${g.crash}`)) {
        ok(!g.pass, `wrong "${w.name}" passes: the objectives do not catch this mistake`);
        (w.fails || []).forEach(i => ok(g.res[i] && !g.res[i][0], `wrong "${w.name}": objective #${i} should fail but holds (${g.res[i] && g.res[i][1]})`));
        const said = L.diagnose ? L.diagnose(g.K, g.res) : L.reactions.fail;
        ok(Array.isArray(said) && said.length && said.every(s => typeof s === 'string' && s.length > 20), `wrong "${w.name}": diagnose() gave no usable reply`);
        if (w.says) ok(said === L.reactions[w.says], `wrong "${w.name}": expected reaction "${w.says}"`);
      }
      info(`wrong     ${w.name}: ${show(g)}`);
    }
    // ---- alternative correct designs (optional): each must pass and earn exactly the stars it declares ----
    for (const a of L.alts || []) {
      const p = L.solution(prev ? clone(prev) : null); a.apply(p); const g = grade(L, p);
      ok(g.pass && g.stars === a.stars, `alternative "${a.name}": expected a pass with ${a.stars} star(s), got ${g.crash ? 'a crash' : g.pass ? g.stars + ' star(s)' : 'a fail'} (${show(g)})`);
      info(`alt       ${a.name}: ${g.stars} star(s), ${show(g)}`);
    }
    // every instruction the stage offers must be addable in the editor: a missing default would insert nothing or break the program
    { const mk = defaultInstruction(L, () => start); (L.ops || []).forEach(o => { let ins; try { ins = mk(o); } catch (e) { ins = null; } ok(!!ins && ins.op === o, `the editor cannot add "${o}": no default instruction`); }); }
    // every configurable object the solution relies on must already exist in the starting code (the player cannot add objects)
    Object.keys(sol.objs || {}).forEach(k => ok(!!(start.objs || {})[k], `the solution uses object "${k}" but the starting code does not have it`));
    // ---- robustness ----
    for (const [name, p] of [['no tasks', { objs: clone(sol.objs), units: sol.units.filter(u => u.kind !== 'task') }], ['empty task bodies', { objs: clone(sol.objs), units: sol.units.map(u => ({ ...u, code: [] })) }]]) {
      try { const g = grade(L, p); ok(!g.pass, `"${name}" program passes`); } catch (e) { ok(false, `"${name}" program throws: ${e.message}`); }
    }
  }
  out(`${failures === before ? 'PASS' : 'FAIL'}  ${L.side ? 'side ' : 'stage'} ${String(L.id).padStart(2, '0')}  ${L.title}`);
  stageLog.forEach(l => out(l));
}
if (only && ![...LESSONS, ...SIDE].some(l => l.id === only)) { failures++; out(`FAIL  stage ${only} is not registered in src/lessons/index.js`); }
out(failures ? `\n${failures} failure(s). Not done.` : '\nAll green.');
if (globalThis.process) globalThis.process.exit(failures ? 1 : 0); else if (failures) (await import('system')).default.exit(1);
