// Field manual for stage 9 (ESP-IDF): software timers, the timer service task and the restartable timeout.
import { svg, box, arrow, note } from '../widgets.js';

const bar = (x, y, w, cls, h = 20) => `<rect class="bx ${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>`;
const axis = (x0, x1, y) => `<line class="ar" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" marker-end="url(#ah)"/>`;
const up = (x, y0, y1) => `<line class="ar" x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" marker-end="url(#ah)"/>`;
const bad = s => s.replace('class="at"', 'class="at" style="fill:#ff5d4d;font-weight:700"');

/* ================= diagrams ================= */

// 1. The start firmware: the antenna task sleeps and packets pile up behind it (times as measured in the game)
const sleepDia = svg(720, 200, (() => {
  const X = t => 110 + (t - 100) * 0.62; let s = note(102, 38, 'packets', 'end') + note(102, 94, 'antenna', 'end') + note(102, 140, 'packet 500', 'end') + note(102, 158, 'packet 580', 'end');
  [100, 420, 500, 580].forEach(t => { s += up(X(t), 14, 42); });
  // handled at 129, 430, 694, 957; each handling is followed by a 250 ms sleep and a stow
  [129, 430, 694, 957].forEach(h => { s += bar(X(h), 82, 3, 'c', 20); });
  [129, 430, 694].forEach(h => { s += bar(X(h + 3), 82, X(h + 253) - X(h + 3), 'blk'); s += note(X(h + 253), 118, 'stow', 'middle'); });
  s += note(X(241), 76, 'vTaskDelay(250): asleep', 'middle');
  s += bar(X(500), 130, X(694) - X(500), 'r', 12) + bar(X(580), 148, X(957) - X(580), 'r', 12);
  s += bad(note(110, 178, 'packet 500 waits 194 ms, packet 580 waits 377 ms', 'start'));
  s += axis(110, 712, 192);
  return s;
})(), 'An antenna task that sleeps cannot read the packets that arrive behind it');

// 2. What a timer is, one-shot and auto-reload
const timerDia = svg(720, 250, (() => {
  const X = t => 150 + t * 0.9; let s = '';
  s += box(10, 10, 118, 70, 'timer object|period 200 ms|reload: pdFALSE|callback: on_stow', 'a');
  s += note(150, 52, 'one-shot', 'start');
  s += bar(X(0), 22, X(200) - X(0), 'blk') + note(X(100), 16, 'active: counting 200 ms', 'middle') + `<line class="dash" x1="${X(200)}" y1="14" x2="${X(200)}" y2="70"/>` + box(X(200) + 4, 26, 102, 24, 'callback runs', 'g') + bar(X(200) + 114, 30, 250, 'd', 16) + note(X(200) + 114, 64, 'dormant: stays quiet', 'start') + note(X(200) + 114, 78, 'until you start it again', 'start');
  s += note(142, 122, 'auto-reload', 'end');
  [0, 200, 400].forEach(k => { s += bar(X(k), 114, X(200) - X(0), 'blk') + `<line class="dash" x1="${X(k + 200)}" y1="106" x2="${X(k + 200)}" y2="150"/>` + box(X(k + 200) - 36, 154, 72, 22, 'callback', 'g'); });
  s += note(X(100), 108, 'counts again', 'middle') + note(716, 102, '...forever, until xTimerStop()', 'end');
  s += axis(150, 700, 208) + [0, 200, 400, 600].map(t => note(X(t), 224, t + ' ms', 'middle')).join('') + note(700, 240, 'after xTimerStart()', 'end');
  return s;
})(), 'A one-shot timer expires once and goes dormant, an auto-reload timer restarts itself');

// 3. The restartable timeout
const resetDia = svg(720, 210, (() => {
  const X = t => 70 + (t - 400) * 1.5; let s = note(62, 38, 'packets', 'end') + note(62, 96, 'countdown', 'end');
  [420, 500, 580].forEach(t => { s += up(X(t), 14, 42); });
  s += bar(X(420), 84, X(500) - X(420), 'rdy', 16) + bar(X(500), 84, X(580) - X(500), 'rdy', 16) + bar(X(580), 84, X(780) - X(580), 'blk', 16);
  s += note(X(460), 78, 'reset', 'middle') + note(X(540), 78, 'reset', 'middle') + note(X(680), 78, '200 ms, nobody resets it', 'middle');
  s += `<line class="dash" x1="${X(780)}" y1="70" x2="${X(780)}" y2="130"/>` + box(X(780) - 60, 128, 120, 26, 'on_stow(): fold', 'g');
  s += bad(note(X(420), 124, 'the 200 ms never completes during the pass', 'start'));
  s += axis(70, 710, 180) + [400, 500, 600, 700, 800].map(t => note(X(t), 198, t, 'middle')).join('') + note(710, 198, 'ms', 'end');
  return s;
})(), 'Each packet restarts the 200 ms countdown, so the stow happens 200 ms after the last packet');

