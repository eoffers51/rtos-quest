// Field manual for stage 11 (ESP-IDF): deadlock and lock ordering. Section 5 previews starvation and livelock (not assessed here).
import { svg, box, arrow, note } from '../widgets.js';

const bar = (x, y, w, cls, h = 20) => `<rect class="bx ${cls}" x="${x}" y="${y}" width="${Math.max(1, w)}" height="${h}" rx="2"/>`;
const axis = (x0, x1, y) => `<line class="ar" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" marker-end="url(#ah)"/>`;

/* ================= widgets ================= */

const frame = (title, body) => `<div class="wg"><div class="wgh">INTERACTIVE · ${title}</div>${body}</div>`;
const sl = (id, label, min, max, v, step = 1) => `<label>${label} <input type="range" data-${id} min="${min}" max="${max}" step="${step}" value="${v}"> <b data-${id}v></b></label>`;
const val = (el, id, unit = ' ms') => { const v = +el.querySelector('[data-' + id + ']').value; el.querySelector('[data-' + id + 'v]').textContent = v + unit; return v; };

// Widget 1: two sessions, one slider for the time between the two first takes.
// Idealised model with the game's call times: arm holds arm_mtx for positionArm (1 ms CPU + 12 ms wait) and then asks for cam_mtx;
// focus holds cam_mtx for calibrateCamera (1 ms + 20 ms) and then asks for arm_mtx. Photograph needs 2 + 30 ms, checkFocus 1 + 15 ms.
function twodoors(el) {
  el.innerHTML = frame('THE SECOND SESSION: HOW FAR APART DO THE TWO TASKS START?', `<div class="wgrow">${sl('o', 'focus starts after arm by', -30, 40, 6)}</div><div data-out></div>`);
  const draw = () => {
    const o = val(el, 'o'), a = Math.max(0, -o), f = Math.max(0, o);     // start times, one of them 0
    const aWant = a + 13, fWant = f + 21;                                // when each asks for its second lock
    // deadlock: each holds its first lock when the other asks for it
    const dead = f < aWant && a < fWant;
    const X = t => 80 + t * 9;
    let ch = note(74, 36, 'arm', 'end') + note(74, 96, 'focus', 'end'), res;
    if (dead) {
      const end = Math.max(aWant, fWant);
      ch += bar(X(a), 24, X(aWant) - X(a), 'c') + note(X(a) + 3, 18, 'holds arm_mtx', 'start') + bar(X(aWant), 24, X(end + 14) - X(aWant), 'blko') + note(X(aWant) + 3, 54, 'waits for cam_mtx for ever', 'start');
      ch += bar(X(f), 84, X(fWant) - X(f), 'g') + note(X(f) + 3, 78, 'holds cam_mtx', 'start') + bar(X(fWant), 84, X(end + 14) - X(fWant), 'blko') + note(X(fWant) + 3, 114, 'waits for arm_mtx for ever', 'start');
      res = `<span class="bad">Deadlock.</span> arm asks for cam_mtx at ${aWant} ms, focus asks for arm_mtx at ${fWant} ms. Each asks while the other still holds its first lock, and neither ever gives it up.`;
    } else {
      // the one that asks second finds the first lock free or only briefly busy; show the first-comer finishing
      const armFirst = a + 13 <= f + 21 && !(f < a + 13);
      const armDone = armFirst ? a + 13 + 32 : Math.max(a + 13, f + 21 + 16) + 32, focDone = armFirst ? Math.max(f + 21, a + 45) + 16 : f + 21 + 16;
      ch += bar(X(a), 24, X(a + 13) - X(a), 'c') + bar(X(a + 13), 24, X(Math.min(armDone, 60)) - X(a + 13), 'run') + note(X(a + 13) + 3, 18, 'cam + photograph', 'start');
      ch += bar(X(f), 84, X(f + 21) - X(f), 'g') + bar(X(f + 21), 84, X(Math.min(focDone, 70)) - X(f + 21), 'run') + note(X(f + 21) + 3, 78, 'checkFocus', 'start');
      res = `<span class="good">No deadlock.</span> One task has its second lock before the other asks for its own, so the second task only <b>waits</b> and then goes on. The code is the same as in the failing case; only the timing changed.`;
    }
    ch += axis(80, 710, 140) + [0, 10, 20, 30, 40, 50, 60].map(t => note(X(t), 158, t, 'middle')).join('') + note(710, 158, 'ms', 'end');
    el.querySelector('[data-out]').innerHTML = svg(720, 164, ch, 'Two tasks taking two locks in opposite order at different offsets')
      + `<p class="wgcap">${res} In the game the second session starts with focus 6 ms after arm (slider at 6). Overlaps from about -20 to +12 ms deadlock; the first session (80 ms apart) did not. The model leaves out other tasks and uses the call times of the rover functions.</p>`;
  };
  el.addEventListener('input', draw); draw();
}

