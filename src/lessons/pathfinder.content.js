// Field manual for stage 12 (ESP-IDF): priority inversion and priority inheritance.
import { svg, box, arrow, note as baseNote } from '../widgets.js';

// The shared CSS rule '.bx.run ~ text' turns any label that follows a Running bar dark, which is unreadable on the dark panel.
// Force the light label colour here so every annotation in this file stays readable.
const note = (x, y, t, anchor = 'start') => baseNote(x, y, t, anchor).replace('class="at"', 'class="at" style="fill:#c9d8ea"');

const bar = (x, y, w, cls, h = 20) => `<rect class="bx ${cls}" x="${x}" y="${y}" width="${Math.max(1.5, w)}" height="${h}" rx="2"/>`;
const axis = (x0, x1, y) => `<line class="ar" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" marker-end="url(#ah)"/>`;

/* ================= widgets ================= */

const frame = (title, body) => `<div class="wg"><div class="wgh">INTERACTIVE · ${title}</div>${body}</div>`;
const sl = (id, label, min, max, v, step = 1) => `<label>${label} <input type="range" data-${id} min="${min}" max="${max}" step="${step}" value="${v}"> <b data-${id}v></b></label>`;
const val = (el, id, unit = ' ms') => { const v = +el.querySelector('[data-' + id + ']').value; el.querySelector('[data-' + id + 'v]').textContent = v + unit; return v; };

/** Idealised three-task model, 1 ms steps, no randomness.
 *  L (priority 1) takes the lock at t=0 and needs lw ms of CPU while holding it.
 *  H (priority 3) wakes at t=2 and needs the lock for cs ms. M (priority 2) wakes at t=3 and runs mLen ms without the lock.
 *  inherit: a blocked H lifts L to priority 3 (a mutex); without it L stays at 1 (a binary semaphore). */
export function sim3(mLen, inherit, cs = 2, lw = 6) {
  let lRem = lw, mRem = mLen, hRem = cs, hHas = false, hDone = -1, hGot = -1, lockHeld = true;
  const row = [], pL = [];
  for (let t = 0; t < 700; t++) {
    const hWants = t >= 2 && !hHas && hDone < 0;
    if (hWants && !lockHeld) { hHas = true; lockHeld = true; hGot = t; }
    const hBlocked = hWants && !hHas, hReady = hHas && hRem > 0, lReady = lRem > 0, mReady = t >= 3 && mRem > 0;
    const lp = inherit && hBlocked ? 3 : 1; pL.push(lp);
    let who = '';
    if (hReady) who = 'H'; else if (lReady && lp >= 3) who = 'L'; else if (mReady) who = 'M'; else if (lReady) who = 'L';
    if (who === 'H') { hRem--; if (hRem === 0) hDone = t + 1; }
    if (who === 'L') { lRem--; if (lRem === 0) lockHeld = false; }
    if (who === 'M') mRem--;
    row.push(who);
    if (hDone >= 0 && lRem === 0 && mRem === 0) break;
  }
  return { row, pL, hDone, hGot, wait: hDone - 2, end: row.length };
}
const segs = (row, who) => { const o = []; row.forEach((w, t) => { if (w === who) { if (o.length && o[o.length - 1][1] === t) o[o.length - 1][1] = t + 1; else o.push([t, t + 1]); } }); return o; };

// Widget 1: the Pathfinder picture with a slider for the medium task.
function inv3(el) {
  el.innerHTML = frame('HOW LONG DOES THE HIGH TASK WAIT? (BINARY SEMAPHORE, NO INHERITANCE)', `<div class="wgrow">${sl('m', 'medium task runs for', 0, 80, 20)}</div><div data-out></div>`);
  const draw = () => {
    const m = val(el, 'm'), r = sim3(m, false), span = Math.max(r.end + 4, 30), X = t => 90 + t * 610 / span;
    let s = note(84, 40, 'high (3)', 'end') + note(84, 80, 'medium (2)', 'end') + note(84, 120, 'low (1)', 'end');
    s += bar(X(2), 30, X(r.hGot) - X(2), 'blko') + note(X(2) + 3, 24, 'H waits for the lock', 'start');
    segs(r.row, 'H').forEach(([a, b]) => { s += bar(X(a), 30, X(b) - X(a), 'run'); });
    segs(r.row, 'M').forEach(([a, b]) => { s += bar(X(a), 70, X(b) - X(a), 'run'); });
    s += bar(X(3), 70, 0, 'rdy');
    segs(r.row, 'L').forEach(([a, b]) => { s += bar(X(a), 110, X(b) - X(a), 'run'); });
    s += `<line class="dash n" x1="${X(2)}" y1="20" x2="${X(2)}" y2="138"/><line class="dash n" x1="${X(52)}" y1="20" x2="${X(52)}" y2="138"/>` + note(710, 152, 'supervisor limit: 50 ms after H wakes', 'end');
    s += axis(90, 710, 140) + [0, 20, 40, 60, 80, 100].filter(t => t < span).map(t => note(X(t), 164, t, 'middle')).join('') + note(710, 164, 'ms', 'end');
    const dead = r.wait > 50;
    el.querySelector('[data-out]').innerHTML = svg(720, 170, s, 'Timeline of a high, a medium and a low task sharing a lock without inheritance')
      + `<p class="wgcap">H wakes at 2 ms and needs the lock that L took at 0 ms. L needs 6 ms in total inside the lock; M wakes at 3 ms. H waits <b>${r.wait} ms</b> for a job that needs 2 ms. ${m === 0 ? 'With no medium task the wait is only the rest of the low task\'s critical section (6 ms).' : `Of that, <b>${m} ms</b> is the medium task, which does not touch the lock.`}`
      + (dead ? ' <span class="bad">The supervisor limit (50 ms) is passed: the system resets itself.</span>' : '') + ` The model is idealised: a real system has many medium tasks, and any of them can add to the wait.</p>`;
  };
  el.addEventListener('input', draw); draw();
}