// 4. The timer service task and its command queue
const svcDia = svg(720, 250, (
  box(0, 14, 192, 40, 'task: xTimerReset()', 'c') + box(0, 70, 192, 40, 'ISR: xTimerResetFromISR()', 'd') + box(0, 126, 192, 40, 'task: xTimerStop()', 'c')
  + arrow(192, 34, 240, 80) + arrow(192, 90, 240, 90) + arrow(192, 146, 240, 100)
  + box(240, 62, 150, 56, 'timer command queue|10 commands by default', 'a')
  + arrow(390, 90, 490, 90, 'one command', 0, -26) + note(440, 78, 'at a time', 'middle')
  + box(490, 46, 220, 88, 'timer service task "Tmr Svc"|priority 1, 2048 stack by default|keeps the list of active timers', 'g')
  + arrow(600, 134, 520, 180) + arrow(600, 134, 660, 180)
  + box(430, 180, 150, 44, 'on_stow(t)|runs here', 'c') + box(600, 180, 110, 44, 'other_cb(t)|runs here too', 'c')
  + note(10, 200, 'the calling task never runs the callback and never', 'start') + note(10, 216, 'waits for the timer: it only posts a command', 'start')
), 'Timer API calls post commands to a queue, one service task runs every callback');

// 5. Short callback versus long callback (one band per row)
const cbDia = svg(720, 236, (() => {
  const X = t => 130 + t * 4.4; let s = note(122, 28, 'long callback', 'end') + note(122, 68, 'next timer', 'end') + note(122, 116, 'short callback', 'end') + note(122, 156, 'next timer', 'end') + note(122, 190, 'worker task', 'end');
  s += bar(X(0), 14, X(40) - X(0), 'r', 20) + note(X(40) + 8, 28, 'read sensor: 40 ms, inside the callback', 'start');
  s += `<line class="dash" x1="${X(5)}" y1="38" x2="${X(5)}" y2="74"/>` + bar(X(40), 54, X(46) - X(40), 'd', 20) + bad(note(X(46) + 8, 68, 'due at 5 ms, runs at 40 ms', 'start'));
  s += bar(X(0), 102, 12, 'g', 20) + note(X(0) + 20, 116, 'give: one notification, returns at once', 'start');
  s += `<line class="dash" x1="${X(5)}" y1="126" x2="${X(5)}" y2="162"/>` + bar(X(5), 142, 12, 'g', 20) + note(X(5) + 20, 156, 'runs at 5 ms, on time', 'start');
  s += bar(X(2), 176, X(42) - X(2), 'c', 20) + note(X(42) + 8, 190, 'read sensor: 40 ms, in a task you size', 'start');
  s += axis(130, 400, 212) + [0, 20, 40, 60].map(t => note(X(t), 228, t, 'middle')).join('') + note(412, 228, 'ms', 'start');
  return s;
})(), 'A long callback makes the next timer late; a short one hands the work to a task');

// 6. Timer or task?
const treeDia = svg(720, 190, (
  box(220, 6, 280, 34, 'what is it?', 'a')
  + arrow(290, 40, 110, 84) + arrow(430, 40, 610, 84)
  + box(10, 84, 200, 44, 'short and never blocks|(flag, GPIO, reset, notify)', 'c') + box(510, 84, 200, 44, 'blocks, loops or takes|more than a few ms', 'c')
  + arrow(110, 128, 60, 150) + arrow(110, 128, 170, 150)
  + box(0, 150, 120, 36, 'one-shot timer', 'g') + box(126, 150, 140, 36, 'auto-reload timer', 'g') + box(520, 150, 180, 36, 'task + delay or until', 'g')
), 'Short non-blocking work fits a timer callback, anything else needs a task');

// 7. Priority ladder
const prioDia = svg(720, 210, (
  box(10, 10, 260, 34, '4  beacon, heart', 'd') + box(10, 50, 260, 34, '3  motor (11 ms limit)', 'd') + box(10, 90, 260, 34, '2  telemetry, science, imu, thermo', 'd') + box(10, 130, 260, 34, '1  camera, spectro, ..., antenna', 'g')
  + arrow(270, 67, 320, 67) + bad(note(330, 62, 'antenna at 3: preempts the motor, gap 12 ms (limit 11)', 'start'))
  + arrow(270, 107, 320, 107) + bad(note(330, 102, 'antenna at 2: telemetry gap 105 ms, exactly the limit', 'start'))
  + arrow(270, 147, 320, 147) + note(330, 142, 'antenna at 1: handle_packet waits 10 to 29 ms, goal is 60', 'start')
  + note(10, 190, 'the rover is about 98% loaded, so any task that moves up takes its CPU from someone with a deadline', 'start')
), 'Priority 1 is the only level that keeps every earlier deadline');

/* ================= widgets ================= */

const frame = (title, body) => `<div class="wg"><div class="wgh">INTERACTIVE · ${title}</div>${body}</div>`;
const sl = (id, label, min, max, v, step = 1) => `<label>${label} <input type="range" data-${id} min="${min}" max="${max}" step="${step}" value="${v}"> <b data-${id}v></b></label>`;
const val = (el, id, unit = ' ms') => { const v = +el.querySelector('[data-' + id + ']').value; el.querySelector('[data-' + id + 'v]').textContent = v + unit; return v; };
const PK = [100, 420, 500, 580];