// Widget 2: four conditions as toggles
function fourconds(el) {
  const C = [
    ['me', 'Mutual exclusion', 'A lock can be held by one task at a time.', 'Make the resource shareable: copy it, make it read-only, or give each task its own.'],
    ['hw', 'Hold and wait', 'A task holds one lock while it asks for another.', 'Take everything at once, or release the first lock before asking for the second.'],
    ['np', 'No preemption', 'A lock cannot be taken away from its owner.', 'Not possible with FreeRTOS mutexes: only the owner gives one back.'],
    ['cw', 'Circular wait', 'A ring of tasks, each waiting for a lock the next one holds.', 'Fix one global lock order and take locks only in that order.'],
  ];
  el.innerHTML = frame('FOUR CONDITIONS: REMOVE ONE', `<div class="wgrow">${C.map(([k, t]) => `<label><input type="checkbox" data-c="${k}" checked> ${t}</label>`).join(' ')}</div><div data-out></div>`);
  const draw = () => {
    const on = Object.fromEntries(C.map(([k]) => [k, el.querySelector(`[data-c="${k}"]`).checked]));
    const dead = C.every(([k]) => on[k]);
    let ch = '';
    C.forEach(([k, t], i) => { ch += box(10 + i * 178, 12, 166, 46, t + '|' + (on[k] ? 'present' : 'removed'), on[k] ? 'r' : 'g'); });
    ch += note(360, 92, dead ? 'all four hold: a deadlock is possible' : 'one condition missing: a deadlock cannot form', 'middle');
    const gone = C.filter(([k]) => !on[k]);
    el.querySelector('[data-out]').innerHTML = svg(720, 104, ch, 'Four deadlock conditions, each present or removed')
      + `<p class="wgcap">${dead ? '<span class="bad">All four are present.</span> The stage 11 start code is exactly this: two exclusive locks, held while the next is requested, never taken back, in a ring. Untick one.'
        : '<span class="good">Safe.</span> ' + gone.map(([, t, , how]) => `<b>${t}</b> removed: ${how}`).join(' ') + ' The rover fix removes circular wait, because it is the only condition you can control without changing what the locks protect.'}</p>`;
  };
  el.addEventListener('change', draw); draw();
}

// Widget 3: lock order for three tasks
function lockorder(el) {
  const opt = v => `<option value="A">arm_mtx first</option><option value="C">cam_mtx first</option>`.replace(`value="${v}"`, `value="${v}" selected`);
  el.innerHTML = frame('LOCK ORDER PER TASK', `<div class="wgrow">
    <label>arm <select data-t0>${opt('A')}</select></label> <label>focus <select data-t1>${opt('C')}</select></label> <label>a third task, <b>logger</b> <select data-t2>${opt('A')}</select></label></div><div data-out></div>`);
  const draw = () => {
    const ord = [0, 1, 2].map(i => el.querySelector(`[data-t${i}]`).value), names = ['arm', 'focus', 'logger'];
    const pairs = []; for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (ord[i] !== ord[j]) pairs.push(`${names[i]} and ${names[j]}`);
    const lab = o => o === 'A' ? 'arm_mtx, then cam_mtx' : 'cam_mtx, then arm_mtx';
    let ch = box(300, 8, 220, 34, 'arm_mtx (rank 1)', 'a') + arrow(410, 42, 410, 62, 'always down') + box(300, 64, 220, 34, 'cam_mtx (rank 2)', 'c');
    names.forEach((n, i) => { ch += box(10 + i * 0, 8 + i * 38, 230, 30, `${n}: ${lab(ord[i])}`, ord[i] === 'A' ? 'g' : 'r'); });
    el.querySelector('[data-out]').innerHTML = svg(720, 118, ch, 'Lock order per task against the rank ladder')
      + `<p class="wgcap">${pairs.length ? `<span class="bad">Can deadlock:</span> ${pairs.join(', ')} climb the ladder in opposite directions (red). Any pair that disagrees can form the ring when they overlap.`
        : '<span class="good">No deadlock possible.</span> All tasks agree on one order, so no ring exists, whatever the timing. It does not matter which order is chosen, only that it is one.'} `
      + (pairs.length ? 'Fix: change the minority so that every task goes down the ladder the same way. The release order never matters.' : 'The release order is free; releasing in reverse is only a habit.') + '</p>';
  };
  el.addEventListener('change', draw); draw();
}

// Widget 4: ways out
function ways(el) {
  const S = {
    order: ['One global lock order', 'g', 'arm_mtx, then cam_mtx in every task. No deadlock at all. Cost: a rule everyone must know; it breaks when a new task or a function that locks inside a callback is added. Both rover tasks hold both locks for both calls, as the reference solution does.', 'Both photographs (690, 908 ms) and both focus checks (763, 860 ms); no fault.'],
    release: ['Release before acquiring', 'g', 'focus gives cam_mtx after calibrateCamera, then takes arm_mtx and cam_mtx in the same order as arm for checkFocus. Removes hold and wait for the first step. Cost: the state protected by the first lock may change while it is released, so re-check it.', 'The chart shows a short gap between the calibration and the focus check; both sessions complete.'],
    coarse: ['One coarse lock', 'g', 'One mutex for the whole photo session instead of two. No ring is possible with one lock. Cost: arm and focus can never overlap, even when their parts would not clash. In the game the cam_mtx taken by photograph and checkFocus is part of the driver check, so removing it shows a fault: the call needs the lock it was designed for.', 'The red "!" mark and the log line "photograph() ran without holding cam_mtx". Replace the lock, do not delete it.'],
    timeout: ['Timeout, then back off and release', 'a', 'xSemaphoreTake(m, pdMS_TO_TICKS(30)) returns pdFALSE after 30 ms. Real code then gives the lock it already holds, waits a different time per task, and tries again. Cost: you need a retry path and a back-off, otherwise two tasks can retry in step for ever (livelock).', 'The game cannot show the good version: when a take times out the simulated task restarts from its first line and keeps every lock it holds. That is the wrong answer "gives up but keeps the lock".'],
    onlytimeout: ['Timeout alone', 'r', 'A timeout with no release only turns a hang into a task that restarts holding its first lock. The other task is still blocked behind that lock, but now its owner is asleep, so the game prints no deadlock line.', 'arm stays blocked from 846 ms to the end; focus sleeps holding cam_mtx. Nothing in the log says why.'],
  };
  el.innerHTML = frame('WAYS OUT OF A DEADLOCK', `<div class="wgrow"><label>strategy <select data-s>${Object.entries(S).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></label></div><div data-out></div>`);
  const draw = () => {
    const [t, cls, how, game] = S[el.querySelector('[data-s]').value];
    el.querySelector('[data-out]').innerHTML = svg(720, 62, box(10, 8, 220, 44, t, cls) + note(244, 28, cls === 'g' ? 'removes a condition: safe' : cls === 'a' ? 'safe only if used correctly' : 'does not fix the cause', 'start') + note(244, 46, 'what the game shows below', 'start'), 'The chosen strategy')
      + `<p class="wgcap"><b>How it works:</b> ${how}</p><p class="wgcap"><b>In the game:</b> ${game}</p>`;
  };
  el.addEventListener('change', draw); draw();
}