// Widget 2: the stage 12 stall with measured numbers; the lock type is the switch.
const EXD = { binary: [5, 26, 4, 53, 6, 8, 4, 6, 5], mutex: [5, 9, 4, 13, 5, 4, 4, 5, 5] };
function roverstall(el) {
  el.innerHTML = frame('THE 400 MS SLOT: WHO WAITS FOR WHOM', `<div class="wgrow"><label>bus_lock is <select data-k><option value="binary">a binary semaphore (stage start)</option><option value="mutex">a mutex</option></select></label></div><div data-out></div>`);
  const draw = () => {
    const k = el.querySelector('[data-k]').value, mx = k === 'mutex', X = t => 190 + (t - 380) * 510 / 76;
    let s = note(184, 38, 'bus_mgr (2)', 'end') + note(184, 78, 'weather (1)', 'end') + note(184, 118, 'camera, spectro, nav, ...', 'end');
    // measured instants: weather takes the lock at 382; bus_mgr wakes at 400; start: lock given at about 449, exchange ends 453; mutex: weather boosted at 400, done about 411, exchange ends 413
    const lockEnd = mx ? 411 : 449, exEnd = mx ? 413 : 453;
    s += bar(X(400), 28, X(lockEnd) - X(400), 'blko') + bar(X(lockEnd), 28, X(exEnd) - X(lockEnd), 'run') + note(X(400) + 3, 22, mx ? 'blocked on bus_lock for about 11 ms' : 'blocked on bus_lock for about 49 ms', 'start');
    s += bar(X(382), 68, X(lockEnd) - X(382), 'rdy');
    (mx ? [382, 387, 393, 397] : [382, 387, 393, 397, 403, 425, 432, 440, 446]).forEach(t => { s += bar(X(t), 68, X(t + 1.6) - X(t), 'run'); });
    if (mx) s += bar(X(400), 68, X(lockEnd) - X(400), 'run') + note(X(400) + 3, 62, 'weather lifted to priority 2', 'start');
    else s += note(X(404), 62, 'thin slices only (schematic after 403)', 'start');
    s += bar(X(400), 108, X(lockEnd) - X(400), mx ? 'rdy' : 'run') + note(X(400) + 3, 102, mx ? 'prio-1 tasks wait: weather now outranks them' : 'these tasks outrank weather and keep the CPU', 'start');
    s += `<line class="dash n" x1="${X(400)}" y1="14" x2="${X(400)}" y2="134"/>` + note(X(400) + 4, 152, 'slot 400: bus_mgr wakes', 'start') + `<line class="dash n" x1="${X(382)}" y1="54" x2="${X(382)}" y2="90"/>` + note(X(382) - 4, 152, '382: weather takes the lock', 'end');
    s += axis(190, 700, 134);
    const ex = EXD[k], W = 640 / 9;
    let b = note(10, 14, 'Delay of each of the 9 exchanges after its 100 ms slot (limit 30 ms)');
    ex.forEach((d, i) => { b += bar(14 + i * W, 94 - d * 1.25, W - 12, d > 30 ? 'blko' : 'run', d * 1.25) + note(14 + i * W + (W - 12) / 2, 108, d, 'middle') + note(14 + i * W + (W - 12) / 2, 122, (i + 1) * 100, 'middle'); });
    b += `<line class="dash n" x1="10" y1="${94 - 30 * 1.25}" x2="700" y2="${94 - 30 * 1.25}"/>` + note(704, 58, '30', 'end');
    el.querySelector('[data-out]').innerHTML = svg(720, 164, s, 'Chart of the 400 ms bus slot') + svg(720, 130, b, 'Delay of each bus exchange')
      + `<p class="wgcap">${mx ? '<span class="good">With a mutex</span> the kernel knows that weather owns the lock. When bus_mgr blocks, weather is lifted to priority 2, outranks the priority-1 crowd, finishes its 9 ms and gives the lock. The worst exchange is 13 ms late.'
        : '<span class="bad">With a binary semaphore</span> the kernel only sees a blocked bus_mgr and a ready weather at priority 1. Every task above 1 runs first. The exchange at 400 ms ends 53 ms late.'} The slot at 200 ms (26 ms late) has the same cause but is not over the limit. Times are from the game at 1 ms per tick.</p>`;
  };
  el.addEventListener('input', draw); draw();
}

// Widget 3: semaphore against mutex, with the owner's priority drawn as a line.
function locktype(el) {
  el.innerHTML = frame('SAME THREE TASKS, TWO KINDS OF LOCK', `<div class="wgrow"><label>lock object <select data-k><option value="bin">xSemaphoreCreateBinary() + give</option><option value="mtx">xSemaphoreCreateMutex()</option></select></label>${sl('m', 'medium task runs for', 0, 80, 30)}</div><div data-out></div>`);
  const draw = () => {
    const mtx = el.querySelector('[data-k]').value === 'mtx', m = val(el, 'm'), r = sim3(m, mtx), span = Math.max(r.end + 4, 30), X = t => 90 + t * 610 / span;
    let s = note(84, 40, 'high (3)', 'end') + note(84, 80, 'medium (2)', 'end') + note(84, 120, 'low (1)', 'end') + note(84, 146, 'low task', 'end') + note(84, 160, 'priority', 'end');
    s += bar(X(2), 30, X(r.hGot) - X(2), 'blko');
    ['H', 'M', 'L'].forEach((w, i) => segs(r.row, w).forEach(([a, b]) => { s += bar(X(a), 30 + i * 40, X(b) - X(a), 'run'); }));
    // owner's effective priority as a step line
    let pts = ''; r.pL.slice(0, r.end).forEach((p, t) => { const y = p === 3 ? 140 : 156; pts += `${t ? 'L' : 'M'}${X(t)} ${y} L${X(t + 1)} ${y} `; });
    s += `<path d="${pts}" fill="none" class="ar" stroke-width="2"/>` + note(X(0) + 2, 134, '3', 'start') + note(X(0) + 2, 170, '1', 'start');
    s += axis(90, 710, 176);
    el.querySelector('[data-out]').innerHTML = svg(720, 188, s, 'The low task priority with and without inheritance')
      + `<p class="wgcap">` + (mtx ? `<span class="good">Mutex:</span> the lock records that L owns it. When H blocks at 2 ms, L runs at priority 3 until it gives the lock, then drops back to 1. The medium task cannot get in between. H waits <b>${r.wait} ms</b>, whatever the medium task does.`
        : `<span class="bad">Binary semaphore:</span> the object only counts 0 or 1. It has no owner field, so the kernel does not know that L is the task H waits for. L stays at priority 1 and the medium task runs ahead of it. H waits <b>${r.wait} ms</b>.`) + '</p>';
  };
  el.addEventListener('input', draw); draw();
}