// Widget 1: the antenna task that sleeps (idealised single task, no other load)
function antennawait(el) {
  el.innerHTML = frame('A TASK THAT SLEEPS AFTER EVERY PACKET (ONE TASK, NO OTHER LOAD)', `<div class="wgrow">${sl('s', 'sleep before stowing', 0, 300, 250)}</div><div data-out></div>`);
  const draw = () => {
    const S = val(el, 's'); let t = 0; const waits = [], stows = [];
    const X = x => 90 + x * 0.5; let ch = note(84, 34, 'packets', 'end') + note(84, 80, 'antenna', 'end');
    PK.forEach(p => {
      const st = Math.max(t, p); waits.push(st - p); t = st + 3; ch += up(X(p), 12, 40) + bar(X(st), 68, Math.max(2, 3 * 0.5), 'c', 18);
      if (st > p) ch += bar(X(p), 90, X(st) - X(p), 'r', 8);
      if (S > 0) ch += bar(X(t), 68, S * 0.5, 'blk', 18);
      t += S; stows.push(t); ch += `<line class="dash" x1="${X(t)}" y1="60" x2="${X(t)}" y2="100"/>`;
    });
    ch += axis(90, 710, 112) + [0, 200, 400, 600, 800, 1000, 1200].map(x => note(X(x), 126, x, 'middle')).join('') + note(84, 126, 'ms', 'end');
    const mid = stows.filter(s => PK.some(p => p > s && p - s < 150)).length, okW = waits.every(w => w <= 60);
    el.querySelector('[data-out]').innerHTML = svg(720, 132, ch, 'Packet waits and stows for a sleeping antenna task')
      + `<p class="wgcap">Waits per packet: <b>${waits.join(', ')} ms</b> (goal: each 60 ms or less). Mast folds: <b>${stows.length}</b> (goal: 2), of them <b>${mid}</b> in the middle of a pass. `
      + (okW && stows.length === 2 ? 'This passes.' : `<span class="bad">${okW ? 'The waits are fine, but the mast folds in the middle of the pass.' : 'The task is asleep when a packet arrives.'}</span> Try every value: a short sleep fixes the waits and folds the mast too early, a long sleep does the opposite. One task cannot do both jobs.`) + '</p>';
  };
  el.addEventListener('input', draw); draw();
}

// Widget 2: the restartable timeout, with the game's packet times (lone packet at 100, then a pass starting at 420)
function timeoutlab(el) {
  el.innerHTML = frame('A TIMER AS A RESTARTABLE TIMEOUT', `<div class="wgrow">${sl('p', 'timer period', 20, 400, 200, 10)} ${sl('n', 'packets in the pass', 1, 5, 3, 1)} ${sl('g', 'spacing in the pass', 20, 200, 80, 10)}
    <label>the antenna task calls <select data-m><option value="reset">xTimerReset() on every packet (one-shot)</option><option value="auto">xTimerReset() on every packet (auto-reload)</option><option value="dormant">xTimerStart() only if the timer is not active</option></select></label></div><div data-out></div>`);
  const draw = () => {
    const P = val(el, 'p'), n = val(el, 'n', ''), g = val(el, 'g'), m = el.querySelector('[data-m]').value, W = 1200;
    const pk = [100, ...Array.from({ length: n }, (_, i) => 420 + i * g)].filter(t => t < W - 50);
    let exp = null, out = false, since = 0; const stows = [], segs = []; let unfolds = 0, folds = 0;
    for (let t = 0; t < W; t++) {
      if (pk.includes(t)) {
        if (!out) { out = true; unfolds++; since = t; }
        if (m === 'dormant') { if (exp === null) exp = t + P; } else exp = t + P;
      }
      if (exp === t) { stows.push(t); if (out) { out = false; folds++; segs.push([since, t]); } exp = m === 'auto' ? t + P : null; }
    }
    if (out) segs.push([since, W]);
    const last = pk.filter((t, i) => i === pk.length - 1 || pk[i + 1] - t > 150), lat = last.map(l => { const s = stows.find(x => x >= l); return s === undefined ? -1 : s - l; });
    const okPass = stows.length === last.length && lat.every(x => x >= 180 && x <= 250) && unfolds === last.length;
    const X = x => 90 + x * 0.5; let ch = note(84, 34, 'packets', 'end') + note(84, 80, 'mast out', 'end') + note(84, 118, 'callback', 'end');
    pk.forEach(p => { ch += up(X(p), 12, 40); });
    segs.forEach(([a, b]) => { ch += bar(X(a), 68, Math.max(2, X(b) - X(a)), 'g', 18); });
    stows.forEach(s => { ch += `<line class="dash" x1="${X(s)}" y1="60" x2="${X(s)}" y2="124"/>` + bar(X(s) - 2, 106, 5, 'a', 16); });
    ch += axis(90, 710, 138) + [0, 200, 400, 600, 800, 1000].map(x => note(X(x), 152, x, 'middle')).join('') + note(84, 152, 'ms', 'end');
    el.querySelector('[data-out]').innerHTML = svg(720, 160, ch, 'Packets, mast state and callbacks for the chosen timer settings')
      + `<p class="wgcap">${last.length} pass${last.length === 1 ? '' : 'es'}. Callback runs: <b>${stows.length}</b> at ${stows.join(', ') || 'never'}. Stow delay after the last packet of each pass: <b>${lat.join(', ')} ms</b> (goal 180 to 250). Mast unfolded <b>${unfolds}</b> times and folded <b>${folds}</b> times. `
      + (okPass ? 'This is the stage solution.' : `<span class="bad">${stows.length === 0 ? 'The callback never runs: the mast stays out.' : stows.length > last.length && m === 'auto' ? 'An auto-reload timer keeps firing: stow runs again with nothing to stow.' : unfolds > last.length ? 'The period is shorter than the gap between packets, so the mast folds in the middle of the pass.' : m === 'dormant' ? 'Without a reset the countdown started at the first packet and ran out during the pass.' : 'The stow is outside 180 to 250 ms after the last packet.'}</span>`)
      + ' The game adds 2 to 3 ms before the callback runs.</p>';
  };
  el.addEventListener('input', draw); el.addEventListener('change', draw); draw();
}