// Widget 5: starvation by polling. Single core, game ticks of 1 ms, idle task at priority 0.
function starve(el) {
  el.innerHTML = frame('A TASK THAT POLLS A LOCK IN A LOOP', `<div class="wgrow">${sl('p', 'poller priority (holder is 1)', 1, 3, 2)} ${sl('d', 'delay between polls', 0, 20, 0)} ${sl('w', 'watchdog timeout', 200, 1200, 600, 100)}</div><div data-out></div>`);
  const draw = () => {
    const P = val(el, 'p', ''), D = val(el, 'd'), W = val(el, 'w');
    const duty = 1 / (1 + D);                    // the poll costs about 1 ms of CPU
    const pollerShare = P > 1 ? duty : Math.min(duty, 0.5);  // same priority: time slicing gives the holder about half
    const holderShare = P > 1 ? 1 - duty : Math.max(0, 1 - pollerShare);   // the holder always has work to do
    const idle = D === 0 ? 0 : Math.max(0, 1 - pollerShare - holderShare);
    const fires = D === 0;
    let ch = '';
    const row = (y, n, share, cls) => note(110, y + 14, n, 'end') + bar(120, y, 560, 'd', 20) + bar(120, y, 560 * share, cls, 20) + note(688, y + 14, Math.round(share * 100) + '%', 'start');
    ch += row(10, 'poller (prio ' + P + ')', pollerShare, 'r') + row(40, 'holder (prio 1)', Math.max(0, holderShare), 'c') + row(70, 'idle (prio 0)', fires ? 0 : idle, 'g');
    const msg = fires
      ? `<span class="bad">task_wdt fires after ${W} ms.</span> A poll with no delay never blocks, so the poller is always Ready. ${P > 1 ? 'It is above the holder, so the holder never runs and never gives the lock: the wait never ends.' : 'It shares time with the holder, but the idle task, one level below, never runs.'} The idle task is what feeds the watchdog, so the board reports the starvation, not the lock.`
      : `<span class="good">The poller sleeps ${D} ms between polls</span>, so the holder and the idle task both get the CPU. ${P > 1 ? 'The holder finishes and gives the lock, and the poller gets it on its next poll.' : 'Equal priority; both make progress.'} A blocking take (<code>portMAX_DELAY</code> or a timeout) is better still: no polls, no wasted CPU, and the kernel wakes the task at the moment the lock is given.`;
    el.querySelector('[data-out]').innerHTML = svg(720, 104, ch, 'CPU share of poller, holder and idle task') + `<p class="wgcap">${msg}</p>`;
  };
  el.addEventListener('input', draw); draw();
}

// Widget 6: read the log line
function whoholds(el) {
  const LOGS = [
    ['Deadlock: arm waits for cam_mtx, held by focus; focus waits for arm_mtx, held by arm.', { arm: ['arm_mtx', 'cam_mtx'], focus: ['cam_mtx', 'arm_mtx'] }],
    ['Deadlock: arm waits for arm_mtx, which it already holds itself.', { arm: ['arm_mtx', 'arm_mtx'], focus: ['', ''] }],
  ];
  const ops = ['(nothing)', 'arm_mtx', 'cam_mtx'];
  const sel = (id) => `<select data-${id}>${ops.map(o => `<option>${o}</option>`).join('')}</select>`;
  el.innerHTML = frame('WHO HOLDS WHAT: FILL IN THE TABLE FROM THE LOG', `<div class="wgrow"><label>log line <select data-l><option value="0">line A</option><option value="1">line B</option></select></label></div><p class="wgcap" data-log></p>
    <div class="wgrow"><span>arm holds</span>${sel('ah')} <span>arm waits for</span>${sel('aw')}</div><div class="wgrow"><span>focus holds</span>${sel('fh')} <span>focus waits for</span>${sel('fw')}</div><div data-out></div>`);
  const draw = () => {
    const i = +el.querySelector('[data-l]').value, [txt, ans] = LOGS[i];
    el.querySelector('[data-log]').innerHTML = `<code>${txt}</code>`;
    const g = k => el.querySelector(`[data-${k}]`).value, n = v => v === '(nothing)' ? '' : v;
    const mine = { arm: [n(g('ah')), n(g('aw'))], focus: [n(g('fh')), n(g('fw'))] };
    const ok = ['arm', 'focus'].every(t => mine[t][0] === ans[t][0] && mine[t][1] === ans[t][1]);
    const a = mine.arm, f = mine.focus;
    const ring = a[0] && a[1] && f[0] && f[1] && a[1] === f[0] && f[1] === a[0];
    el.querySelector('[data-out]').innerHTML = svg(720, 70, box(20, 10, 130, 40, 'arm', ok ? 'g' : 'd') + arrow(150, 30, 300, 30, 'waits for ' + (a[1] || '?'), 0, -6) + box(300, 10, 130, 40, 'held by ' + (a[1] ? (f[0] === a[1] ? 'focus' : a[0] === a[1] ? 'arm' : '?') : '?'), 'c') + note(450, 34, ring ? 'ring closed: deadlock' : '', 'start'), 'Wait-for chain')
      + `<p class="wgcap">${ok ? '<span class="good">Matches the log.</span>' : 'Does not match the log line yet.'} ${ring ? 'arm waits for what focus holds and focus waits for what arm holds: a ring of two.' : i === 1 ? 'The task waits for a lock it holds itself: a non-recursive mutex taken twice. There is no second task, so there is no ring to draw.' : ''} The words "held by" name the owner; follow them from task to task until you are back at the first.</p>`;
  };
  el.addEventListener('change', draw); draw();
}