// Widget 4: step through inheritance.
function inhsteps(el) {
  const S = [
    ['weather takes bus_lock', 'weather calls xSemaphoreTake(bus_lock, portMAX_DELAY). The mutex is free, so the count goes to taken and the mutex records <code>weather</code> as its holder. weather\'s priority is its base priority, 1.', 1, 'none', 'weather'],
    ['bus_mgr wakes and asks for the lock', 'bus_mgr (priority 2) preempts weather and calls take. The mutex is held, so bus_mgr is put on the mutex\'s wait list and blocked.', 1, 'bus_mgr', 'weather'],
    ['the kernel boosts weather', 'Before it blocks bus_mgr, the kernel compares the priorities: the waiter (2) is higher than the holder (1). It raises the holder\'s current priority to 2. The base priority stays 1.', 2, 'bus_mgr', 'weather'],
    ['weather runs and gives the lock', 'weather is now priority 2, above the priority-1 crowd, and runs. It finishes publishing and calls give. The kernel hands the mutex to the waiter, bus_mgr, and moves it to Ready.', 2, 'none', 'bus_mgr'],
    ['weather drops back', 'On the give, the kernel restores weather to its base priority, 1, when it holds no other mutex. bus_mgr (2) now preempts it and runs the exchange.', 1, 'none', 'bus_mgr'],
  ];
  el.innerHTML = frame('PRIORITY INHERITANCE, ONE STEP AT A TIME', `<div class="wgrow"><button class="hb" data-prev>&#9664; BACK</button><button class="hb" data-next>NEXT &#9654;</button><b data-n></b></div><div data-out></div>`);
  let i = 0;
  const draw = () => {
    const [t, txt, pw, waiter, holder] = S[i];
    el.querySelector('[data-n]').textContent = `step ${i + 1} of ${S.length}`;
    const lvl = p => 150 - p * 40;
    let s = `<line class="dash n" x1="62" y1="${lvl(1)}" x2="690" y2="${lvl(1)}"/><line class="dash n" x1="62" y1="${lvl(2)}" x2="690" y2="${lvl(2)}"/>` + note(56, lvl(1) + 4, 'prio 1', 'end') + note(56, lvl(2) + 4, 'prio 2', 'end');
    s += box(90, lvl(2) - 18, 150, 36, 'bus_mgr|base 2' + (waiter === 'bus_mgr' ? ', waiting' : ''), waiter === 'bus_mgr' ? 'blko' : (holder === 'bus_mgr' ? 'run' : 'd'));
    s += box(310, lvl(pw) - 18, 150, 36, 'weather|current ' + pw + ' (base 1)', pw > 1 ? 'a' : 'c');
    s += box(520, 22, 150, 40, 'bus_lock (mutex)|holder: ' + holder, holder === 'weather' ? 'c' : 'g');
    // when weather is boosted its box sits on the prio 2 line, so the arrow leaves from the top of bus_mgr and passes above it
    if (waiter === 'bus_mgr') s += pw > 1 ? arrow(165, lvl(2) - 18, 520, 34, 'waits for', 0, -6) : arrow(240, lvl(2), 520, 52, 'waits for');
    if (i === 2) s += `<line class="ar" x1="385" y1="${lvl(1) - 20}" x2="385" y2="${lvl(2) + 20}" marker-end="url(#ah)"/>` + note(392, lvl(1.5) + 4, 'boost', 'start');
    if (i === 4) s += `<line class="ar" x1="385" y1="${lvl(2) + 20}" x2="385" y2="${lvl(1) - 20}" marker-end="url(#ah)"/>` + note(392, lvl(1.5) + 4, 'restore', 'start');
    el.querySelector('[data-out]').innerHTML = svg(720, 170, s, 'Priority of the lock holder at each step') + `<p class="wgcap"><b>${t}.</b> ${txt}</p>`;
  };
  el.querySelector('[data-next]').onclick = () => { i = (i + 1) % S.length; draw(); };
  el.querySelector('[data-prev]').onclick = () => { i = (i + S.length - 1) % S.length; draw(); };
  draw();
}