// Widget 3: one shared service task, a slow callback delays the next one (the game's simulator does not model this)
function svcdelay(el) {
  el.innerHTML = frame('ONE SERVICE TASK RUNS EVERY CALLBACK (DIAGRAM OF THE REAL KERNEL, NOT OF THE GAME)', `<div class="wgrow">${sl('a', 'callback A takes', 0, 100, 40)}<label><input type="checkbox" data-w> A only gives a notification, a worker task does the 40 ms</label></div><div data-out></div>`);
  const draw = () => {
    const a = val(el, 'a'), w = el.querySelector('[data-w]').checked, run = w ? 0.4 : a, X = t => 130 + t * 4.6, bS = Math.max(run, 1) * 4.6;
    const bStart = Math.max(5, 100 * 0 + run), late = Math.max(0, run - 5);
    let ch = note(122, 34, 'service task', 'end') + note(122, 82, 'timer B due', 'end') + note(122, 130, 'worker task', 'end');
    ch += bar(X(0), 22, Math.max(2, bS), w ? 'g' : 'r', 20) + note(X(0), 16, 'A', 'start') + bar(X(bStart), 22, 5 * 4.6, 'c', 20) + note(X(bStart), 16, 'B', 'start');
    ch += up(X(5), 70, 90) + `<line class="dash" x1="${X(5)}" y1="40" x2="${X(5)}" y2="90"/>`;
    if (w) ch += bar(X(1), 118, a * 4.6, 'c', 20) + note(X(1), 112, 'work at the priority you choose', 'start');
    ch += axis(130, 700, 160) + [0, 20, 40, 60, 80, 100].map(t => note(X(t), 174, t, 'middle')).join('') + note(700, 192, 'ms from the two expiries', 'end');
    el.querySelector('[data-out]').innerHTML = svg(720, 198, ch, 'Callback B waits for callback A in the single service task')
      + `<p class="wgcap">Timer B expired 5 ms after timer A. Its callback started <b>${late} ms late</b>. `
      + (late ? '<span class="bad">Every callback shares one task, so one slow callback delays every timer behind it.</span>' : (w ? 'The callback only posts a notification and returns at once. The slow part runs in a normal task with its own priority.' : 'Short enough: B is on time.'))
      + ' In this game each callback is its own unit, so the chart cannot show this delay; the real kernel behaves as drawn.</p>';
  };
  el.addEventListener('input', draw); el.addEventListener('change', draw); draw();
}

// Widget 4: pick the fix for a callback mistake
function cbfix(el) {
  const Q = [
    ['The callback calls vTaskDelay(pdMS_TO_TICKS(10)) before stowing. The kernel stops with "vTaskDelay() tried to block inside a timer callback".', ['Use a longer delay', 'Remove the delay and shorten the timer period by 10 ms', 'Give the callback its own task priority'], 1, 'The service task must never wait, and the callback has no priority of its own. Let the timer do the waiting: its period already is the delay.'],
    ['The callback calls transmit(), a driver call that blocks until the radio is done.', ['Wake a task from the callback and let the task call transmit()', 'Pass a short timeout to transmit()', 'Raise the timer service task priority'], 0, 'A blocking driver call in the service task stops every timer. Notify a task and do the slow call there. A timeout only shortens the damage.'],
    ['The callback does 40 ms of path planning. Another timer then fires late and, in the game, task_wdt trips.', ['Split the 40 ms in four callbacks that run back to back', 'Move the planning to a task, keep the callback to a notification', 'Lower the timer period'], 1, 'The service task is a shared, short-job task. Long work belongs in a task you can schedule and size.'],
    ['The packet ISR calls xTimerReset(stow_tmr, 0) and the kernel stops: "was called inside an ISR".', ['Call xTimerReset() with a longer wait', 'Let the ISR only queue the packet, the task resets the timer', 'Raise the priority of the interrupt'], 1, 'The stage uses the queue: the ISR stays one line long and the task owns the timer. A wait time is never allowed in an ISR, and the interrupt priority does not change which API calls are legal there. xTimerResetFromISR() would also work, but it is not offered here.'],
  ];
  el.innerHTML = frame('WHICH FIX? FOUR CALLBACK MISTAKES', Q.map(([t, o], i) => `<p class="wgcap">${i + 1}. ${t} <select data-q="${i}"><option value="">choose</option>${o.map((x, k) => `<option value="${k}">${x}</option>`).join('')}</select> <b data-r="${i}"></b></p>`).join(''));
  el.addEventListener('change', e => {
    const i = e.target.dataset.q; if (i === undefined) return; const v = e.target.value, r = el.querySelector(`[data-r="${i}"]`), q = Q[i];
    const good = v !== '' && +v === q[2];
    r.textContent = v === '' ? '' : good ? q[3] : 'No. ' + q[3]; r.style.color = good ? '#6fe38a' : '#ff5d4d';
  });
}