export const widgets = { twodoors, fourconds, lockorder, ways, starve, whoholds };

/* ================= diagrams ================= */

// 1a. Wait-for graph
const waitDia = svg(720, 200, (() => {
  return box(20, 76, 150, 46, 'arm_mtx|mutex', 'a') + box(550, 76, 150, 46, 'cam_mtx|mutex', 'c')
    + box(285, 12, 150, 46, 'task arm|priority 2', 'g') + box(285, 140, 150, 46, 'task focus|priority 2', 'g')
    + arrow(285, 30, 150, 76, 'holds', -8, -8) + arrow(435, 30, 570, 76, 'waits for', 8, -8)
    + arrow(435, 164, 570, 122, 'holds', 8, 16) + arrow(285, 164, 150, 122, 'waits for', -8, 16)
    + note(360, 108, 'a ring: nobody can move', 'middle');
})(), 'Wait-for graph: arm holds arm_mtx and waits for cam_mtx, focus holds cam_mtx and waits for arm_mtx');

// 1b. The story in time
const storyDia = svg(720, 150, (() => {
  const X = t => 70 + t * 0.62; let s = note(64, 40, 'arm', 'end') + note(64, 96, 'focus', 'end');
  s += bar(X(640), 28, X(50), 'run') + bar(X(720), 84, X(43), 'run') + bar(X(832), 28, X(14), 'c') + bar(X(846), 28, X(154), 'blko') + bar(X(826), 84, X(20), 'g') + bar(X(846), 84, X(154), 'blko');
  s += note(X(665), 22, 'session 1: photo at 690', 'middle') + note(X(740), 78, 'check at 763', 'middle') + note(X(930), 22, 'blocked from 846 ms', 'middle');
  s += axis(70, 706, 124) + [0, 200, 400, 600, 800, 1000].map(t => note(X(t), 142, t, 'middle')).join('');
  return s;
})(), 'Chart of the two sessions: the first works, the second ends in a flat blocked row');

// 2. Four conditions
const condDia = svg(720, 100, (() => {
  const T = [['Mutual|exclusion', 'one owner at a time', 'a'], ['Hold|and wait', 'keeps lock 1, asks lock 2', 'c'], ['No|preemption', 'only the owner can give', 'g'], ['Circular|wait', 'A needs B, B needs A', 'r']];
  return T.map(([t, s, cls], i) => box(10 + i * 178, 10, 166, 50, t, cls) + note(93 + i * 178, 80, s, 'middle')).join('');
})(), 'The four conditions for a deadlock, all needed together');

// 3. Lock ladder
const ladderDia = svg(720, 190, (() => {
  // example lock names, not the rover's: the reader applies the rule to arm_mtx and cam_mtx
  let s = box(280, 10, 160, 34, '1. i2c_mtx', 'a') + arrow(360, 44, 360, 70) + note(372, 62, 'then', 'start') + box(280, 72, 160, 34, '2. flash_mtx', 'c') + arrow(360, 106, 360, 130) + box(280, 132, 160, 34, 'work with both', 'g');
  s += box(20, 40, 200, 34, 'task A: 1, then 2', 'g') + box(20, 90, 200, 34, 'task B: 1, then 2', 'g') + box(500, 40, 200, 34, 'any new task: 1, then 2', 'g');
  s += note(500, 96, 'a task that needs only one', 'start') + note(500, 112, 'lock takes just that lock and', 'start') + note(500, 128, 'does not climb back', 'start');
  return s;
})(), 'Example locks ranked top to bottom: every task takes them in rank order');

// 4. Strategy comparison
const wayDia = svg(720, 128, (() => {
  const T = [['one lock order', 'no ring possible', 'g'], ['release first', 'no hold and wait', 'g'], ['one big lock', 'no second lock', 'g'], ['timeout + back-off', 'detects, then recovers', 'a']];
  return T.map(([t, s, cls], i) => box(10 + i * 178, 10, 166, 40, t, cls) + note(93 + i * 178, 70, s, 'middle')).join('') + note(360, 108, 'a timeout without a release only moves the hang', 'middle');
})(), 'Four ways to prevent or leave a deadlock');