// Widget 5: the cures with their costs. Numbers are the game's measurements (1 s run, 1 ms ticks); null = within the limit, not recorded.
const CURES = [
  ['Binary semaphore, as it is', 53, 10, 'The exchange at 400 ms ends 53 ms late. The kernel cannot boost a holder it does not know.'],
  ['Mutex', 13, 10, 'The right default. Weather is lifted only while someone waits, and only to the waiter\'s priority.'],
  ['Mutex, bus_mgr at priority 1 (not above weather)', 57, null, 'A mutex lifts the holder to the waiter\'s priority. If the waiter is no higher than the crowd, nothing improves: every exchange waits for the priority-1 tasks.'],
  ['Weather at priority 5, binary', null, 19, 'Exchanges are fine, but weather now holds off motor and I2C work whenever it runs: the motor gap grows to 19 ms (limit 11). The cure is global, the problem was local.'],
  ['bus_mgr at priority 5, mutex', null, 13, 'bus_mgr now preempts the motor task. The motor gap grows to 13 ms. A task\'s priority describes its deadline, not how much you want it to win.'],
  ['Weather at priority 2 by hand, binary', null, 10, 'Works in this firmware (a priority ceiling done by hand). It also breaks silently when another task joins at priority 2 or 3. It passes here only because of this exact timing.'],
  ['Short critical section: format outside, copy inside', null, 10, 'Weather formats the report without the lock (7 ms) and holds the lock only for a 2 ms copy. The window for inversion shrinks to a quarter. Works with either lock kind.'],
  ['Mutex, but weather sleeps inside the lock', 76, null, 'Inheritance cannot help: the holder is asleep, not starved. bus_mgr waits for the sleep. Never block while holding a lock.'],
];
function cures(el) {
  el.innerHTML = frame('CHOOSE A CURE, READ ITS COST', `<div class="wgrow"><label>cure <select data-k>${CURES.map((c, i) => `<option value="${i}">${c[0]}</option>`).join('')}</select></label></div><div data-out></div>`);
  const draw = () => {
    const [name, ex, mg, txt] = CURES[+el.querySelector('[data-k]').value];
    const row = (label, v, lim, y) => {
      let s = note(190, y + 14, label, 'end');
      if (v === null) return s + bar(200, y, 20, 'run', 18) + note(230, y + 14, 'within the limit of ' + lim + ' ms (not recorded)', 'start');
      return s + bar(200, y, v * 5, v > lim ? 'blko' : 'run', 18) + note(206 + v * 5, y + 14, v + ' ms' + (v > lim ? ' (limit ' + lim + ')' : ''), 'start') + `<line class="dash n" x1="${200 + lim * 5}" y1="${y - 4}" x2="${200 + lim * 5}" y2="${y + 22}"/>`;
    };
    const s = row('worst bus exchange delay', ex, 30, 14) + row('largest motor gap', mg, 11, 54);
    const fail = (ex !== null && ex > 30) || (mg !== null && mg > 11);
    el.querySelector('[data-out]').innerHTML = svg(720, 86, s, 'Exchange delay and motor gap for the chosen cure')
      + `<p class="wgcap">${fail ? '<span class="bad">Fails a goal.</span>' : '<span class="good">Passes the goals.</span>'} ${txt}</p>`;
  };
  el.addEventListener('input', draw); draw();
}

// Widget 6: who holds what, from the log and the chart at a chosen time (measured, slot 400).
function lockwho(el) {
  el.innerHTML = frame('WHO HOLDS WHAT AT A GIVEN MOMENT', `<div class="wgrow"><label>lock is <select data-k><option value="binary">a binary semaphore</option><option value="mutex">a mutex</option></select></label>${sl('t', 'time', 370, 455, 420)}</div><div data-out></div>`);
  const draw = () => {
    const mx = el.querySelector('[data-k]').value === 'mutex', t = val(el, 't', ' ms'), end = mx ? 411 : 449, ex = mx ? 413 : 453;
    let bm, bmc, wt, wtc, holder, note2;
    if (t < 382) { holder = 'nobody'; wt = 'Blocked (time)'; wtc = 'blk'; bm = 'Blocked (time)'; bmc = 'blk'; note2 = 'bus_lock is free. Nothing is wrong yet.'; }
    else if (t < 400) { holder = 'weather'; wt = 'Ready / Running (slices)'; wtc = 'rdy'; bm = 'Blocked (time)'; bmc = 'blk'; note2 = 'weather holds the lock and is publishing, but the crowd above it keeps interrupting it.'; }
    else if (t < end) { holder = 'weather'; bm = 'Blocked on bus_lock'; bmc = 'blko'; wt = mx ? 'Running at priority 2 (base 1)' : 'Ready, priority 1, mostly not running'; wtc = mx ? 'run' : 'rdy'; note2 = mx ? 'bus_mgr is blocked, but weather has been lifted and is finishing quickly.' : 'bus_mgr is blocked on a lock whose holder is starved by tasks that have nothing to do with the bus. This is the inversion.'; }
    else if (t < ex) { holder = 'bus_mgr'; bm = 'Running'; bmc = 'run'; wt = 'Blocked (time)'; wtc = 'blk'; note2 = 'weather gave the lock; bus_mgr runs the exchange.'; }
    else { holder = 'nobody'; bm = 'Blocked (time)'; bmc = 'blk'; wt = 'Blocked (time)'; wtc = 'blk'; note2 = 'Cycle over. Exchange ' + (ex - 400) + ' ms after its slot.'; }
    const s = box(10, 12, 200, 54, 'bus_mgr (prio 2)|' + bm, bmc) + box(230, 12, 260, 54, 'weather (base prio 1)|' + wt, wtc) + box(510, 12, 200, 54, 'bus_lock|holder: ' + holder, holder === 'nobody' ? 'g' : 'a');
    el.querySelector('[data-out]').innerHTML = svg(720, 78, s, 'State of the two tasks and the lock at the chosen time')
      + `<p class="wgcap">${note2} To find this in the field read three things: the state of the waiter (Blocked on a lock, not on time), the holder of the lock, and what the holder is doing. A holder that is Ready for many ms while others run is an inversion. A holder that is Blocked on time is sleeping inside the lock.</p>`;
  };
  el.addEventListener('input', draw); draw();
}

export const widgets = { inv3, roverstall, locktype, inhsteps, cures, lockwho };

/* ================= diagrams ================= */

// 1. The three-task story, static
const pathDia = svg(720, 190, (() => {
  const X = t => 110 + t * 10; let s = note(100, 38, 'high: bus', 'end') + note(100, 80, 'medium: comms', 'end') + note(100, 122, 'low: weather', 'end');
  s += bar(X(0), 108, X(10) - X(0), 'run') + note(X(0) + 2, 102, 'low takes the lock', 'start');
  s += bar(X(5), 28, X(40) - X(5), 'blko') + note(X(5) + 3, 22, 'high waits for the lock', 'start');
  s += bar(X(10), 68, X(35) - X(10), 'run') + note(X(10) + 3, 62, 'medium runs: nobody needs the lock for this', 'start');
  s += bar(X(10), 108, X(35) - X(10), 'rdy') + note(X(10) + 3, 150, 'low is Ready but loses to medium', 'start');
  s += bar(X(35), 108, X(40) - X(35), 'run') + bar(X(40), 28, X(44) - X(40), 'run');
  s += `<line class="dash n" x1="${X(5)}" y1="20" x2="${X(5)}" y2="150"/>` + `<line class="dash n" x1="${X(40)}" y1="20" x2="${X(40)}" y2="150"/>` + note(X(40) + 4, 150, 'low gives lock; high runs late', 'start');
  s += axis(110, 700, 164) + note(700, 182, 'time', 'end');
  return s;
})(), 'High task blocked on a lock held by a low task while a medium task runs');