// Widget 5: timer or task for four jobs
function timerortask(el) {
  const Q = [['Fold the mast 200 ms after the last packet.', 'one'], ['Sample the spectrometer at 50 Hz; each sample takes the I2C mutex and 3 to 7 ms.', 'task'], ['Toggle a status LED every 500 ms with one gpio_set_level() call.', 'auto'], ['If no acknowledge arrives within 1 s of sending, resend once.', 'one']];
  const O = [['one', 'one-shot timer'], ['auto', 'auto-reload timer'], ['task', 'task with xTaskDelayUntil']];
  const why = { one: 'a single action after a quiet period fits a one-shot timer, restarted when something happens', auto: 'a tiny non-blocking action at a fixed rate is what an auto-reload timer is for', task: 'it blocks on a mutex and runs for milliseconds: it needs a task, and xTaskDelayUntil keeps the rate' };
  el.innerHTML = frame('TIMER OR TASK?', Q.map(([t], i) => `<p class="wgcap">${i + 1}. ${t} <select data-q="${i}"><option value="">choose</option>${O.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select> <b data-r="${i}"></b></p>`).join(''));
  el.addEventListener('change', e => {
    const i = e.target.dataset.q; if (i === undefined) return; const v = e.target.value, r = el.querySelector(`[data-r="${i}"]`), good = v === Q[i][1];
    r.textContent = v === '' ? '' : good ? 'fits: ' + why[v] : v === 'task' ? 'a task works but costs a stack for something a timer does with none' : v === 'auto' ? 'it would keep firing; this job happens once per event' : 'the job is blocking or must repeat: a one-shot timer does not fit'; r.style.color = good ? '#6fe38a' : '#ff5d4d';
  });
}

export const widgets = { antennawait, timeoutlab, svcdelay, cbfix, timerortask };

/* ================= theory ================= */

export const realCode = `// main/rover_main.c   (ESP-IDF v5.x)   stage 9: stage 8 plus a folding antenna mast stowed by a one-shot timer
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "freertos/timers.h"
#include "driver/gpio.h"
#include "esp_attr.h"
#include "esp_log.h"
#include "rover.h"   // prototypes for the rover helpers: deploy_antenna, stow_antenna, handle_packet, ... (not shown)

#define PRIO_LIGHTS    4
#define PRIO_MOTOR     3
#define PRIO_MID       2   // telemetry, science, imu, thermo
#define PRIO_LOW       1   // camera, spectro, nav, mapper, radio, bumper, antenna

#define GPIO_RX_IRQ    GPIO_NUM_5    // example pin: the radio module raises it for each packet
#define STOW_DELAY_MS  200           // goal: stow 180 to 250 ms after the LAST packet of a pass

typedef struct { uint8_t data[32]; } packet_t;   // the game's rx_q holds 4 items of 32 bytes

static const char *TAG = "rover";
static QueueHandle_t rx_q;
static TimerHandle_t stow_tmr;

// Timer callback. It runs in the timer service task ("Tmr Svc"): short, never blocks, no waiting API.
static void on_stow(TimerHandle_t t)
{
    stow_antenna();                       // the only job: fold the mast, once
}

// ISR: one short job, put the packet in the queue. The ISR does NOT touch the timer.
static void IRAM_ATTR on_packet(void *arg)
{
    packet_t pkt = {0};                   // a real handler copies the radio FIFO here with IRAM-safe code
    BaseType_t woken = pdFALSE;
    xQueueSendFromISR(rx_q, &pkt, &woken);
    portYIELD_FROM_ISR(woken);
    // Wrong: xTimerReset(stow_tmr, 0) here. Task-level timer calls must never be used in an ISR.
    // If an ISR must reset a timer, the call is xTimerResetFromISR(stow_tmr, &woken).
}

static void antenna_task(void *arg)
{
    packet_t pkt;
    for (;;) {
        xQueueReceive(rx_q, &pkt, portMAX_DELAY);   // sleeps here, so the next packet is never missed
        deploy_antenna();                           // mast out (no effect if it is already out)
        xTimerReset(stow_tmr, 0);                   // start the 200 ms countdown, or restart it from zero
        handle_packet(&pkt);                        // 3 ms in the game
        // Wrong (stage 9 start code): vTaskDelay(pdMS_TO_TICKS(250)); stow_antenna();
        // That sleep blocks the task, so packets wait in the queue, and it folds after every packet.
    }
}

// Other tasks and the bumper ISR from stages 1 to 8: unchanged
static void beacon_task(void *arg);
static void heart_task(void *arg);
static void motor_task(void *arg);
static void camera_task(void *arg);
static void telemetry_task(void *arg);
static void spectro_task(void *arg);
static void nav_task(void *arg);
static void mapper_task(void *arg);
static void science_task(void *arg);
static void radio_task(void *arg);
static void imu_task(void *arg);
static void thermo_task(void *arg);
static void bumper_task(void *arg);
static void IRAM_ATTR on_bump(void *arg);

void app_main(void)
{
    // ... GPIO setup, I2C mutex, queues and the other tasks from stages 1 to 8 ...
    // Return values unchecked for brevity: check them in real code (pdPASS, non-NULL handles).
    rx_q = xQueueCreate(4, sizeof(packet_t));

    // One-shot (xAutoReload = pdFALSE). Created dormant: nothing runs until xTimerReset/xTimerStart.
    stow_tmr = xTimerCreate("stow_tmr", pdMS_TO_TICKS(STOW_DELAY_MS), pdFALSE, NULL, on_stow);

    xTaskCreate(antenna_task, "antenna", 1792, NULL, PRIO_LOW, NULL);   // game stack size; real handlers that call ESP_LOGx need more

    gpio_install_isr_service(ESP_INTR_FLAG_IRAM);
    gpio_isr_handler_add(GPIO_RX_IRQ, on_packet, NULL);
    ESP_LOGI(TAG, "tick period: %d ms", (int)portTICK_PERIOD_MS);
}

// Build notes
//   Timer service task (ESP-IDF FreeRTOS):  idf.py menuconfig  >  Component config  >  FreeRTOS  >  Kernel
//     option                                   default   meaning
//     CONFIG_FREERTOS_USE_TIMERS               on        must be on for xTimerCreate
//     CONFIG_FREERTOS_TIMER_TASK_PRIORITY      1         priority of the "Tmr Svc" task (every callback runs at it)
//     CONFIG_FREERTOS_TIMER_TASK_STACK_DEPTH   2048      stack of "Tmr Svc", shared by every callback
//     CONFIG_FREERTOS_TIMER_QUEUE_LENGTH       10        commands waiting for the service task
//   Timer controls:  xTimerStart, xTimerStop, xTimerReset, xTimerChangePeriod, xTimerDelete; xTimerIsTimerActive() tells whether it is counting.
//   xTimerCreate(name, period_in_ticks, auto_reload, id, callback): period must be > 0, returns NULL if the heap is short; the timer starts dormant.
//   CONFIG_FREERTOS_HZ: the ESP-IDF default is 100 (10 ms tick), so pdMS_TO_TICKS(200) is 20 ticks and a timer cannot be finer than 10 ms.
//   The game runs at 1000 (1 ms tick). Set 1000 on real hardware to match the game.
//   idf.py build flash monitor`;