// 5. Starvation
const starveDia = svg(720, 170, (() => {
  return box(20, 12, 220, 44, 'poller, priority 2|while (take(m, 0) != pdTRUE) { }', 'r') + box(20, 66, 220, 44, 'holder, priority 1|has the lock, never runs', 'c') + box(20, 120, 220, 44, 'IDLE, priority 0|never runs: no WDT feed', 'd')
    + arrow(240, 34, 330, 34, 'always Ready') + box(330, 12, 180, 44, 'scheduler|picks the highest|Ready task', 'a') + arrow(510, 34, 580, 34) + box(580, 12, 120, 44, 'CPU', 'g')
    + note(340, 100, 'holder and idle stay Ready for ever,', 'start') + note(340, 118, 'the poller never blocks, so', 'start') + note(340, 136, 'the lock is never given.', 'start');
})(), 'A polling task above the lock holder starves the holder and the idle task');

// 6. Chart view
const chartDia = svg(720, 170, (() => {
  const X = t => 110 + t * 0.58; let s = '';
  [['uplink', 0], ['spectro', 1], ['arm', 2], ['focus', 3]].forEach(([n, i]) => { s += note(100, 30 + i * 32, n, 'end'); });
  s += bar(X(0), 20, X(1000), 'd', 14) + bar(X(100), 20, X(8), 'c', 14) + bar(X(693), 20, X(8), 'c', 14);
  s += bar(X(0), 52, X(1000), 'd', 14) + [100, 250, 450, 700, 900].map(t => bar(X(t), 52, X(14), 'c', 14)).join('');
  s += bar(X(640), 84, X(18), 'run', 14) + bar(X(846), 84, X(154), 'blko', 14) + bar(X(720), 116, X(24), 'run', 14) + bar(X(846), 116, X(154), 'blko', 14);
  s += note(X(1000), 80, 'flat red: blocked on a mutex', 'end') + note(X(920), 148, '154 ms and counting', 'middle');
  return s;
})(), 'Chart: other rows keep working, arm and focus show flat blocked rows');

/* ================= theory ================= */

export const realCode = `// main/rover_main.c   (ESP-IDF v5.x)   stage 11: stage 10 plus a photo session that needs two locks
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include "esp_log.h"
#include "rover.h"   // prototypes for the rover helpers: position_arm, photograph, calibrate_camera, check_focus, ... (not shown)

#define PRIO_PHOTO   2          // arm and focus
static const char *TAG = "rover";

static SemaphoreHandle_t arm_mtx;   // protects the arm driver
static SemaphoreHandle_t cam_mtx;   // protects the camera driver

// LOCK ORDER (one rule for the whole project): arm_mtx first, then cam_mtx. Release in the reverse order.
// Any new task that needs both must follow it.

static void arm_task(void *arg)
{
    vTaskDelay(pdMS_TO_TICKS(640));                       // wait for the system to settle
    for (int session = 0; session < 2; session++) {
        xSemaphoreTake(arm_mtx, portMAX_DELAY);           // lock 1
        position_arm();                                   // needs arm_mtx; 1 ms CPU, 12 ms wait
        xSemaphoreTake(cam_mtx, portMAX_DELAY);           // lock 2
        photograph();                                     // needs both; 2 ms CPU, 30 ms wait
        xSemaphoreGive(cam_mtx);
        xSemaphoreGive(arm_mtx);
        if (session == 0) vTaskDelay(pdMS_TO_TICKS(140));
    }
    vTaskDelay(portMAX_DELAY);                            // very long finite delay (about 497 days at 100 Hz), not an infinite block; the game treats it as park for ever; real code would end with vTaskDelete(NULL)
}

static void focus_task(void *arg)
{
    vTaskDelay(pdMS_TO_TICKS(720));
    for (int session = 0; session < 2; session++) {
        // Stage 11 start code took cam_mtx first, then arm_mtx, which deadlocks with arm_task. Fixed: same order as arm_task.
        xSemaphoreTake(arm_mtx, portMAX_DELAY);
        xSemaphoreTake(cam_mtx, portMAX_DELAY);
        calibrate_camera();                               // needs cam_mtx; 1 ms CPU, 20 ms wait
        check_focus();                                    // needs both; 1 ms CPU, 15 ms wait
        xSemaphoreGive(cam_mtx);
        xSemaphoreGive(arm_mtx);
        if (session == 0) vTaskDelay(pdMS_TO_TICKS(60));
    }
    vTaskDelay(portMAX_DELAY);
}

void app_main(void)
{
    // ... all stage 1 to 10 tasks, queues, timers and the event group, unchanged ...
    arm_mtx = xSemaphoreCreateMutex();                    // 96 bytes each, plain (non-recursive) mutex with priority inheritance
    cam_mtx = xSemaphoreCreateMutex();
    configASSERT(arm_mtx && cam_mtx);
    BaseType_t ok_arm = xTaskCreate(arm_task,   "arm",   1792, NULL, PRIO_PHOTO, NULL);   // game stack sizes
    BaseType_t ok_focus = xTaskCreate(focus_task, "focus", 1536, NULL, PRIO_PHOTO, NULL);
    configASSERT(ok_arm == pdPASS && ok_focus == pdPASS);  // fails with errCOULD_NOT_ALLOCATE_REQUIRED_MEMORY
    ESP_LOGI(TAG, "photo session armed");
}

// Build notes
//   idf.py build flash monitor
//   FreeRTOS has no deadlock detector. To find a hang on hardware:
//     - give every blocking take a finite timeout in debug builds and log the failure:
//         if (xSemaphoreTake(cam_mtx, pdMS_TO_TICKS(500)) != pdTRUE) { ESP_LOGE(TAG, "cam_mtx wait > 500 ms"); }
//     - idf.py menuconfig  Component config > FreeRTOS > Kernel > configUSE_TRACE_FACILITY (CONFIG_FREERTOS_USE_TRACE_FACILITY)
//       and CONFIG_FREERTOS_USE_STATS_FORMATTING_FUNCTIONS, then call vTaskList() from a console command to list task states
//     - register tasks with the task watchdog (esp_task_wdt_add) so a task that waits for ever is reported
//   Tick rate: the game runs at 1000 Hz, ESP-IDF defaults to CONFIG_FREERTOS_HZ=100, so one tick is 10 ms. pdMS_TO_TICKS rounds
//   down to whole ticks, so values that are not multiples of 10 ms (such as 13 or 21 ms) change. The delays in this file
//   (60, 140, 640, 720 ms) happen to be exact multiples. Also, the real arm and exposure times are far longer than in the game.`;