// 2. The wait chain on the rover
const chainDia = svg(720, 110, box(10, 20, 150, 56, 'bus_mgr (2)|wants bus_lock', 'blko') + arrow(160, 48, 220, 48, 'waits for')
  + box(220, 20, 150, 56, 'weather (1)|holds bus_lock', 'rdy') + arrow(370, 48, 430, 48, 'waits for')
  + box(430, 20, 280, 56, 'camera, spectro, nav, telemetry ...|priorities 2 and 3, running', 'run') + note(360, 100, 'bus_mgr waits for work that has nothing to do with the bus', 'middle'),
'bus_mgr waits for weather, which waits for the CPU held by unrelated tasks');

// 3. Signal against lock
const kindDia = svg(720, 190, box(10, 10, 340, 28, 'xSemaphoreCreateBinary()   a signal', 'c')
  + box(10, 50, 340, 36, 'state: empty or full|no owner field', 'd') + box(10, 98, 340, 36, 'Give: from any task or ISR|Take: any task, no memory of who', 'd') + box(10, 146, 340, 30, 'no priority inheritance', 'blko')
  + box(370, 10, 340, 28, 'xSemaphoreCreateMutex()   a lock', 'g')
  + box(370, 50, 340, 36, 'state: free or held|owner = the task that took it', 'd') + box(370, 98, 340, 36, 'Give: only by the owner, never from an ISR|Take: blocked takers are queued', 'd') + box(370, 146, 340, 30, 'priority inheritance for the owner', 'run'),
'A binary semaphore has no owner; a mutex has one and can lift it');

// 4. Priority over time
const inhDia = svg(720, 170, (() => {
  const X = t => 110 + t * 11, Y = p => 120 - p * 36; let s = note(100, Y(1) + 4, 'prio 1', 'end') + note(100, Y(2) + 4, 'prio 2', 'end');
  s += `<line class="dash n" x1="110" y1="${Y(1)}" x2="700" y2="${Y(1)}"/><line class="dash n" x1="110" y1="${Y(2)}" x2="700" y2="${Y(2)}"/>`;
  s += `<path d="M${X(0)} ${Y(1)} L${X(18)} ${Y(1)} L${X(18)} ${Y(2)} L${X(33)} ${Y(2)} L${X(33)} ${Y(1)} L${X(52)} ${Y(1)}" fill="none" class="ar" stroke-width="2.5"/>`;
  s += note(X(18), Y(2) - 10, 'bus_mgr blocks on the lock: weather lifted to 2', 'start') + note(X(33) + 3, Y(1) + 18, 'weather gives the lock: back to 1', 'start') + note(X(2), Y(1) + 18, 'weather holds the lock', 'start');
  s += axis(110, 700, 146) + note(700, 164, 'time', 'end');
  return s;
})(), 'Current priority of weather over time');

// 5. The cures as a table
const cureDia = svg(720, 168, (() => {
  const R = [['cure', 'cost', 'when'], ['mutex', 'a little RAM, a few cycles', 'the default for any lock'], ['short critical section', 'code restructuring', 'always: shrinks every window'], ['priority ceiling by hand', 'priorities become fragile', 'only if you control all tasks'], ['critical section', 'blocks tasks and ISRs', 'a few instructions only']];
  let s = ''; R.forEach((r, i) => { const y = 6 + i * 32, h = i ? 'd' : 'a'; s += box(6, y, 200, 28, r[0], h) + box(214, y, 230, 28, r[1], h) + box(452, y, 262, 28, r[2], h); });
  return s;
})(), 'Table of the cures for priority inversion and what each costs');

// 6. Chart with bracket
const chartDia = svg(720, 170, (() => {
  const X = t => 100 + (t - 396) * 11;
  let s = note(94, 38, 'bus_mgr', 'end') + note(94, 78, 'weather', 'end') + note(94, 112, 'camera,', 'end') + note(94, 126, 'spectro, nav', 'end');
  s += bar(X(400), 28, X(449) - X(400), 'blko') + bar(X(449), 28, X(453) - X(449), 'run');
  s += bar(X(396), 68, X(400) - X(396), 'rdy') + bar(X(400), 68, X(449) - X(400), 'rdy') + bar(X(403), 68, 6, 'run') + bar(X(425), 68, 6, 'run') + bar(X(440), 68, 6, 'run');
  s += bar(X(400), 108, X(449) - X(400), 'run');
  s += `<line class="ar" x1="${X(400)}" y1="146" x2="${X(453)}" y2="146"/><line class="ar" x1="${X(400)}" y1="140" x2="${X(400)}" y2="152"/><line class="ar" x1="${X(453)}" y1="140" x2="${X(453)}" y2="152"/>` + note(X(426), 164, 'exchange 53 ms late: bus_mgr blocked, lower tasks busy', 'middle');
  return s;
})(), 'Chart showing bus_mgr blocked while lower tasks run');

/* ================= ESP-IDF source ================= */