export const manual = [
  ['1. A delay is not a timeout', `<p>The antenna task was written the obvious way: wait for a packet, handle it, sleep 250 ms, fold the mast. The sleep <b>is</b> the timeout, and that is the mistake. <code>vTaskDelay()</code> moves the calling task to the Blocked-on-time list. While it is there, the task <b>cannot do anything else</b>, and the next packet sits in the queue until the sleep ends.</p>
   ${sleepDia}
   <p class="cap">One task, two jobs: reading packets and counting down to a fold. The sleep blocks the first to do the second.</p>
   <ul><li>A packet that arrives while the task sleeps waits for the rest of the sleep, and a fold follows every packet, even in the middle of a burst. Flash the start firmware and read the numbers off the chart.</li>
   <li>The waiting costs nothing: a blocked task uses no CPU and the idle task gets the time. The damage is not load, it is that the task is <b>not at <code>xQueueReceive()</code></b> when the data arrives.</li>
   <li>The stow is also not a task's job. It needs no stack, no priority and no loop: it is one call at a point in time. Something else should own the clock.</li></ul>
   <p>Change the sleep and watch both goals move in opposite directions:</p>
   <div data-w="antennawait"></div>`],

  ['2. A software timer is a callback with a deadline', `<p>A FreeRTOS <b>software timer</b> is a small kernel object: a period in ticks, a reload flag and a callback function. When the period has passed, the kernel calls the callback. No task of yours sleeps in the meantime.</p>
   ${timerDia}
   <ul><li><b>A new timer is dormant.</b> <code>xTimerCreate(name, period, auto-reload flag, id, callback)</code> only allocates it and returns a handle, or <code>NULL</code> if the heap is short. Nothing counts until you call <code>xTimerStart()</code> or <code>xTimerReset()</code>. The comms team created <code>stow_tmr</code> and never started it, which is the first half of the stage.</li>
   <li><b>One-shot</b> (<code>pdFALSE</code>): expires once, calls the callback once, then goes dormant. It can be started again later. <b>Auto-reload</b> (<code>pdTRUE</code>): after each expiry it restarts itself with the same period, until you stop it.</li>
   <li>The callback runs later, in a task you do not write. Section 4 says which one; for now it is a function the kernel calls for you.</li></ul>`],

  ['3. The restartable timeout', `<p>A timeout is "do X if nothing has happened for N ms". A software timer does it with one call: <code>xTimerReset()</code>. If the timer is dormant, it <b>starts</b> it. If it is already counting, it <b>restarts the period from zero</b>. The callback therefore only runs when the full period passes with no reset.</p>
   ${resetDia}
   <p class="cap">Packets at 420, 500 and 580 ms each restart the countdown. The last one at 580 ms lets it run out, so the stow is at 780 ms.</p>
   <p>The same idea on another device, a display backlight that goes dark 10 s after the last key press:</p>
   <pre>// key task, once per key press
xQueueReceive(key_q, &amp;key, portMAX_DELAY);
backlight_on();
xTimerReset(backlight_tmr, 0);   // one-shot, 10 s; 0: do not wait if the timer command queue is full
handle_key(key);

static void backlight_off_cb(TimerHandle_t t) { backlight_off(); }</pre>
   <ul><li>The pattern is everywhere: the backlight above, a link that is declared dead 1 s after the last frame, a mast that folds 200 ms after the last packet. Where exactly the reset goes in your antenna task is for you to work out.</li>
   <li><b>The period must be longer than the longest gap inside a pass.</b> The gaps are 80 ms, so a 50 ms timer fires inside the pass and the mast folds 4 times. Any period from about 180 to 245 ms passes the stage: the lower limit is the goal (180 ms), the upper limit comes from the 250 ms window minus the 2 to 3 ms the game needs to run the callback.</li>
   <li><b>Use a one-shot timer.</b> An auto-reload timer keeps firing every period after the last packet, and <code>stow_antenna()</code> runs again with nothing to stow (3 stows for 2 passes in the game).</li>
   <li><b>Say what you mean.</b> <code>xTimerReset()</code> names the intent: start it if dormant, restart it if running. The widget's third choice (start only if not active) shows the bug of not restarting: the countdown runs out inside the pass.</li>
   </ul>
   <p>Change the period, the pass and the call. The packet times are the game's: one packet at 100 ms, then a pass starting at 420 ms:</p>
   <div data-w="timeoutlab"></div>`],

  ['4. Who runs the callback: the timer service task (after you pass)', `<p>The callback does not run in the task that created the timer, and not in an interrupt. FreeRTOS starts one hidden task at scheduler start, the <b>timer service task</b>, named <code>Tmr Svc</code>. It owns the list of active timers, sleeps until the next expiry and calls the callbacks, one after the other.</p>
   ${svcDia}
   <ul><li><b>Calls are commands.</b> <code>xTimerReset()</code> does not touch the timer. It writes a command into the <b>timer command queue</b> and returns. The service task reads the command, changes the timer and later runs its callback. That is why the call takes a <code>ticksToWait</code> argument: how long the caller may wait if the command queue is full. From a callback it must be 0.</li>
   <li><b>Settings in ESP-IDF:</b> the service task's priority, stack size and command queue length are Kconfig options. They are listed in the table in the ESP-IDF example, with the timer controls and the tick-rate remark.</li>
   <li><b>Priority 1 means it competes with the camera.</b> If a priority 3 motor task keeps the CPU, a timer expiry waits too. A callback is as late as the service task is. The deadline in this stage (180 to 250 ms) is wide enough to cover that.</li>
   <li><b>One task, many callbacks.</b> A slow callback delays all the callbacks behind it, and a callback that blocks stops every timer in the system.</li>
   <li><b>Game versus real kernel.</b> The game's simulator runs each timer callback as its own priority 1 unit. It does not model the shared service task or its queue, so the chart cannot show one callback delaying another. The widget below draws the real kernel.</li></ul>
   <div data-w="svcdelay"></div>`],

  ['5. Rules for a callback (after you pass)', `<p>Everything the callback does happens in the service task, so the rules are those of that task. <b>The callback must never block.</b> It must not call <code>vTaskDelay()</code>, wait on a queue or semaphore, or call a driver that waits. In the game each of these stops the run with its own message, for example "vTaskDelay() tried to block inside a timer callback" or "transmit() blocks, and it was called from a timer callback".</p>
   ${cbDia}
   <p class="cap">A long callback makes the next timer late; a short one hands the work to a task.</p>
   <ul><li><b>Short.</b> The callback in this stage calls <code>stow_antenna()</code> and returns. A callback that computes for 40 ms delays every other timer behind it. In the game this trips the watchdog (reported at 599 ms, with the system near 98% load), because the timer service task keeps the idle task off the CPU. On real hardware the task watchdog watches the idle tasks by default, with a 5 s timeout, so it takes a much longer callback to trip it. The other timers are late either way.</li>
   <li><b>Any API that takes a wait time must be called with 0</b> inside a callback. Anything that has no wait-free form is not allowed.</li>
   <li><b>Long work:</b> the callback calls <code>xTaskNotifyGive()</code> or <code>xQueueSend(q, &amp;x, 0)</code> and a task you size and prioritise does the work.</li>
   <li><b>Not in an ISR.</b> <code>xTimerReset()</code> must never be called from an interrupt handler; on the real kernel the result is undefined. The game stops the run with "was called inside an ISR". The ISR variant is <code>xTimerResetFromISR(timer, &amp;woken)</code>, which needs a woken flag and <code>portYIELD_FROM_ISR(woken)</code> like every <code>...FromISR</code> call. This stage does it the other way: the ISR only queues the packet, and the task that receives it resets the timer. The ISR stays short and only one place owns the timer.</li></ul>
   <p><b>Try it in the game:</b> put <code>vTaskDelay(10)</code> into the <code>onStow</code> callback and flash, then put a call to <code>transmit()</code> there, then <code>xTimerReset</code> into the packet ISR. Each stops the run with its own message; read what it names.</p>
   <div data-w="cbfix"></div>`],

  ['6. Timer or task? (after you pass)', `<p>A timer and a task are two ways to run code later. The difference is what the code may do.</p>
   ${treeDia}
   <ul><li><b>One-shot timer:</b> a timeout, a debounce, "give up after 1 s", "do it once, N ms from now". It needs a handle (96 B in the game), no stack of its own and no task. That is why the stow needed no task.</li>
   <li><b>Auto-reload timer:</b> a periodic job that is a few microseconds long and never waits, such as toggling an LED. It is simpler than a task, but <b>it has no priority of its own</b>, so you cannot rank it against other work, and it cannot block on a mutex or a queue.</li>
   <li><b>Task with <code>xTaskDelayUntil()</code>:</b> the stage 3 spectrometer. It runs for milliseconds, takes the I2C mutex and keeps its rate. A timer callback could not do any of that.</li>
   <li><b>Cost:</b> a task costs a stack (1792 B for the antenna in the game) plus a control block. A timer costs only its control block, because the callback uses the service task's stack, shared by every timer.</li>
   <li>The ESP-IDF <code>esp_timer</code> API is a separate facility with microsecond resolution, not the FreeRTOS tick. Its callbacks normally run in their own task, not in the FreeRTOS timer service task. This manual covers the FreeRTOS timer.</li></ul>
  
   <div data-w="timerortask"></div>`],

  ['7. Priority 1 again (after you pass)', `<p>The new <code>antenna</code> task is short (3 ms per packet), so it is tempting to give it a high priority. The rover is at about 98% load, so there is no spare CPU to give.</p>
   ${prioDia}
   <ul><li><b>Priority 1</b> keeps every earlier deadline. The packet is handled 10 to 29 ms after it arrives (goal: 60 ms).</li>
   <li><b>Priority 2</b> shares the level with telemetry. The telemetry gap becomes 105 ms, exactly the limit, so any change elsewhere breaks it.</li>
   <li><b>Priority 3 or 4</b> preempts the motor: the motor gap grows to 12 or 13 ms, over the limit of 11 ms.</li>
   <li>The timer callback does not appear in this table because it has no priority of its own. It runs wherever the timer service task runs, which is priority 1 by default. Raising <code>CONFIG_FREERTOS_TIMER_TASK_PRIORITY</code> would move <b>all</b> callbacks, not only this one.</li>
   <li><b>RAM:</b> the stage costs the antenna stack, <code>rx_q</code> and the timer: 22976 B in the reference solution. The Lean star does not count up to 256 B of spare stack per task, which leaves 21848 B against a limit of 21896 B. A 2048 B antenna stack already misses the limit.</li></ul>`],
];