export const manual = [
  ['1. Two keys, two doors', `<p>Each task here is correct on its own. <code>arm</code> takes <code>arm_mtx</code>, moves the arm, takes <code>cam_mtx</code> and photographs. <code>focus</code> takes <code>cam_mtx</code>, calibrates, takes <code>arm_mtx</code> and checks the focus. Both need both locks. The first session worked (photo at 690 ms, focus check at 763 ms). The second session starts at about 830 ms with the tasks 6 ms apart: arm holds <code>arm_mtx</code>, focus holds <code>cam_mtx</code>, each asks for the other one.</p>
   ${waitDia}
   <p class="cap">A wait-for graph. A "holds" arrow points from a task to a lock it owns, a "waits for" arrow points to a lock it is blocked on. A ring in the graph is a deadlock.</p>
   <p>What happens in the kernel: <code>xSemaphoreTake(m, portMAX_DELAY)</code> on a held mutex puts the task on the mutex's wait list and moves it to the Blocked state with an infinite timeout. The only thing that wakes it is <code>xSemaphoreGive()</code> by the owner. The owner is itself on a wait list. Nothing will ever run that code, so the wake-up never comes. The tasks use no CPU, so the rest of the system keeps running and a quick test can miss it.</p>
   ${storyDia}
   <p>The game logs "Deadlock: arm waits for cam_mtx, held by focus; focus waits for arm_mtx, held by arm." at the end of the run. The bug depends on timing: the first session did not overlap, the second did. A changed delay anywhere in the system moves the overlap and the bug appears or disappears. Move the slider to see where the window is.</p>
   <div data-w="twodoors"></div>
   <p>Real time note: the game uses 1 ms ticks (as if <code>CONFIG_FREERTOS_HZ=1000</code>; the ESP-IDF default is 100) and short arm moves and exposures so that the test fits in 1 s. On a real rover they take much longer, and so the overlap window is wider.</p>`],

  ['2. Four conditions', `<p>A deadlock needs four things at the same time (the Coffman conditions). Take away any one and it cannot happen.</p>
   ${condDia}
   <ul><li><b>Mutual exclusion:</b> a mutex has one owner. That is its job, so you keep it.</li>
   <li><b>Hold and wait:</b> a task keeps lock 1 while it blocks on lock 2. The kernel does not stop you; it cannot know your intent.</li>
   <li><b>No preemption:</b> the kernel never takes a mutex from a task. Priority inheritance (stage 12) temporarily raises the owner's priority, but the lock stays with it.</li>
   <li><b>Circular wait:</b> task A waits for B's lock and B waits for A's. This is the one you control: it depends only on the order in which your code takes locks.</li></ul>
   <p>Two rules follow from the kernel's behaviour. A non-recursive mutex taken twice by the same task blocks that task on itself (the game prints "which it already holds itself": a ring of one). <code>xSemaphoreCreateRecursiveMutex()</code> with <code>xSemaphoreTakeRecursive()</code> allows nesting by the owner, and every take needs a matching give. FreeRTOS makes no attempt to detect a deadlock, and a hung task is not a fault to it.</p>
   <div data-w="fourconds"></div>`],

  ['3. One lock order', `<p>The cheapest fix is a rule: rank the locks, and every task takes them in rank order. A task that needs only one lock takes only that one. If all tasks climb down the ladder in the same direction, a ring cannot form, because a ring needs one task to go up where another went down.</p>
   ${ladderDia}
   <p>Worked example with other locks: a project has <code>i2c_mtx</code> (rank 1) and <code>flash_mtx</code> (rank 2). The task that logs sensor data takes <code>i2c_mtx</code>, then <code>flash_mtx</code>. A task that wrote <code>flash_mtx</code> first would have to be rewritten to take <code>i2c_mtx</code> first, then <code>flash_mtx</code>, and only then do its work. The release order does not matter for safety (the game confirms this: swapping only the gives still deadlocks, because the takes are still opposed). What matters is that all tasks agree.</p>
   <p><b>Apply it to arm and focus: which task will you change, and why?</b> Write the take order of each task first, then compare them. The game accepts either choice; the reason is yours to give.</p>
   <ul><li><b>Write the order down</b> where the locks are declared, as in the example file. An unwritten rule is broken by the next person.</li>
   <li><b>Priority and stack do not fix it.</b> Raising the priority of either task only changes who is first to hold a lock. Both are still waiting. A bigger stack does nothing.</li>
   <li><b>Hidden locks.</b> A function you call may take a lock itself (a driver, a logging call, a callback). The order must include them.</li></ul>
   <div data-w="lockorder"></div>`],

  ['4. Other ways out', `<p>A fixed order is not always possible: the locks may be taken in code you do not own, or in an order that depends on data. Alternatives, each removing a different condition:</p>
   ${wayDia}
   <ul><li><b>Release before acquiring</b> removes hold and wait. Finish with the first resource, give the lock, then take the next. The protected state can change in between, so re-read it.</li>
   <li><b>One coarse lock</b> for the whole job. Simple and safe, but tasks that could overlap are serialised, and a long job holds everyone else up.</li>
   <li><b>Take with a timeout</b>: <code>xSemaphoreTake(m, pdMS_TO_TICKS(30))</code> returns <code>pdFALSE</code> on timeout and the task goes on with the lock it already holds. Real code must then give that lock, wait a different time in each task, and try again; without the back-off, two tasks can retry in step (livelock). A timeout detects trouble; it does not prevent it.</li></ul>
   <p><b>Game difference:</b> when a take with a timeout expires, the simulated task restarts its code from the first line and keeps every lock it holds. Real FreeRTOS continues after the take call. The game therefore cannot model the retry loop, and a timeout is only ever the wrong answer "gives up but keeps the lock": the task asleep with the lock, the other task blocked behind it, and no deadlock line in the log.</p>
   <div data-w="ways"></div>`],

  ['5. Preview: starvation and livelock', `<p><b>Preview, not part of this mission.</b> A task can be stuck without waiting for a lock, and the symptom looks like a hang too. The usual cause is polling: <code>while (xSemaphoreTake(m, 0) != pdTRUE) { }</code>. A take with a zero timeout never blocks, so the loop never leaves the Ready state. Stage 14 returns to this with the task watchdog; the mission here is deadlock only.</p>
   ${starveDia}
   <p><b>Takeaway:</b> on one core a Ready task above the lock's owner means the owner never runs, so it never gives the lock. The fix is to block: take with <code>portMAX_DELAY</code> or a timeout, so the kernel wakes the task when the lock is given and no CPU is spent meanwhile.</p>
   <ul><li><b>Starvation</b> is a task that never gets the CPU because others always win. <b>Livelock</b> is tasks that keep running and retrying, in step, without progress. Neither has a "held by" line.</li>
   <li><b>The idle task</b> runs only when nothing else is Ready, one priority level below the poller and the holder. It never runs here, so it cannot free deleted tasks' memory or feed the task watchdog.</li>
   <li><b>At equal priority</b> time slicing gives each Ready task a turn (one tick by default), so the holder gets the CPU and the lock is given; the idle task is still starved.</li>
   <li><b>In the game</b> the watchdog fires after 600 ms with no idle time and the rover resets with <code>task_wdt</code>.</li>
   <li>A low-priority task holding a lock that a high-priority task needs is the priority inversion case, which stage 12 covers. It does not help against a deadlock ring.</li></ul>
   <div style="border:1px solid var(--cyan);padding:.5em .9em;margin:.8em 0"><p><b>Real ESP-IDF differs</b></p>
   <ul><li>The scenario assumes the poller and the owner share one core: <code>CONFIG_FREERTOS_UNICORE</code>, or both tasks pinned to one core with <code>xTaskCreatePinnedToCore</code>. <code>xTaskCreate</code> makes unpinned tasks, and ESP-IDF on ESP32 is dual-core by default, so the owner can run on the other core, give the lock, and no starvation or <code>task_wdt</code> occurs.</li>
   <li>Time slicing is a best-effort round robin per core.</li>
   <li>The task watchdog default is 5 s (<code>CONFIG_ESP_TASK_WDT_TIMEOUT_S</code>), not 600 ms. It can be set to panic (<code>CONFIG_ESP_TASK_WDT_PANIC</code>) or only print.</li></ul></div>
   <div data-w="starve"></div>`],

  ['6. Finding it', `<p>On the chart a deadlock looks like two rows, <code>arm</code> and <code>focus</code>, flat red (blocked on a mutex) from 846 ms to the end of the run, while the others keep their normal pattern. Compare the length of a red bar with what the same task did in the healthy session: a healthy block ends in a few tens of ms.</p>
   ${chartDia}
   <p>On real hardware FreeRTOS gives no such report. These are the tools you have:</p>
   <ul><li><b>Take with a finite timeout in debug builds</b> and log it with <code>ESP_LOGE</code>, naming the task and the lock. It is the simplest, always-available detector.</li>
   <li><b>Task watchdog:</b> register a task with <code>esp_task_wdt_add(NULL)</code> and call <code>esp_task_wdt_reset()</code> where it makes progress. A task blocked for ever stops feeding it and the watchdog prints its name. It also reports the idle task if polling starves it.</li>
   <li><b>vTaskList() / vTaskGetInfo():</b> <code>vTaskList()</code> needs <code>CONFIG_FREERTOS_USE_TRACE_FACILITY</code> and <code>CONFIG_FREERTOS_USE_STATS_FORMATTING_FUNCTIONS</code>; <code>vTaskGetInfo()</code> needs only the trace facility. The state letter 'B' means Blocked (on a queue, mutex, semaphore or delay). It does not say what the task waits on.</li>
   <li><b>GDB / core dump:</b> halt, <code>info threads</code> (task list with the OpenOCD FreeRTOS support), backtrace each task; two tasks stopped in <code>xQueueSemaphoreTake</code> each holding the other's lock is the signature. To read a mutex's owner, call <code>xSemaphoreGetMutexHolder(cam_mtx)</code> (needs <code>INCLUDE_xSemaphoreGetMutexHolder</code>, enabled by ESP-IDF) from a debugger or console command; the internal field that stores it differs between kernel versions.</li>
   <li><b>Giving a mutex you do not hold:</b> the game stops with "assert failed: focus gave cam_mtx but does not hold it". Real FreeRTOS checks this only with <code>configASSERT</code> enabled, which ESP-IDF turns on by default.</li></ul>
   <p>Here the log line is the diagnosis. Read it as two sentences, "X waits for M, held by Y", and follow the "held by" names until you return to the first task. Practise on both log lines the game can print:</p>
   <div data-w="whoholds"></div>`],
];