export const realCode = `// main/rover_main.c   (ESP-IDF v5.x)   stage 12: stage 11 plus a shared bus lock that must be a mutex
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "rover.h"   // prototypes for the rover helpers (not shown)

// Priorities, highest first. Higher number = more urgent.
#define PRIO_LIGHTS    4   // beacon, heart
#define PRIO_MOTOR     3
#define PRIO_BUS       2   // bus_mgr: a 100 ms exchange with the instrument bus
#define PRIO_WEATHER   1   // weather: a 190 ms report, no deadline

static const char *TAG = "rover";

// One lock for the shared instrument bus.
static SemaphoreHandle_t bus_lock;

// Every 100 ms the bus manager exchanges data with the instrument bus. It needs bus_lock for about 2 ms.
static void bus_mgr_task(void *arg)
{
    TickType_t last = xTaskGetTickCount();
    for (;;) {
        xTaskDelayUntil(&last, pdMS_TO_TICKS(100));
        xSemaphoreTake(bus_lock, portMAX_DELAY);
        exchange_data();                  // talks to the bus: only valid while holding bus_lock
        xSemaphoreGive(bus_lock);
    }
}

// Every 190 ms the weather task publishes a report on the same bus. Publishing holds bus_lock for 9 ms of CPU.
static void weather_task(void *arg)
{
    TickType_t last = xTaskGetTickCount();
    for (;;) {
        xTaskDelayUntil(&last, pdMS_TO_TICKS(190));
        xSemaphoreTake(bus_lock, portMAX_DELAY);
        publish_weather();                // 9 ms of CPU in the game, long enough for the inversion
        xSemaphoreGive(bus_lock);
        // Never vTaskDelay() between the take and the give: a sleeping holder cannot be helped by inheritance.
    }
}

// Stage 12 change to the camera: first frame at 240 ms, then one frame every 240 ms of sleep, to make room for the bus tasks.
static void camera_task(void *arg)
{
    vTaskDelay(pdMS_TO_TICKS(240));
    for (;;) { compress_frame(); vTaskDelay(pdMS_TO_TICKS(240)); }
}
// beacon, heart, motor, telemetry, spectro, nav, mapper, science, radio, imu, thermo, bumper, antenna, radio_link, time_sync,
// gps_fix, uplink, arm, focus and the ISRs: unchanged from stages 1 to 11.

void app_main(void)
{
    // ... GPIO setup, queues, semaphores and tasks from stages 1 to 11 ...

    // The fix of this stage. The wrong version was:
    //   bus_lock = xSemaphoreCreateBinary();   // created EMPTY, so the code also had to call:
    //   xSemaphoreGive(bus_lock);              // ... and it has no owner, so no priority inheritance
    bus_lock = xSemaphoreCreateMutex();        // created available, owned by whoever takes it, inheritance on
    configASSERT(bus_lock != NULL);

    // Return values unchecked for brevity: check == pdPASS in real code.
    xTaskCreate(bus_mgr_task, "bus_mgr", 1344, NULL, PRIO_BUS,     NULL);   // game stack sizes; real tasks that call ESP_LOGx need more
    xTaskCreate(weather_task, "weather", 1536, NULL, PRIO_WEATHER, NULL);
    ESP_LOGI(TAG, "bus lock is a mutex, bus_mgr prio %d, weather prio %d", PRIO_BUS, PRIO_WEATHER);
}

// Build notes
//   idf.py build flash monitor
//   Mutexes need no Kconfig switch in ESP-IDF; xSemaphoreCreateMutex() is always available.
//   The game ticks at 1 ms (as if CONFIG_FREERTOS_HZ=1000). The ESP-IDF default is 100 Hz (10 ms tick):
//   at the default, pdMS_TO_TICKS(190) is 19 ticks and pdMS_TO_TICKS(100) is 10 ticks, so these periods still work.
//   Debug aid: xSemaphoreGetMutexHolder(bus_lock) returns the handle of the task that holds the mutex (NULL if free).
//   Timed take with a log, to see a stall in the field:
//     if (xSemaphoreTake(bus_lock, pdMS_TO_TICKS(20)) != pdTRUE) { ESP_LOGW(TAG, "bus_lock busy for 20 ms"); }`;

/* ================= manual ================= */

