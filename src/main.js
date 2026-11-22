// Game loop: title -> briefing -> edit firmware -> flash, simulate, play back on the rover -> result.
// The campaign is one firmware that grows: each stage starts from the code that passed the stage before.
import { createWorld } from './world.js';
import { runSim, leanRam } from './kernel.js';
import { createEditor } from './editor.js';
import { drawTimeline, describe, autoZoom, evidenceOf, lateLight, starved, ZOOMS } from './timeline.js';
import { sfx } from './audio.js';
import { TOUR, startTour } from './tour.js';
import { WIDGETS } from './widgets.js';
import { LESSONS, JOURNEY, SIDE } from './lessons/index.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const clone = o => JSON.parse(JSON.stringify(o));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).has('shot'); // screenshot mode is motion-free too
const KEY = 'rtosquest.game.v2';
const pad2 = n => String(n).padStart(2, '0');

/* ---------- campaign state ---------- */
// stars: best per stage · prog: code being edited per stage · fw: the code that passed each stage (carried forward)
// solved: stage shown with SOLVE · theory: answered check questions per stage
let save = { stars: {}, prog: {}, fw: {}, solved: {}, theory: {}, sawWatchdog: false, last: 1 };
try { Object.assign(save, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { /* first run */ }
// Screenshot mode (tools/shots.sh): ?shot=title|play|fail|solved|manual|journey[&sec=N] puts the game straight into one state,
// without animation and without touching saved progress, so a headless browser can capture it for visual review.
const qs = new URLSearchParams(location.search), shot = qs.get('shot');
let resetting = false;   // set while RESET ALL PROGRESS reloads the page: nothing may write the old save back
const persist = () => { if (shot || resetting) return; try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };
const unlocked = id => id === 1 || !!shot || !!save.free || !!(save.stars[id - 1] || save.solved[id - 1]); // save.free = review mode: every built stage is open
const wanted = +((location.hash.match(/^#m(\d+)$/) || [])[1] || save.last || 1);
// a locked or unknown stage in the address falls back to the furthest stage the player has opened, not to stage 1
const L = SIDE.find(l => l.id === wanted) || LESSONS.find(l => l.id === wanted && unlocked(l.id)) || [...LESSONS].reverse().find(l => unlocked(l.id)) || LESSONS[0];
save.last = L.id; persist();
/** firmware handed over from the previous stage: the player's own passing code, else the reference */
/** A saved program is trusted only as far as its shape: drop broken instructions, and reject it if it is not a program at all (a damaged save must never stop the game from loading). */
const sane = p => { if (!p || !Array.isArray(p.units) || typeof p.objs !== 'object' || !p.objs) return null;
  for (const u of p.units) { if (!u || !Array.isArray(u.code) || !u.name || !u.kind) return null; u.code = u.code.filter(i => i && typeof i.op === 'string'); } return p; };
const inherited = () => L.side ? null : L.id > 1 ? (sane(save.fw[L.id - 1]) ? clone(save.fw[L.id - 1]) : LESSONS[L.id - 2].solution()) : null;
let prog = sane(save.prog[L.id]) || L.start(inherited());
const store = () => { save.prog[L.id] = prog; persist(); stale(true); };
/** The chart is evidence for one run. Once the code changes, say so instead of showing evidence that no longer matches. */
function stale(on) { const t = document.querySelector('.tl'); if (!t) return; t.classList.toggle('stale', on); if (on) $('#probe').textContent = 'Code changed: the chart still shows the previous run. Press FLASH & RUN to update it.'; }
function go(id) { try { sessionStorage.setItem('rq.skipTitle', '1'); } catch (e) { /* ignore */ } location.hash = '#m' + id; location.reload(); }

const world = createWorld($('#gl'));
world.setStage(L.id);
document.body.classList.toggle('night', L.id === 101);   // the night mission is played in the dark
// units that this stage adds on top of the inherited firmware get a NEW marker in the editor
const before = new Set(((inherited() || { units: [] }).units).map(u => u.name));
L.isNew = name => !L.side && L.id > 1 && !before.has(name);
L.startObjs = () => L.start(inherited()).objs || {};
const editor = createEditor($('#editor'), L, () => prog, store);

/* ---------- HUD ---------- */
$('#mNum').textContent = L.side ? 'SIDE MISSION' : 'STAGE ' + pad2(L.id) + ' / ' + JOURNEY.length; $('#mTitle').textContent = L.title; $('#fileName').textContent = 'FIRMWARE · ' + L.file;
$('#start').textContent = L.side ? 'START SIDE MISSION' : (Object.keys(save.stars).length || L.id > 1 ? 'CONTINUE: STAGE ' : 'START STAGE ') + pad2(L.id);
const drawStars = () => { const n = save.stars[L.id] || 0; $('#stars').textContent = '★'.repeat(n) + '☆'.repeat(3 - n); };
function drawGoals(K, res) {
  const allOk = !!res && res.every(r => r[0]);
  const item = (t, i) => `<li class="${K ? (res && res[i][0] ? 'ok' : 'no') : ''}">${K ? `<span class="sr">${res && res[i][0] ? 'Met: ' : 'Not met: '}</span>` : ''}${t}${res ? `<small>${esc(res[i][1])}</small>` : ''}</li>`;
  // Objectives that re-check earlier stages are folded into one row, so this stage's own goals are always in view.
  // The row opens by itself and turns red when one of them breaks.
  const old = L.goals.map((t, i) => i).filter(i => /^Still working/i.test(L.goals[i])), fresh = L.goals.map((t, i) => i).filter(i => !old.includes(i));
  const broken = res ? old.filter(i => !res[i][0]).length : 0;
  const group = old.length < 2 ? old.map(i => item(L.goals[i], i)).join('')
    : `<li class="ggroup ${K ? (res && !broken ? 'ok' : 'no') : ''}"><details ${broken ? 'open' : ''}><summary>Earlier stages still work: ${res ? `${old.length - broken} of ${old.length} checks pass` : `${old.length} checks`}</summary><ul>${old.map(i => item(L.goals[i].replace(/^Still working from /i, 'From '), i)).join('')}</ul></details></li>`;
  $('#goals').innerHTML = `<li class="${K ? (K.crash ? 'no' : 'ok') : ''}">Firmware runs the whole test without crashing</li>`
    + fresh.map(i => item(L.goals[i], i)).join('') + group
    + '<li class="gsep">STARS 2 AND 3</li>' + L.bonus.map(b => `<li class="bonus ${allOk && b.ok(K) ? 'ok' : ''}">${K ? `<span class="sr">${allOk && b.ok(K) ? 'Earned: ' : 'Not earned: '}</span>` : ''}${b.label}</li>`).join('');
}
// scene rotation: the player's choice is kept; with reduced motion asked for it starts off
const rot = $('#rotate'); rot.checked = save.rotate === undefined ? !reduced : !!save.rotate; world.setAutoRotate(rot.checked);
rot.onchange = () => { save.rotate = rot.checked; persist(); world.setAutoRotate(rot.checked); };
const muteBtn = $('#mute'); muteBtn.textContent = sfx.muted ? 'SOUND OFF' : 'SOUND ON';
muteBtn.onclick = () => { muteBtn.textContent = sfx.toggle() ? 'SOUND OFF' : 'SOUND ON'; };
const foldLabel = () => { $('#foldAll').textContent = editor.allFolded() ? 'SHOW ALL CODE' : 'HIDE ALL CODE'; };
$('#foldAll').onclick = () => { sfx.click(); editor.foldAll(!editor.allFolded()); foldLabel(); };
$('#editor').addEventListener('click', e => { if (e.target.closest('[data-act="fold"]')) setTimeout(foldLabel, 0); });
$('#addTask').onclick = () => { sfx.click(); if (!editor.addTask()) say(['Fourteen tasks is all this board has room for.']); };
/** two-click confirmation for buttons that throw work away */
function confirmBtn(btn, question, action) {
  const label = btn.textContent;
  btn.onclick = () => {
    if (!btn.dataset.arm) { btn.dataset.arm = 1; btn.textContent = question; setTimeout(() => { delete btn.dataset.arm; btn.textContent = label; }, 4000); return; }
    delete btn.dataset.arm; btn.textContent = label; action();
  };
}
confirmBtn($('#resetCode'), 'DISCARD MY CODE?', () => { prog = L.start(inherited()); store(); editor.draw(); preview(); });
const backups = save.backup || (save.backup = {});
const drawRestore = () => { $('#restore').hidden = !backups[L.id]; };
$('#restore').onclick = () => { if (!backups[L.id]) return; prog = backups[L.id]; delete backups[L.id]; store(); editor.draw(); preview(); drawRestore(); say(['Your own code is back in the editor. The chart shows what it does.']); };
confirmBtn($('#solve'), 'LOAD IT? (YOUR CODE IS KEPT)', () => { backups[L.id] = clone(prog); drawRestore(); prog = L.solution(inherited()); store(); editor.draw(); if (pb && !pb.done) pb.done = true; run(true); });
// Hints are a ladder: each press goes one rung further and stops at the last one. The level is remembered per stage.
const hintLevel = save.hints || (save.hints = {});
const drawHint = () => { const n = hintLevel[L.id] || 0; $('#hint').textContent = n ? `HINT ${Math.min(n, L.hints.length)}/${L.hints.length}` : 'HINT'; };
let lastRun = null;   // the latest finished run, so a hint can match where the learner is
$('#hint').onclick = () => { sfx.click(); const floor = L.hintFloor && lastRun ? L.hintFloor(lastRun.K, lastRun.res) : 0; const n = Math.min(Math.max(hintLevel[L.id] || 0, floor), L.hints.length - 1); say([`Hint ${n + 1} of ${L.hints.length}. ${L.hints[n]}`]); hintLevel[L.id] = Math.min(L.hints.length, n + 1); persist(); drawHint(); };

function layout() {
  const narrow = innerWidth <= 1000;
  if (narrow || $('#hud').hidden) world.setInsets(0, 0);
  else world.setInsets($('.console').getBoundingClientRect().right, innerHeight - $('.deck').getBoundingClientRect().top, innerWidth - $('.quest').getBoundingClientRect().left, $('.top').getBoundingClientRect().bottom); // keep the rover in the gap between the panels
  if (lastK) redrawChart();
}
addEventListener('resize', layout);
// AUTO zoom picks the smallest zoom at which separate task runs can be told apart (see timeline.js: readability)
const zoomNow = () => { const v = $('#zoom').value; return v === 'auto' ? (lastK ? autoZoom(lastK, $('#tlw').clientWidth) || ZOOMS[ZOOMS.length - 1] : 1) : +v; };
const redrawChart = () => { const z = zoomNow(); $('#zoom').options[0].textContent = `AUTO (${z}×)`; drawTimeline($('#cv'), $('#tll'), lastK, L, z); };
const CHART_HELP = () => zoomNow() > 1 ? `Chart zoomed ${zoomNow()}× so single task runs are readable: scroll it sideways, or pick 1× for the whole test. Hover to read every state.` : 'Task timing chart: move the mouse over it to read every state at that millisecond.';
/** after a run, show the part of the chart that matters: the evidence for a failed objective, else the start */
function focusChart(K) { const e = evidenceOf(K, L)[0], w = $('#cv').clientWidth, v = $('#tlw').clientWidth; $('#tlw').scrollLeft = e ? Math.max(0, e.from / K.T * w - v * 0.3) :   /* bracket start at 30% of the view, so its label fits to the right */ K.crash ? Math.max(0, K.end / K.T * w - v * 0.7) : 0;
  document.querySelector('.tl').scrollTop = 0; }   // rows with evidence are pinned to the top of the chart // with many tasks the evidence row may be below the visible rows
$('#zoom').onchange = () => { if (lastK) { redrawChart(); if (pb) setClock(pb.t, pb.K); $('#probe').textContent = CHART_HELP(); } };
$('#tlw').addEventListener('mousemove', e => { if (!lastK) return; const r = $('#cv').getBoundingClientRect(); $('#probe').textContent = describe(lastK, L, (e.clientX - r.left) / r.width * lastK.T); });

/* ---------- theory: step 1 of every stage ----------
   A guided lesson, one section per page, with interactive widgets and a check question per section.
   It opens by itself the first time a stage is entered; the mission (step 2) starts when the learner leaves it. */
// Core sections come first and "Go deeper" ones after them, whatever order the lesson file lists them in; numbers follow the order shown.
// Order shown: sections marked (prerequisite) first, then the core, then optional ones marked (Go deeper) or (after you pass).
// Only core and prerequisite checks are needed before the mission; optional sections can still be read and answered.
const rank = m => /\(prerequisite\)/i.test(m[0]) ? 0 : /\((go deeper|after you pass)\)/i.test(m[0]) ? 2 : 1;
const order = L.manual.map((m, i) => i).sort((a, b) => (rank(L.manual[a]) - rank(L.manual[b])) || a - b);
const needed = order.map(i => rank(L.manual[i]) < 2 && !!(L.quiz || [])[i]);   // per shown section: does its check count?
const sections = [...order.map((i, n) => [`${n + 1}. ${L.manual[i][0].replace(/^\s*\d+\.\s*/, '')}`, L.manual[i][1]]), ['Complete ESP-IDF example', `<p>The firmware of this stage as a real ESP-IDF source file.</p><pre>${esc(L.realCode)}</pre>`]];
const quizzes = order.map(i => (L.quiz || [])[i]);
const nQuiz = needed.filter(Boolean).length;
const answered = () => needed.filter((need, i) => need && theory()[i]).length;
const theory = () => save.theory[L.id] || (save.theory[L.id] = {});
const readMap = () => (save.read || (save.read = {}))[L.id] || (save.read[L.id] = {});
const theoryDone = () => answered() >= nQuiz;
let sec = 0, pendingBriefing = false;
const secDone = i => quizzes[i] ? !!theory()[i] : !!readMap()[i];
function drawTheory() {
  const n = answered(), done = theoryDone();
  $('#thProg').textContent = done ? '✓' : `${n}/${nQuiz}`; $('#openManual').classList.toggle('done', done);
  $('#manProg').textContent = done ? 'ALL CHECKS PASSED ✓' : `CHECKS ${n}/${nQuiz}`; $('#manProg').classList.toggle('done', done);
  $('#closeManual').textContent = done ? 'GO TO THE MISSION ▶' : 'SKIP TO THE MISSION';
  $('#closeManual').classList.toggle('run', done); $('#closeManual').classList.toggle('hb', !done);
  document.querySelectorAll('#manNav [data-s]').forEach(b => { const i = +b.dataset.s; b.classList.toggle('on', i === sec); b.classList.toggle('ok', secDone(i)); });
  const last = sec === sections.length - 1, nx = $('#manNext');
  $('#manPrev').disabled = sec === 0; $('#manPos').textContent = `SECTION ${sec + 1} OF ${sections.length}`;
  nx.textContent = !last ? 'NEXT SECTION →' : done ? 'START THE MISSION ▶' : `${nQuiz - n} CHECK${nQuiz - n === 1 ? '' : 'S'} LEFT: SHOW ME`;
}
$('#manTitle').textContent = L.topic; $('#manKicker').textContent = (L.side ? 'SIDE MISSION' : 'STAGE ' + pad2(L.id)) + ' · STEP 1 OF 2 · THEORY';
$('#manNav').innerHTML = sections.map((m, i) => `<button data-s="${i}"><i></i><span>${m[0]}</span></button>`).join('');
$('#manBody').innerHTML = sections.map((m, i) => `<section id="man${i}" hidden><h3>${m[0]}</h3>${m[1]}${quizzes[i] ? `<div class="quiz" data-q="${i}"></div>` : ''}</section>`).join('');
function showSec(i) {
  sec = Math.max(0, Math.min(sections.length - 1, i));
  sections.forEach((_, k) => { $('#man' + k).hidden = k !== sec; });
  readMap()[sec] = true; persist(); $('#manBody').scrollTop = 0; drawTheory();
}
let mounted = false;
function mountManual() { // widgets are built the first time the theory opens, when their size is known
  if (mounted) return; mounted = true;
  sections.forEach((_, k) => { $('#man' + k).hidden = false; });   // widgets measure themselves, so mount them visible
  document.querySelectorAll('#manBody [data-w]').forEach(el => { const w = (L.widgets || {})[el.dataset.w] || WIDGETS[el.dataset.w]; if (w) w(el); }); // a lesson may bring its own widgets
  document.querySelectorAll('#manBody .quiz').forEach(el => {
    const i = +el.dataset.q, q = quizzes[i]; let tries = 0;
    const draw = solved => {
      el.innerHTML = `<div class="qh">CHECK YOURSELF</div><p class="qq">${q.q}</p>${q.opts.map((o, j) => `<button class="qo ${solved && j === q.a ? 'ok' : ''}" data-j="${j}" ${solved ? 'disabled' : ''}>${o}</button>`).join('')}<p class="qw" ${solved ? '' : 'hidden'}>${solved ? '✓ ' + q.why : ''}</p>`;
    };
    el.onclick = e => {
      const b = e.target.closest('.qo'); if (!b || b.disabled) return;
      if (+b.dataset.j === q.a) { theory()[i] = true; persist(); sfx.star(); draw(true); drawTheory(); }
      else { tries++; sfx.fail(); b.classList.add('no'); b.disabled = true; const w = el.querySelector('.qw'); w.hidden = false; w.textContent = (q.wrong && q.wrong[+b.dataset.j]) || (tries > 1 ? 'Still not it. The answer is in the section above.' : 'Not quite. Have another look at the section above and try again.'); } // a lesson can say why each wrong option is wrong
    };
    draw(!!theory()[i]);
  });
}
function openTheory(at) {
  sfx.unlock(); $('#manual').hidden = false; mountManual();
  // resume where the learner left off: the first section that is not done yet
  const first = sections.findIndex((_, i) => !secDone(i));
  showSec(at !== undefined ? at : first < 0 ? 0 : first);
}
/* ---------- tour of the mission screen ---------- */
// Shown by itself once: the first thing a new player sees in stage 1, before the theory opens. TOUR in the top bar replays it.
const tour = after => { if (dlg) dlg.close(); startTour(TOUR, () => { save.tour = true; persist(); after && after(); }); };
// The mission briefing is the task description of the stage, so it gets the middle of the screen: a large panel, one
// point per page, with BACK and NEXT. Short remarks during play (say) stay in the small box above the chart.
function brief() {
  if (dlg) dlg.close();
  const el = $('#brief'), lines = L.briefing; let i = 0;
  const draw = () => {
    el.innerHTML = `<div class="bbox panel"><div class="bhead"><div class="portrait" aria-hidden="true">${$('#dialog .portrait').innerHTML}</div><div><small>MISSION BRIEFING · ${L.side ? 'SIDE MISSION' : 'STAGE ' + pad2(L.id)}</small><h2>${esc(L.title.toUpperCase())}</h2></div><span class="bcount">${i + 1} / ${lines.length}</span></div>
      <p class="btext">${esc(lines[i])}</p>
      <div class="bdots" aria-hidden="true">${lines.map((_, k) => `<i class="${k === i ? 'on' : k < i ? 'done' : ''}"></i>`).join('')}</div>
      <div class="rbtn"><button class="hb" id="bSkip">${i === lines.length - 1 ? 'CLOSE' : 'SKIP BRIEFING'}</button><span class="sp"></span><button class="hb" id="bBack" ${i ? '' : 'disabled'}>◀ BACK</button><button class="run" id="bNext">${i === lines.length - 1 ? 'START MISSION ▶' : 'NEXT ▶'}</button></div>
      <small class="bhint">Space or Enter: next · BRIEFING above the objectives opens this again</small></div>`;
    $('#bNext').onclick = () => go(1); $('#bBack').onclick = () => go(-1); $('#bSkip').onclick = close; $('#bNext').focus();
  };
  const go = d => { sfx.click(); if (i + d >= lines.length) return close(); i = Math.max(0, i + d); draw(); };
  const key = e => { if (!$('#manual').hidden || !$('#journey').hidden) return;
    if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') go(-1);
    else if ((e.key === 'ArrowRight' || e.code === 'Space' || e.code === 'Enter') && !(e.target.closest && e.target.closest('button'))) { e.preventDefault(); go(1); } };   // on a focused button the browser already turns Space and Enter into a click
  function close() { removeEventListener('keydown', key); el.hidden = true; el.innerHTML = ''; dlg = null; }
  el.hidden = false; addEventListener('keydown', key); dlg = { close }; draw();
}
$('#reBrief').onclick = () => { sfx.click(); $('#result').hidden = true; brief(); };
const firstVisit = () => L.id === 1 && !save.tour && !save.stars[1] && !shot;
$('#tourBtn').onclick = () => { sfx.click(); $('#result').hidden = true; tour(); };

function closeTheory() {
  $('#manual').hidden = true; (save.theorySeen || (save.theorySeen = {}))[L.id] = true; persist();
  if (pendingBriefing) { pendingBriefing = false; brief(); }
}
$('#manNav').onclick = e => { const b = e.target.closest('[data-s]'); if (b) { sfx.click(); showSec(+b.dataset.s); } };
$('#manPrev').onclick = () => { sfx.click(); showSec(sec - 1); };
$('#manNext').onclick = () => {
  sfx.click();
  if (sec < sections.length - 1) return showSec(sec + 1);
  if (theoryDone()) return closeTheory();
  showSec(needed.findIndex((need, i) => need && !theory()[i]));   // jump to the first unanswered check that counts
};
$('#openManual').onclick = () => { sfx.click(); openTheory(); };
$('#closeManual').onclick = closeTheory;

/* ---------- build log: the whole journey ---------- */
const theoryChip = id => { const l = LESSONS.concat(SIDE).find(x => x.id === id); if (!l) return ''; const n = (l.quiz || []).filter(Boolean).length, d = Object.keys(save.theory[id] || {}).length; return `<span class="jst ${d >= n ? '' : 'dim'}">THEORY ${d >= n ? '✓' : d + '/' + n}</span>`; };
function drawJourney() {
  const playable = id => LESSONS.some(l => l.id === id), done = JOURNEY.filter(j => save.stars[j.id]).length;
  const fw = save.fw[L.id] || prog, nTasks = fw.units.filter(u => u.kind === 'task').length, nLines = fw.units.reduce((a, u) => a + u.code.length, 0);
  $('#journeyBody').innerHTML = `<p class="jlead">One rover, one firmware. Every stage adds hardware to TICK-1 and you extend the same code to run it, without breaking what already works. It starts as a bench prototype with two LEDs and ends as a flight-ready build.</p>
    <div class="jmeter"><div class="gbar"><i style="width:${done / JOURNEY.length * 100}%"></i></div><span>FLIGHT READINESS ${done}/${JOURNEY.length} · firmware now: ${nTasks} task${nTasks === 1 ? '' : 's'}, ${nLines} statements</span></div>
    <label class="jfree"><input type="checkbox" id="freeRoam" ${save.free ? 'checked' : ''}> Review mode: open every built stage without solving the one before (a skipped stage hands over its reference firmware)</label>
    <ol class="jlist">${JOURNEY.map(j => {
    const st = save.stars[j.id] || 0, open = playable(j.id) && unlocked(j.id), cur = j.id === L.id;
    const status = st ? `<span class="jst">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</span>` : !playable(j.id) ? '<span class="jst dim">COMING LATER</span>' : open ? '<span class="jst">READY</span>' : '<span class="jst dim">LOCKED</span>';
    return `<li class="${cur ? 'cur' : ''} ${open ? '' : 'off'}"><span class="jn">${pad2(j.id)}</span><div class="jt"><b>${j.title}</b><span>Rover gains: ${j.adds}</span><span class="jtopic">You learn: ${j.topic}</span></div>${theoryChip(j.id)}${status}${open ? `<button class="hb ${cur ? '' : 'hot'}" data-go="${j.id}">${cur ? 'PLAYING' : 'PLAY'}</button>` : ''}</li>`;
  }).join('')}</ol>${SIDE.length ? `<h3 class="jside">SIDE MISSIONS · other topics, stand-alone</h3><ol class="jlist">${SIDE.map(j => { const st = save.stars[j.id] || 0, cur = j.id === L.id;
      return `<li class="${cur ? 'cur' : ''}"><span class="jn">S${j.id - 100}</span><div class="jt"><b>${j.title}</b><span>${j.adds || ''}</span><span class="jtopic">You learn: ${j.topic}</span></div><span class="jst">${st ? '★'.repeat(st) + '☆'.repeat(3 - st) : 'READY'}</span><button class="hb ${cur ? '' : 'hot'}" data-go="${j.id}">${cur ? 'PLAYING' : 'PLAY'}</button></li>`; }).join('')}</ol>` : ''}`;
  // start over: asked twice, because it erases every stage's stars and code
  $('#journeyBody').insertAdjacentHTML('beforeend', `<div class="jreset"><span>Start the journey again from stage 1. This erases your stars, the firmware you wrote in every stage, the theory checks and the hints used. The SOUND and ROTATE settings stay.</span><button class="hb danger" id="resetAll">RESET ALL PROGRESS</button></div>`);
  confirmBtn($('#resetAll'), 'ERASE EVERYTHING? CLICK AGAIN', () => {
    try { localStorage.removeItem(KEY); if (save.rotate !== undefined) localStorage.setItem(KEY, JSON.stringify({ rotate: save.rotate })); } catch (e) { /* storage unavailable: the reload still starts clean in memory */ }
    resetting = true; location.hash = '#m1'; location.reload();
  });
}
$('#journeyBody').onchange = e => { if (e.target.id === 'freeRoam') { save.free = e.target.checked; persist(); drawJourney(); } };
$('#journeyBody').onclick = e => { const b = e.target.closest('[data-go]'); if (!b) return; if (+b.dataset.go === L.id) $('#journey').hidden = true; else go(+b.dataset.go); };
const openJourney = () => { sfx.unlock(); sfx.click(); drawJourney(); $('#journey').hidden = false; };
$('#openJourney').onclick = openJourney; $('#titleJourney').onclick = openJourney;
$('#closeJourney').onclick = () => { $('#journey').hidden = true; };
addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#manual').hidden) closeTheory(); $('#journey').hidden = true; $('#result').hidden = true; } });

/* ---------- mission control dialogue ---------- */
let dlg = null;
function say(lines) {
  if (dlg) dlg.close();
  return new Promise(done => {
    const el = $('#dialog'), tx = $('#dtext'); let i = 0, ch = 0, timer = 0, full = false;
    const show = () => {
      ch = 0; full = reduced; tx.textContent = reduced ? lines[i] : ''; clearInterval(timer);
      if (!reduced) timer = setInterval(() => { ch += 2; tx.textContent = lines[i].slice(0, ch); if (ch % 6 === 0) sfx.type(); if (ch >= lines[i].length) { full = true; clearInterval(timer); } }, 22);
    };
    const next = () => { if (!full) { clearInterval(timer); tx.textContent = lines[i]; full = true; return; } if (++i >= lines.length) close(); else show(); };
    const key = e => { if ((e.code === 'Space' || e.code === 'Enter') && !e.target.closest('input,select,button,summary') && $('#manual').hidden && $('#journey').hidden) { e.preventDefault(); next(); } };
    const close = () => { clearInterval(timer); el.hidden = true; el.onclick = null; removeEventListener('keydown', key); dlg = null; done(); };
    el.hidden = false; el.onclick = next; addEventListener('keydown', key); dlg = { close }; show();
  });
}

/* ---------- simulate + play back ---------- */
let lastK = null, pb = null;
const ser = $('#serial');
function preview() { stale(false); lastK = runSim(L, clone(prog)); redrawChart(); $('#cur').style.left = '0'; $('#tlw').scrollLeft = 0; $('#probe').textContent = CHART_HELP(); }
function setClock(t, K) {
  $('#clock').textContent = 'T+' + String(Math.round(t)).padStart(4, '0') + ' ms';
  const cx = Math.min(t / K.T * $('#cv').clientWidth, $('#cv').clientWidth - 2); $('#cur').style.left = cx + 'px';   // stay inside the chart, or the cursor itself makes it scroll
  if (zoomNow() > 1 && pb && !pb.done) $('#tlw').scrollLeft = cx - $('#tlw').clientWidth / 2;
  // CPU gauge: share of the last 60 ms that was not idle
  const a = Math.max(0, Math.floor(t) - 60), b = Math.min(K.end, Math.floor(t)); let busy = 0;
  const nc = K.coreTr.length; let best = 0; for (let k = 0; k < nc; k++) { let n = 0; for (let i = a; i < b; i++) if (K.coreTr[k][i] >= 0) n++; best = Math.max(best, n); } busy = best;
  const load = b > a ? busy / (b - a) : 0;
  if (L.power) { const c = K.cur[Math.min(K.end - 1, Math.floor(t))] || 0; $('#pmode').textContent = c < 0.1 ? 'DEEP SLEEP' : c < 5 ? 'LIGHT SLEEP' : c > 100 ? 'RADIO ON' : 'ACTIVE'; $('#pmode').dataset.m = c < 5 ? 'low' : c > 100 ? 'hot' : ''; world.setSleep(c < 0.1 ? 2 : c < 5 ? 1 : 0); }
  world.setCpu(load); $('#cpuBar').style.width = load * 100 + '%'; $('#cpuBar').classList.toggle('hot', load > 0.9); $('#cpuNum').textContent = Math.round(load * 100) + '%';
}
function applyEvents(upto) {
  const K = pb.K;
  while (pb.ei < K.ev.length && K.ev[pb.ei].t <= upto) {
    const e = K.ev[pb.ei++];
    if (e.k === 'pin') { world.setPin(e.pin, e.v); const tag = document.querySelector(`.tag[data-a="${e.pin}"]`); if (tag) tag.classList.toggle('lit', e.v); }
    else if (e.k === 'fn') world.pulse(e.fx);
    else if (e.k === 'fx') world.pulse(e.id);            // interrupts: bumper hit, packet arriving
    else if (e.k === 'ant') world.setAntenna(e.v);
    else if (e.k === 'log') { ser.insertAdjacentHTML('beforeend', `<span class="${e.c || ''}">(${e.t}) ${esc(e.text)}</span>\n`); ser.scrollTop = ser.scrollHeight; }
    else if (e.k === 'crash') {
      world.crash(); sfx.crash(); document.querySelectorAll('.tag').forEach(t => t.classList.remove('lit'));
      const bn = $('#banner'); bn.textContent = /task_wdt/.test(K.crash.msg) ? 'WATCHDOG RESET' : 'REBOOT'; bn.hidden = false; document.body.classList.add('shake');
      setTimeout(() => { bn.hidden = true; document.body.classList.remove('shake'); }, 1500);
    }
  }
}
let resultTimer = 0;
function run(demo) {
  clearTimeout(resultTimer); $('#result').hidden = true;   // a result card belongs to one run: never let it appear over the next
  demo = demo === true;
  if (pb && !pb.done) { pb.t = pb.K.end; return; } // second click skips to the result
  if (dlg) dlg.close();
  sfx.unlock(); sfx.flash();
  ser.innerHTML = '<span class="d">idf.py flash monitor ... done. Booting.</span>\n';
  world.reset(); document.querySelectorAll('.tag').forEach(t => t.classList.remove('lit'));
  drawGoals(null, null);
  stale(false);
  lastK = runSim(L, clone(prog)); redrawChart(); $('#probe').textContent = CHART_HELP();
  const speed = reduced ? 0 : +$('#speed').value;
  pb = { K: lastK, t: speed ? 0 : lastK.end, ei: 0, speed: (speed || 1) * L.T / 3000, done: false, demo }; // playback takes the same wall time whatever the test length
  $('#run').textContent = '■ SKIP TO RESULT';
}
function finish() {
  const K = pb.K; pb.done = true; applyEvents(1e9); setClock(K.end, K); focusChart(K); $('#run').innerHTML = '▶ FLASH &amp; RUN';
  const res = K.crash ? null : L.check(K), pass = !!res && res.every(r => r[0]);
  const stars = pass ? 1 + L.bonus.filter(b => b.ok(K)).length : 0;
  drawGoals(K, res); lastRun = { K, res };
  const tasks = K.units.filter(u => u.kind === 'task');
  ser.insertAdjacentHTML('beforeend', `<span class="d">[result] CPU load ${K.m.cpu}%${L.power ? ` · average current ${K.m.avgmA} mA` : ''} · RAM ${K.m.ram} B (${leanRam(K)} B counted for the Lean star) · unused stack: ${tasks.map(u => `${esc(u.name)} ${Math.max(0, u.stack - u.hw)} B`).join(', ')}</span>\n`);
  ser.scrollTop = ser.scrollHeight;
  if (K.crash) { const first = ser.querySelector('.e'); if (first) ser.scrollTop = Math.max(0, first.offsetTop - ser.offsetTop - 4); }   // keep the line that names the cause in view
  if (pass) {
    const demo = pb.demo;
    if (demo) save.solved[L.id] = true;
    else { save.fw[L.id] = clone(prog); if (stars > (save.stars[L.id] || 0)) save.stars[L.id] = stars; } // this code is what the next stage starts from
    persist(); drawStars();
    if (dlg) dlg.close();   // a message about an earlier failed run must not stay on screen after a pass
    world.celebrate(); sfx.win(); clearTimeout(resultTimer); resultTimer = setTimeout(() => showResult(K, stars, tasks, demo), reduced ? 0 : 1300);
  } else if (K.crash) {
    const wd = /task_wdt/.test(K.crash.msg);
    const said = `The rover rebooted at ${K.crash.t} ms. The serial monitor says: "${K.crash.msg.split('\n')[0]}"`;
    // a lesson may know why this crash happened (a blocking call in an ISR, a task that never blocks): say that, not only the serial line
    let why = null; try { if (L.diagnose && /K\.crash/.test(String(L.diagnose))) why = L.diagnose(K, []); } catch (e) { why = null; }
    if (!Array.isArray(why) || !why.length || [L.reactions.fail, L.reactions.crash, L.reactions.watchdog].includes(why)) why = null;
    const lines = wd ? (why || (!save.sawWatchdog ? L.reactions.watchdog : [L.reactions.watchdog[1]])) : why ? [said, ...why] : [said];   // decided now: the flag below changes before the timer fires
    setTimeout(() => say(lines), reduced ? 0 : 1500);
    if (wd) { save.sawWatchdog = true; persist(); }
  } else { // name the cause if the lesson can; otherwise name the first objective that is not met, with its measured value
    sfx.fail(); let lines = null; const i = res.findIndex(r => !r[0]);
    try { lines = L.diagnose ? L.diagnose(K, res) : null; } catch (e) { lines = null; }   // a lesson's diagnosis may assume task names the player has changed
    // The lights are the player's own tasks from stage 1. If only an old check fails and a light is off its beat, say that:
    // a lesson's reply about its own new tasks would send the player the wrong way.
    const sv = starved(K), ll = sv.length && /toggled after/.test(sv[0].label) ? lateLight(K) : null, old = /^Still working/.test(L.goals[i] || '');   // only when the motor and telemetry are on time
    if (old && ll && res.every((r, k) => r[0] || /^Still working/.test(L.goals[k]))) lines = [`${ll.pin} is off its beat: one toggle came ${ll.gap} ms after the last one, not ${ll.period} ms. Its task, ${ll.unit}, runs at priority ${ll.prio} and now waits behind the work this stage added.`, 'A task that needs exact timing and almost no CPU can sit above the busy tasks without hurting them. Raise its priority in its xTaskCreate line, in the startup code.'];
    say(lines && lines !== L.reactions.fail ? lines : [`Not met yet: "${L.goals[i]}". Measured: ${res[i][1]}. Find that in the chart, change the code and flash again.`]);
  }
}
function showResult(K, stars, tasks, demo) {
  const el = $('#result'), next = L.side ? null : LESSONS.find(l => l.id === L.id + 1), planned = JOURNEY.find(j => j.id === L.id + 1);
  // the last stage of the journey: look back over the whole firmware, not only this stage
  const finale = !demo && !L.side && !next && !planned, total = LESSONS.reduce((n, l) => n + (save.stars[l.id] || 0), 0);
  const recap = finale ? `<p class="quote"><b>The rover that started as one blinking LED is flight ready.</b> ${tasks.length} tasks on ${K.cores} cores, built by you over ${LESSONS.length} stages: priorities, queues, mutexes, interrupts, notifications, timers, event groups, lock order, priority inheritance, two cores and a watchdog. You hold ${total} of ${LESSONS.length * 3} stars. The build log lists every stage, if you want to go back for the rest.</p>` : '';
  el.innerHTML = `<div class="rbox panel"><small>${L.side ? 'SIDE MISSION' : 'STAGE ' + pad2(L.id)} · ${esc(L.title.toUpperCase())}</small><h2>${demo ? 'REFERENCE SOLUTION' : finale ? 'JOURNEY COMPLETE' : 'STAGE COMPLETE'}</h2>
    <div class="rstars ${demo ? 'ref' : ''}">${[0, 1, 2].map(i => `<span class="${i < stars ? 'got' : ''}" style="animation-delay:${i * 0.25}s">★</span>`).join('')}</div>
    ${demo ? '<p class="refnote">Reference solution: this is what it would earn. Stars are saved only for your own code.</p>' : ''}
    <p class="quote">"${esc(demo ? L.solutionNote[0] : L.reactions.pass[0])}"</p>
    <div class="rgrid">${L.power ? `<div><b>${K.m.avgmA} mA</b><small>AVERAGE CURRENT</small></div><div><b>${Math.round(2000 / Math.max(0.01, K.m.avgmA))} h</b><small>ON A 2000 mAh CELL</small></div>` : ''}<div><b>${K.m.cpu}%</b><small>CPU LOAD, WHOLE RUN</small></div><div><b>${K.m.ram} B</b><small>RAM FOR STACKS · ${leanRam(K)} B COUNTED FOR LEAN</small></div></div>
    <ul class="rcrit"><li>★ all objectives met</li>${L.bonus.map(b => `<li>${b.ok(K) ? '★' : '☆'} ${b.label}</li>`).join('')}</ul>
    <details class="rdet" ${tasks.length > 4 ? '' : 'open'}><summary>Stacks: ${tasks.length} task${tasks.length === 1 ? '' : 's'}, least spare ${Math.min(...tasks.map(u => Math.max(0, u.stack - u.hw)))} B</summary><table><tr><th>task</th><th>priority</th><th>stack</th><th>peak use</th><th>spare bytes</th></tr>${tasks.map(u => `<tr><td>${esc(u.name)}</td><td>${u.base}</td><td>${u.stack}</td><td>${u.hw}</td><td>${Math.max(0, u.stack - u.hw)}</td></tr>`).join('')}</table></details>
    <p class="quote">${demo ? esc(L.solutionNote[1]) + ' RESTORE MINE, under the editor, brings your own version back.' : stars < 3 ? L.bonus.filter(b => !b.ok(K)).map(b => 'Still open: ' + b.label.toLowerCase() + '.').join(' ') : 'Three stars.'}
      ${next ? ` Next, the rover gains: <b>${esc(planned.adds.toLowerCase())}</b>. ${demo ? 'The reference firmware' : 'This firmware'} goes with you.` : planned ? ` Stage ${pad2(planned.id)}, "${esc(planned.title)}", is still in development.` : ''}</p>
    ${recap}
    <div class="rbtn">${demo ? '<button class="run" id="rClose">BACK TO THE CODE</button>' : ''}${next ? `<button class="${demo ? 'hb' : 'run'}" id="rNext">NEXT STAGE: ${esc(next.title.toUpperCase())}</button>` : `<button class="${demo ? 'hb' : 'run'}" id="rLog">OPEN BUILD LOG</button>`}${demo ? '' : `<button class="hb" id="rClose">${stars < 3 ? 'KEEP TUNING' : 'STAY HERE'}</button>`}</div></div>`;
  el.hidden = false;
  for (let i = 0; i < stars; i++) setTimeout(() => sfx.star(), 250 * i + 150);
  $('#rClose').onclick = () => { el.hidden = true; };
  if (next) $('#rNext').onclick = () => go(next.id); else $('#rLog').onclick = () => { el.hidden = true; openJourney(); };
}
$('#run').onclick = run;

/* ---------- frame loop ---------- */
const tags = [...document.querySelectorAll('.tag')];
let last = performance.now();
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = Math.max(last, now);
  if (pb && !pb.done) {
    pb.t = Math.min(pb.K.end, pb.t + dt * 1000 * pb.speed);
    applyEvents(pb.t); setClock(pb.t, pb.K);
    if (pb.t >= pb.K.end) finish();
  }
  world.update(dt);
  if (!$('#tags').hidden) for (const t of tags) {
    const a = world.anchor(t.dataset.a);
    t.style.transform = a && a.visible ? `translate(${a.x}px, ${a.y}px)` : 'translate(-999px, -999px)';
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------- start ---------- */
drawStars(); drawGoals(null, null); drawTheory(); drawHint(); drawRestore();
function begin(fast) {
  sfx.unlock(); if (!fast) sfx.flash();
  $('#title').classList.add('out'); world.flyIn(reduced || fast ? 0.6 : 2.8);
  setTimeout(() => {
    $('#title').hidden = true; $('#hud').hidden = false; $('#tags').hidden = false;
    preview(); layout(); editor.focusNew(); // the HUD was hidden until now, so the first scroll could not happen
    // theory first: a stage opens on its lesson the first time; the mission briefing follows when the learner leaves it
    const enter = () => { if (!(save.theorySeen || {})[L.id] && !theoryDone()) { pendingBriefing = true; openTheory(); } else brief(); };
    if (firstVisit()) tour(enter); else enter();   // a new player gets the tour of the screen first, then the theory, then the briefing
  }, reduced || fast ? 0 : 1900);
}
$('#start').onclick = () => begin(false);
let skip = false; try { skip = sessionStorage.getItem('rq.skipTitle') === '1'; sessionStorage.removeItem('rq.skipTitle'); } catch (e) { /* ignore */ }
if (skip) begin(true); // arriving from the build log or "next stage": go straight in
if (shot) {
  document.documentElement.classList.add('shot');
  if (shot !== 'title') {
    $('#title').hidden = true; $('#hud').hidden = false; $('#tags').hidden = false; world.flyIn(0.001);
    preview(); layout();
    if (shot === 'play') brief();
    if (shot === 'fail' || shot === 'solved') {
      if (shot === 'solved') { prog = L.solution(inherited()); editor.draw(); }
      $('#speed').value = '0'; run(shot === 'solved'); finish();
      if (shot === 'solved') showResult(pb.K, 1 + L.bonus.filter(b => b.ok(pb.K)).length, pb.K.units.filter(u => u.kind === 'task'), true);
    }
    if (shot === 'manual') openTheory(+qs.get('sec') || 0);
    if (shot === 'journey') { drawJourney(); $('#journey').hidden = false; }
  }
  for (let i = 0; i < 40; i++) world.update(0.05); // settle the camera and draw a frame before the capture
}
// handy while developing: window.__game exposes the pieces in the console
window.__game = { world, L, LESSONS, SIDE, runSim, frame, save, get prog() { return prog; }, set prog(p) { prog = p; store(); editor.draw(); } };