export const quiz = [
  { q: 'The first photo session worked, the second one deadlocked, and no line of code changed in between. What is the most likely reason?', opts: ['The second session ran out of stack because it came later', 'The two tasks overlapped in time, so each took its first lock before the other asked for it', 'The mutexes were damaged by the first session and have to be recreated'], a: 1, why: 'The opposite order is always in the code but only bites when the two tasks hold their first lock at the same time. The first session was 80 ms apart, the second 6 ms apart.', wrong: ["Stack use does not grow with the time a task has been running, and a stack overflow would crash the task, not make it wait. Nothing in the two sessions changed what the tasks do.", null, "A mutex is a kernel object that nothing in the tasks' code can damage, and it needs no re-creation. The tasks block because of the order they take the locks in."] },
  { q: 'Which of the four conditions does a single, agreed lock order remove?', opts: ['Mutual exclusion, because only one lock is held at a time', 'Hold and wait, because tasks no longer keep a lock while waiting', 'Circular wait, because a ring needs two tasks that go through the locks in opposite directions'], a: 2, why: 'The tasks still hold a lock while waiting for another, and the locks are still exclusive. With one order nobody can wait for a lock held by someone who is waiting for you.', wrong: ["Mutual exclusion is what a mutex is for, and both tasks still need exclusive use. A lock order does not change it.", "Tasks still hold one lock while they wait for the next one. A lock order only decides in which sequence they ask.", null] },
  { q: 'arm takes A then B, focus takes B then A, and a third task takes A then B. How many tasks must change to remove the deadlock risk?', opts: ['All three, so that everyone takes the same lock first', 'One: focus, or alternatively both arm and the third task, so that all agree', 'None: the third task shows that two out of three already agree'], a: 1, why: 'The condition is that every task follows the same order. The minimum change is the one task that disagrees (focus). Counting votes does not help: the pair that disagrees can still deadlock.', wrong: ["The tasks that already take A first are fine. Making them all change is more than is needed.", null, "Counting votes does not remove the risk. The one task that disagrees can still pair with any other and form a ring."] },
  { q: 'In the game, a developer makes focus use xSemaphoreTake(arm_mtx, pdMS_TO_TICKS(30)) and just returns to its loop when it fails, keeping cam_mtx. What does the system do?', opts: ['The deadlock is gone because focus no longer waits for ever', 'arm stays blocked on cam_mtx, now held by a task that is asleep', 'Both tasks retry and finish a little later than before'], a: 1, why: 'A timeout only ends focus\'s wait. It still owns cam_mtx, so arm waits behind it. In the game focus restarts and sleeps, so the log may show no deadlock line; on real FreeRTOS focus continues running and keeps cam_mtx.', wrong: ["A timeout only ends the wait. The task goes on holding cam_mtx, so the lock it holds is still a problem.", null, "The timeout fails once and the task does not give back the lock it holds. Nothing makes arm's request succeed later."] },
  { q: 'On one core, a task at priority 2 waits for a lock held by a priority 1 task with while (xSemaphoreTake(m, 0) != pdTRUE) {}. Why does the rover reset with task_wdt?', opts: ['The poller never blocks, so the holder and the idle task never run and the idle task cannot feed the watchdog', 'A take with a zero timeout writes to the stack and causes an overflow', 'The poll takes the lock twice, which asserts'], a: 0, why: 'A Ready task of higher priority keeps the CPU. The holder cannot give the lock and the idle task below it is starved, so the watchdog fires. Use a blocking take.', wrong: [null, "A take with a zero timeout only checks the lock and returns. It does not use the stack or cause an overflow.", "Taking a lock that is held does not assert. The loop simply asks again and again, and each time it fails."] },
  { q: 'The log says "arm waits for cam_mtx, held by focus". What is the next question to ask?', opts: ['Which lock does focus wait for, and who holds that one?', 'Why does arm have a lower priority than focus?', 'How large is the stack of focus?'], a: 0, why: 'Follow the "held by" names. If the chain returns to arm, the two form a ring; if it ends at a task that is just slow or sleeping, the cause is a long hold or a missing give, not a ring.', wrong: [null, "Priorities do not decide who is waiting for whom. The log already names the holder, and it is the lock chain that shows a ring.", "The stack size does not explain a task that waits for a lock. A stack overflow would show as a different fault."] },
];