export const manual = [
  ['1. The bug that reset a rover', `<p>In July 1997 the Mars Pathfinder lander began to reset itself on the surface of Mars. The cause was not a hardware fault. It was a <b>priority inversion</b> in the real-time kernel: a high-priority task waited for a lock held by a low-priority task, and a medium-priority task kept the low one from running. A watchdog saw that the high task did not finish in time and reset the computer.</p>
   ${pathDia}
   <p class="cap">Three tasks and one lock. The high task is blocked, the low task is Ready but loses to the medium task, and the medium task never needs the lock.</p>
   <ul><li>The high task does not wait for the low task alone. It waits for the low task <b>plus everything that outranks the low task</b>. The medium task is not even in the picture of the lock.</li>
   <li>The wait is <b>unbounded</b> in principle: it is as long as the medium work takes, not as long as the critical section takes. A deadline analysis that counts only the critical section is wrong.</li>
   <li>It shows up rarely. It needs the high task to wake while the low task is inside the lock, and a medium task to be ready at that moment. That is why it passes tests.</li></ul>
   <p>Change the length of the medium task and watch the high task's wait follow it:</p>
   <div data-w="inv3"></div>`],

  ['2. Priority inversion on the rover', `<p>Stage 12 adds two tasks that share the instrument bus through one lock, <code>bus_lock</code>. <code>bus_mgr</code> (priority 2) exchanges data every 100 ms and has a 30 ms limit. <code>weather</code> (priority 1) publishes a report every 190 ms and holds the lock for the 9 ms the publish takes. Most exchanges are fine. The one at 400 ms ends <b>53 ms late</b>.</p>
   ${chainDia}
   <p>At 400 ms <code>bus_mgr</code> wakes while <code>weather</code> holds the lock. <code>bus_mgr</code> blocks. <code>weather</code> has priority 1, the lowest in the rover, so camera, spectrometer, navigation, telemetry and the others run ahead of it and give it only thin slices of CPU. <code>bus_mgr</code> is delayed by every task that has nothing to do with the bus. The rover has no single named "medium task": the whole crowd between priority 1 and 2 plays that part.</p>
   <ul><li>The stall happens only on some cycles: only when the 100 ms slot falls inside the time <code>weather</code> holds the lock. The lock is held for 9 ms of CPU, but with preemption that stretches to tens of ms of wall time, which is why the slot at 200 ms (26 ms) and the one at 400 ms (53 ms) both hit it.</li>
   <li>Whether a stall passes the limit depends on exact timing. The 200 ms slot has the same cause and passes the 30 ms limit by luck.</li></ul>
   <p>Switch the lock type and compare the slot at 400 ms and all nine exchanges:</p>
   <div data-w="roverstall"></div>`],

  ['3. Binary semaphore or mutex', `<p>Both are built on the same kernel object, a queue of length 1 with no data. Both are taken with <code>xSemaphoreTake()</code> and given with <code>xSemaphoreGive()</code>. The difference is what the kernel remembers.</p>
   ${kindDia}
   <ul><li><code>xSemaphoreCreateBinary()</code> creates a semaphore that is <b>empty</b>: a take blocks until someone gives. To use it as a lock you must give it once after creating it, which is what the stage 12 start code does.</li>
   <li><code>xSemaphoreCreateMutex()</code> creates a mutex that is <b>available</b>. When a task takes it, the kernel records that task as the <b>holder</b>. Priority inheritance is a feature of mutexes only. Binary and counting semaphores have no holder, so they cannot have inheritance. (Stage 6 said that a mutex is the lock to use; this is the reason.)</li>
   <li>A semaphore is meant for <b>signalling</b>: an ISR or a task gives, another task takes, and the giver is not the taker. A mutex is meant for <b>mutual exclusion</b>: the task that takes it gives it. That rule is what makes an owner meaningful.</li>
   <li>A mutex cannot be used from an ISR: there is no task to be the owner, and an ISR cannot block. Use a semaphore or a task notification to signal from an ISR.</li>
   <li>Give a mutex you do not hold and the kernel complains. The game raises an assert ("bus_mgr gave bus_lock but does not hold it"); in ESP-IDF v5.x a give by a task that is not the holder trips a <code>configASSERT</code> in the priority-disinherit code (asserts are on by default), and the chip aborts.</li>
   <li>RAM cost is the same here, 96 bytes of kernel object in the game, so there is no reason to use a binary semaphore as a lock.</li></ul>
   <p>The line under the chart is the priority of the low task. Switch the object kind:</p>
   <div data-w="locktype"></div>`],

  ['4. Priority inheritance step by step', `<p>The rule is short. When a task tries to take a mutex that is held, and the waiting task has a <b>higher priority</b> than the holder, the kernel raises the holder's <i>current</i> priority to the waiter's. The holder's <i>base</i> priority is kept. When the holder gives the mutex back, its current priority returns to the base.</p>
   ${inhDia}
   <ul><li>The lift happens <b>inside the take call</b>, before the waiter blocks. No extra task and no timer are involved.</li>
   <li>The holder is lifted to the priority of the <b>highest-priority waiter</b>, not above it. In the rover <code>weather</code> is lifted to 2, not to 3 or 4. That is above the priority-1 crowd, but only equal to telemetry, imu, thermo and science, so it still shares the CPU with those. This is why the exchange is 13 ms late and not 5.</li>
   <li>With several waiters, the holder follows the highest one; with several held mutexes, the holder is restored to its base priority only when it has given back every mutex it holds (the kernel's <code>uxMutexesHeld</code> count reaches 0), even if nobody waits for the others.</li>
   <li>ESP-IDF's FreeRTOS lifts only the direct holder of the mutex; it does not follow a chain (A waits for B, B waits for C). Do not design for chains of locks. Nested locks bring back stage 11: inheritance reduces waiting but does not prevent deadlock.</li>
   <li>The priority range in ESP-IDF is 0 to 24 (<code>configMAX_PRIORITIES</code> is 25) and the idle task is priority 0.</li></ul>
   <p>Step through the five moments of one exchange:</p>
   <div data-w="inhsteps"></div>`],

  ['5. Other cures and their costs', `<p>A mutex is the first cure, not the only one. Each cure has a cost, and some "obvious" cures break something else.</p>
   ${cureDia}
   <ul><li><b>Shorten the critical section.</b> Format the report outside the lock (7 ms) and hold the lock only for the 2 ms copy; this shrinks the inversion window with any lock kind.</li>
   <li><b>Priority ceiling by hand.</b> Give every user of the lock a priority at or above the highest one; it works here but silently breaks when another task joins at 2 or 3.</li>
   <li><b>Raise a priority far above the crowd.</b> Do not: weather or bus_mgr at priority 5 fixes the exchange but pushes the motor gap to 19 or 13 ms (limit 11), because a priority states a deadline, not a wish.</li>
   <li><b>Never sleep while holding a lock.</b> A <code>vTaskDelay(60)</code> between take and give makes bus_mgr wait the whole sleep (76 ms late), because inheritance lifts only a task that wants to run.</li>
   <li><b>Keep the waiter above the crowd.</b> A mutex lifts the holder only to the waiter's priority, so with bus_mgr at priority 1 every exchange would still wait for the priority-1 tasks.</li></ul>
   <p>Pick a cure and read the exchange delay and the motor gap it produces:</p>
   <div data-w="cures"></div>`],

  ['6. Finding it in the field', `<p>An inversion produces no error and no log line. It shows up as one late response, and only sometimes. Three habits find it: read the task states, name the lock holder, and use a timed take.</p>
   ${chartDia}
   <p class="cap">The signature: the high task is blocked on a lock for tens of ms while lower-priority tasks run, and the holder of the lock is Ready but not running.</p>
   <ul><li><b>Read the states.</b> <code>vTaskList()</code> prints one letter per task (X running, R ready, B blocked). In an inversion the high task shows B and the holder shows R, but the list does not say which lock the high task waits for.</li>
   <li><b>Name the holder.</b> <code>pcTaskGetName(xSemaphoreGetMutexHolder(bus_lock))</code> gives the name of the task that holds the mutex. This works only for mutexes, another reason not to use a binary semaphore as a lock.</li>
   <li><b>Use a timed take.</b> <code>if (xSemaphoreTake(bus_lock, pdMS_TO_TICKS(20)) != pdTRUE) ESP_LOGW(TAG, "bus_lock busy, held by %s", pcTaskGetName(xSemaphoreGetMutexHolder(bus_lock)));</code> logs every stall. Decide in advance what the task does when the wait ends: in the game a timed-out take restarts the task from its first line.</li></ul>
   <p>Move the time marker through the slot at 400 ms and read who holds what:</p>
   <div data-w="lockwho"></div>
   <details><summary><b>Going further</b></summary>
   <ul><li><b>vTaskList options.</b> It needs <code>CONFIG_FREERTOS_USE_TRACE_FACILITY</code> and <code>CONFIG_FREERTOS_USE_STATS_FORMATTING_FUNCTIONS</code>. A trace tool such as SystemView shows the same states on a timeline, like the game's chart.</li>
   <li><b>Critical sections.</b> <code>portENTER_CRITICAL(&amp;lock)</code> and <code>portEXIT_CRITICAL(&amp;lock)</code> mask interrupts up to the FreeRTOS syscall priority level on the calling core and take a spinlock, so no task and no FreeRTOS-managed ISR can run inside. Use it for a few instructions only, and never call a blocking function inside.</li>
   <li><b>Watchdog.</b> The task watchdog (<code>esp_task_wdt_add()</code> and <code>esp_task_wdt_reset()</code>) turns a long wait into a visible event, as on Pathfinder; <code>esp_timer_get_time()</code> gives microsecond time stamps for the wait.</li>
   <li><b>Two cores.</b> On a dual-core ESP32 the holder may run on the other core, so a lock can stall a task without any priority picture; this is a simplification of the SMP behaviour. Stage 13 covers it. The game has one core.</li>
   <li><b>Tick.</b> Game time ticks at 1 ms; real ESP-IDF defaults to 100 Hz, where a 2 ms exchange is below one tick. In the game the numbers are scaled so the effect fits into a 1 s run.</li></ul>
   </details>`],
];