export const quiz = [
  { q: 'The antenna task calls vTaskDelay(250) after each packet. A new packet arrives 100 ms later. What happens to it?', opts: ['It is handled at once, because the interrupt wakes the task', 'It waits in the queue until the task wakes and calls xQueueReceive again', 'It is dropped, because the task is not receiving'], a: 1, why: 'A sleeping task does nothing. The ISR can only put the packet in the queue (and it stays there while there is room), so it waits for the rest of the 250 ms.', wrong: ["An interrupt can put the packet in the queue, but it cannot cut a sleep short. vTaskDelay returns only when its time is up.", null, "The queue stores the packet while it has room, whether or not a task is waiting at xQueueReceive."] },
  { q: 'A one-shot timer expires and its callback runs. Later, with no other call, the 200 ms period passes again. What happens?', opts: ['The callback runs again, because the period repeats', 'Nothing: the timer is dormant until it is started or reset again', 'The kernel deletes the timer and the handle becomes invalid'], a: 1, why: 'A one-shot timer goes dormant after it expires. The handle stays valid, and xTimerStart() or xTimerReset() starts it once more. An auto-reload timer is the one that repeats.', wrong: ["Only an auto-reload timer restarts itself. A one-shot timer expires once and then waits to be started again.", null, "Expiry does not delete a timer. Only xTimerDelete() does, and the handle stays valid until then."] },
  { q: 'Three packets arrive 80 ms apart and each calls xTimerReset() on a 50 ms one-shot timer. How many times does the callback run?', opts: ['Once, 50 ms after the last packet', 'Three times: the timer runs out before every next packet', 'Never, because a reset cancels the timer'], a: 1, why: 'The gap is 80 ms and the period is 50 ms, so the timer expires 50 ms after each packet, before the next one arrives. Each expiry runs the callback, so the mast folds in the middle of the pass.', wrong: ["That would be right if the packets came faster than the period. Here the gap is 80 ms and the period is 50 ms, so the timer runs out between packets.", null, "xTimerReset() restarts the period, it does not cancel the timer. A timer that is reset and then left alone expires."] },
  { q: 'Two timers expire 5 ms apart. The first callback takes 40 ms. When does the second callback start on a real kernel?', opts: ['At 5 ms, because each timer has its own context', 'At about 40 ms, because one service task runs the callbacks one after the other', 'At 45 ms, because the kernel adds the gap to the first callback'], a: 1, why: 'Both callbacks run in the same timer service task, which is busy until the first returns. This delay is not visible in the game: its simulator gives each callback its own unit.', wrong: ["Timers have no separate context. All callbacks run one after another in the single timer service task.", null, "The second callback does not wait for the gap plus the first runtime. It starts as soon as the service task is free, right after the first returns."] },
  { q: 'A callback has to read a sensor for 40 ms and publish the result. What is the right design?', opts: ['Do the read in the callback and raise the timer service task priority', 'Call vTaskDelay() between smaller reads inside the callback', 'The callback sends a notification and a task does the read'], a: 2, why: 'The callback must be short and must not block. A task with its own priority and stack can run 40 ms, and the callback only wakes it.', wrong: ["A higher service task priority does not shorten the 40 ms. The callback still blocks every timer behind it and now competes with tasks that have deadlines.", "A callback must not block, and vTaskDelay is a blocking call. In the service task it would stall every timer.", null] },
  { q: 'Why did the stow not need its own task?', opts: ['A timer calls the function after a period and needs no stack and no loop of its own', 'A task would have a higher priority than the antenna and break the motor deadline', 'Timers run in an interrupt, so they never use the CPU'], a: 0, why: 'The stow is one call at one point in time. The timer object (96 B) holds the period and the callback, and the call runs on the service task. A task would cost a stack and a loop that only sleeps.', wrong: [null, "A new task could be given a low priority, so priority is not what rules it out.", "Timer callbacks run in the timer service task, which is an ordinary task, not in an interrupt. They use CPU time like any other code."] },
  { q: 'The 3 ms antenna handler is given priority 3 "because it is short". What is the consequence at 98% load?', opts: ['None: 3 ms is too short to disturb anyone', 'The motor gap passes its 11 ms limit, because the handler preempts or competes with the motor', 'The timer callback runs at priority 3 too and the stow becomes exact'], a: 1, why: 'Priority 3 ties with the motor and every packet is 3 ms the motor may have to wait. The stage keeps the antenna at priority 1; the timer callback does not follow the task priority.', wrong: ["3 ms of work still delays the motor when it runs at the motor's priority or above. At 98% load there is no slack to absorb it.", null, "A timer callback runs in the timer service task, whose priority is a Kconfig value. Changing the antenna task priority does not move it."] },
];