export const quiz = [
  { q: 'A high-priority task waits for a lock held by a low-priority task. A medium-priority task becomes ready. Which task is delaying the high-priority task?', opts: ['The low-priority task only, because it holds the lock', 'The medium-priority task, indirectly: it keeps the low task from running and finishing', 'Nothing delays it; the kernel hands the lock over at once'], a: 1, why: 'The low task needs CPU time to finish and give the lock. The medium task outranks it and takes that CPU time, so the high task waits as long as the medium work lasts, although it never touches the lock.', wrong: ["The low task holds the lock, but it would finish quickly if it could run. It is the medium task that decides how long the wait lasts.", null, "The kernel hands the lock over only when the holder gives it. The holder has to run first, and a medium task can stop it."] },
  { q: 'bus_mgr is late only at the 200 ms and 400 ms slots, and on time at the others. Why?', opts: ['The stack of bus_mgr is too small, so some runs are slow', 'Only those slots fall inside the time weather holds bus_lock, so the other cycles never block', 'The tick interrupt skips two ticks in every nine'], a: 1, why: 'The stall needs bus_mgr to wake while weather holds the lock. Most cycles find the lock free and run in 4 to 6 ms. That is why inversion is hard to find by testing.', wrong: ["Stack size does not depend on the time slot, and an overflow would crash the task, not make it late on some cycles only.", null, "The tick interrupt does not skip ticks. The delay is there only when bus_mgr finds the lock taken."] },
  { q: 'Two tasks share a lock. One uses xSemaphoreCreateBinary() and one uses xSemaphoreCreateMutex(). Which object can lift the priority of its holder, and why?', opts: ['The binary semaphore, because it is faster', 'The mutex, because it records which task holds it', 'Both, because they use the same queue code'], a: 1, why: 'Inheritance needs to know whom to lift. A mutex stores its holder; a binary semaphore is only a 0/1 count with no owner.', wrong: ["Speed is not the difference. A binary semaphore has no owner, so the kernel does not know which task to lift.", null, "Both are built on the same kernel queue code, but only the mutex records a holder and uses it to lift the priority."] },
  { q: 'weather (base priority 1) holds a mutex. bus_mgr (priority 2) blocks on it. At what priority does weather run, and until when?', opts: ['Priority 2, until weather gives the mutex', 'Priority 1, because the base priority never changes', 'Priority 4 (the top of the rover), until the exchange ends'], a: 0, why: 'The holder is lifted to the priority of the highest waiter, here 2, and restored to its base when it gives the mutex. It is not lifted above the waiter.', wrong: [null, "The base priority stays at 1, but the holder runs at a higher current priority while a higher task waits. Inheritance changes the current priority, not the base.", "The holder is lifted to the priority of the highest waiter, not above it, and not to the top of the system."] },
  { q: 'The exchange is late, so you give weather priority 5. The exchange gets fast. What do you check next?', opts: ['Nothing: the problem is solved', 'The motor and I2C tasks: weather at 5 can now hold them off, and the motor gap grows past its limit', 'The heap, because a higher priority needs more RAM'], a: 1, why: 'Priority 5 outranks the motor task (3) whenever weather runs, so the motor misses its 11 ms limit. The cure was global where the problem was local. A mutex lifts weather only while bus_mgr waits.', wrong: ["Priority 5 makes the exchange faster, but a priority is also a promise to everyone else. The fast exchange does not show what the high priority takes from other tasks.", null, "A higher priority does not use more RAM. A task needs the same stack and control block at any priority."] },
  { q: 'On the chart the exchange is 53 ms late. bus_mgr is Blocked and weather is Ready but rarely Running, while camera and spectrometer run. What is the cause?', opts: ['bus_mgr waits for bus_lock, and its holder weather is starved by unrelated tasks of higher priority: priority inversion', 'bus_mgr is stuck in a deadlock with weather', 'weather has crashed and the watchdog is resetting it'], a: 0, why: 'A deadlock would show both tasks blocked on locks for ever. A holder that is Ready but not running, with others running ahead of it, is the inversion signature.', wrong: [null, "A deadlock needs a ring of tasks that wait for each other. Here the holder is not waiting for any lock, it is Ready and only loses the CPU to other tasks.", "The chart shows weather Ready, which means it is alive. A crashed task would not be Ready, and nothing here points to a watchdog reset."] },
];
