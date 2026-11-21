// Field manual for stage 8 (ESP-IDF): task notifications, a counter inside the task instead of a kernel object.
import { svg, box, arrow, note } from '../widgets.js';

const bar = (x, y, w, cls, h = 20) => `<rect class="bx ${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>`;
const axis = (x0, x1, y) => `<line class="ar" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" marker-end="url(#ah)"/>`;
const bad = s => s.replace('class="at"', 'class="at" style="fill:#ff5d4d;font-weight:700"');

/* ================= diagrams ================= */

// 1. A semaphore chain vs a direct line
const chainDia = svg(720, 170, (
  note(20, 18, 'stage 7: a kernel object sits between the two', 'start')
  + box(20, 28, 150, 44, 'onBump (ISR)|gives', 'd') + arrow(170, 50, 280, 50) + box(280, 28, 170, 44, 'bump_sem|96 B in the game', 'r') + arrow(450, 50, 560, 50) + box(560, 28, 140, 44, 'bumper task|takes', 'c')
  + note(20, 104, 'stage 8: the task carries the counter itself', 'start')
  + box(20, 114, 150, 44, 'onBump (ISR)|vTaskNotifyGiveFromISR', 'd') + arrow(170, 136, 560, 136, 'needs the task handle', 0, -8) + box(560, 114, 140, 44, 'bumper task|value inside its TCB', 'g')
), 'A semaphore between ISR and task, against a notification sent straight to the task');

// 2. Where the counter lives
const tcbDia = svg(720, 190, (
  box(20, 20, 160, 44, 'onBump (ISR)', 'd') + box(20, 110, 160, 44, 'any other task', 'd')
  + `<rect class="bx c" x="330" y="10" width="370" height="170" rx="8" style="fill:none"/>` + note(345, 30, 'bumper: its task control block (TCB)', 'start')
  + box(350, 44, 160, 44, 'notified value|a 32-bit counter', 'a') + box(530, 44, 150, 44, 'notify state|waiting or not', 'a')
  + box(350, 110, 330, 56, 'ulTaskNotifyTake(pdFALSE, portMAX_DELAY)|blocks while value is 0, returns the old value', 'g')
  + arrow(180, 42, 350, 62, 'give: value + 1', 0, -10) + arrow(180, 132, 350, 78, 'give', -10, 14)
), 'A notification is a counter and a state stored inside the receiving task');

// 3. pdTRUE vs pdFALSE with a burst
const takeDia = svg(720, 190, (() => {
  const X = t => 150 + t * 7; let s = note(142, 34, 'three gives', 'end') + note(142, 90, 'pdTRUE', 'end') + note(142, 150, 'pdFALSE', 'end');
  [0, 2, 4].forEach(t => { s += `<line class="ar" x1="${X(t)}" y1="14" x2="${X(t)}" y2="40" marker-end="url(#ah)"/>`; });
  s += bar(X(10), 76, 8 * 7, 'g') + note(X(10), 70, 'count 3 -> reset to 0: one check', 'start');
  s += bar(X(10), 136, 8 * 7, 'g') + bar(X(18) + 2, 136, 8 * 7, 'g') + bar(X(26) + 4, 136, 8 * 7, 'g') + note(X(10), 130, 'count 3 -> 2 -> 1 -> 0: three checks', 'start');
  s += axis(150, 700, 176) + note(700, 188, 'time', 'end');
  return s;
})(), 'With pdTRUE a burst of three gives is one run, with pdFALSE it is three runs');

// 4. Binary semaphore merge
const mergeDia = svg(720, 190, (() => {
  const X = t => 150 + (t - 145) * 5; let s = note(142, 34, 'impacts', 'end') + note(142, 90, 'binary bump_sem', 'end') + note(142, 150, 'task checks', 'end');
  [150, 152].forEach(t => { s += `<line class="ar" x1="${X(t)}" y1="14" x2="${X(t)}" y2="40" marker-end="url(#ah)"/>`; });
  s += note(X(150), 56, 'give', 'middle') + bad(note(X(152) + 8, 56, 'give dropped: slot already full', 'start'));
  s += bar(X(150), 76, X(179) - X(150), 'a') + note(X(150), 112, 'holds 1, not 2', 'start');
  s += bar(X(179), 136, X(187) - X(179), 'g') + note(X(189), 150, '1 check for 2 impacts', 'start');
  s += axis(150, 700, 176) + [150, 160, 170, 180, 190].map(t => note(X(t), 188, t, 'middle')).join('') + note(700, 188, 'ms', 'end');
  return s;
})(), 'Two gives two milliseconds apart: a binary semaphore keeps one');

// 5. Decision tree
const treeDia = svg(720, 250, (
  box(250, 6, 220, 36, 'one event, who needs it?', 'a')
  + arrow(310, 42, 130, 84) + arrow(410, 42, 590, 84) + arrow(360, 42, 380, 170)
  + box(20, 84, 220, 40, 'exactly one waiting task|(known handle)', 'c') + box(480, 84, 220, 40, 'several tasks, or one task|waiting on several events', 'c')
  + arrow(130, 124, 70, 170) + arrow(130, 124, 190, 170) + arrow(590, 124, 590, 170)
  + box(10, 170, 130, 52, 'no data|notification', 'g') + box(150, 170, 130, 52, 'data to carry|queue', 'g')
  + box(300, 170, 160, 52, 'not a signal|shared resource: mutex', 'd') + box(480, 170, 230, 52, 'event group|every waiter sees it', 'g')
), 'Choosing between a notification, a queue, a mutex and an event group');

// 6. Speed claim, labelled as not measured
const speedDia = svg(720, 144, (
  note(20, 18, 'give + take, relative cost (illustrative bars; the FreeRTOS documentation', 'start') + note(20, 36, 'claims up to 45% faster, not measured by this game)', 'start')
  + note(150, 74, 'binary semaphore', 'end') + bar(160, 58, 400, 'd', 22) + note(570, 74, '100', 'start')
  + note(150, 114, 'task notification', 'end') + bar(160, 98, 220, 'g', 22) + note(390, 109, 'illustrative length only;', 'start') + note(390, 127, 'the doc says "up to 45% faster"', 'start')
), 'Relative cost of a semaphore and a notification according to the FreeRTOS documentation');

// 7. Start-up order: handle first, interrupt second
const orderDia = svg(720, 214, (
  note(15, 16, 'safe order in app_main (time runs left to right)', 'start')
  + box(15, 26, 150, 48, 'xTaskCreate|writes bumper_handle', 'c') + arrow(165, 50, 195, 50)
  + box(195, 26, 150, 48, 'check pdPASS|handle is valid', 'c') + arrow(345, 50, 375, 50)
  + box(375, 26, 150, 48, 'register handler|gpio_isr_handler_add', 'c') + arrow(525, 50, 555, 50)
  + box(555, 26, 150, 48, 'gpio_set_intr_type|edge interrupt armed', 'g')
  + bar(15, 90, 510, 'd', 16) + note(270, 103, 'interrupt still off: no edge can reach on_bump', 'middle')
  + bar(555, 90, 150, 'g', 16) + note(630, 103, 'safe: handle is set', 'middle')
  + note(15, 138, 'wrong order: the interrupt is armed before the task exists', 'start')
  + box(15, 148, 300, 52, 'an edge arrives, on_bump runs|bumper_handle is still NULL', 'r') + arrow(315, 174, 405, 174)
  + box(405, 148, 300, 52, 'the notify call gets NULL|assertion or crash at the first impact', 'r')
), 'Start-up order: create the task, check the handle, register the handler, arm the interrupt last');

/* ================= widgets ================= */

const frame = (title, body) => `<div class="wg"><div class="wgh">INTERACTIVE · ${title}</div>${body}</div>`;
const sl = (id, label, min, max, v) => `<label>${label} <input type="range" data-${id} min="${min}" max="${max}" value="${v}"> <b data-${id}v></b></label>`;
const val = (el, id, unit = ' ms') => { const v = +el.querySelector('[data-' + id + ']').value; el.querySelector('[data-' + id + 'v]').textContent = v + unit; return v; };
const KINDS = { bin: 'binary semaphore', cnt: 'counting semaphore', nfalse: 'notification, pdFALSE', ntrue: 'notification, pdTRUE' };

// Deterministic 1 ms replay of "n gives, gap ms apart" against one waiting task. latency = ms before the task gets the CPU after it is woken.
function replay(kind, n, gap, latency, check = 8) {
  const gives = Array.from({ length: n }, (_, i) => 150 + i * gap), checks = []; let pend = 0, lost = 0, gi = 0, busy = 0, wake = null;
  for (let t = 100; t < 420; t++) {
    while (gi < n && gives[gi] <= t) { if (kind === 'bin' && pend >= 1) lost++; else pend++; gi++; }
    if (t >= busy && wake === null && pend > 0) wake = t + (checks.length ? 0 : latency);
    if (wake !== null && t >= wake) { pend = kind === 'ntrue' ? 0 : pend - 1; checks.push(t); busy = t + check; wake = null; }
  }
  return { gives, checks, lost, left: pend };
}
const replayChart = r => {
  const X = t => 60 + (t - 140) * 2.4; let s = note(52, 34, 'impacts', 'end') + note(52, 74, 'checks', 'end');
  r.gives.forEach(t => { s += `<line class="ar" x1="${X(t)}" y1="14" x2="${X(t)}" y2="40" marker-end="url(#ah)"/>`; });
  r.checks.forEach(t => { if (X(t + 8) < 740) s += bar(X(t), 62, 8 * 2.4, 'g', 18); });
  s += axis(60, 750, 96) + [140, 180, 220, 260, 300, 340].map(t => note(X(t), 110, t, 'middle')).join('') + note(750, 110, 'ms', 'end');
  return svg(760, 118, s, 'Impacts and the thermal checks that followed');
};

function burstlab(el) {
  const D = el.dataset, k0 = D.kind || 'bin', n0 = +(D.n || 2), g0 = +(D.g || 2), l0 = +(D.l || 29); let pred = D.predict ? '' : null;
  el.innerHTML = frame('HOW MANY CHECKS DOES A BURST OF IMPACTS GET?', `<div class="wgrow"><label>Wake-up mechanism <select data-k>${Object.entries(KINDS).map(([k, t]) => `<option value="${k}" ${k === k0 ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    ${sl('n', 'impacts', 1, 5, n0)} ${sl('g', 'spacing', 0, 6, g0)} ${sl('l', 'time until the task runs', 0, 40, l0)}</div>${D.predict ? `<p class="wgcap">Your prediction first: how many thermal checks run? <select data-p><option value="">choose</option>${[0, 1, 2, 3, 4].map(i => `<option value="${i}">${i}</option>`).join('')}</select></p>` : ''}<div data-out></div>`);
  const draw = () => {
    const k = el.querySelector('[data-k]').value, n = val(el, 'n', ''), g = val(el, 'g'), l = val(el, 'l'), r = replay(k, n, g, l), ok = r.checks.length === n;
    if (pred === '') { const pv = el.querySelector('[data-p]').value; if (pv === '') { el.querySelector('[data-out]').innerHTML = ''; return; } pred = +pv; el.querySelector('[data-p]').disabled = true; el.dataset.shown = '1'; el.dataset.verdict = pred === r.checks.length ? '\u2713 you predicted ' + pred + ': right.' : '\u2717 you predicted ' + pred + ': the simulator says ' + r.checks.length + '.'; }
    el.querySelector('[data-out]').innerHTML = (el.dataset.verdict ? `<p class="wgcap"><b>${el.dataset.verdict}</b></p>` : '') + replayChart(r) + `<p class="wgcap"><b>${n}</b> impacts, <b>${r.checks.length}</b> thermal check${r.checks.length === 1 ? '' : 's'}. `
      + (ok ? 'Every impact got its check.' : `<span class="bad">${n - r.checks.length} impact${n - r.checks.length === 1 ? '' : 's'} never got a check.</span> `
        + (k === 'bin' ? `The binary semaphore holds one give at most, so ${r.lost} give${r.lost === 1 ? ' was' : 's were'} dropped while it was already full.` : k === 'ntrue' ? 'pdTRUE resets the count to 0 when the task wakes, so the whole burst becomes one run.' : '')) + '</p>';
  };
  el.addEventListener('input', draw); el.addEventListener('change', draw); draw();
}

function ramlab(el) {
  const base = 19860, LEAN = 19896; // RAM as the Lean star counts it: up to 256 B of spare stack per task is free
  el.innerHTML = frame('WHAT DOES THE WAKE-UP COST IN RAM?', `<div class="wgrow"><label>Design <select data-d><option value="bin">binary semaphore bump_sem</option><option value="cnt">counting semaphore bump_sem</option><option value="ntf" selected>task notification, bump_sem deleted</option><option value="left">task notification, bump_sem left in the project</option></select></label></div><div data-out></div>`);
  const draw = () => {
    const d = el.querySelector('[data-d]').value, obj = d === 'ntf' ? 0 : 96, ram = base + obj, X = v => 20 + (v - 19700) * 2.6;
    let s = note(20, 16, 'RAM the Lean star counts for the whole rover (bytes)', 'start') + bar(X(19700), 28, X(ram) - X(19700), obj ? 'a' : 'g', 24)
      + `<line class="dash" x1="${X(LEAN)}" y1="22" x2="${X(LEAN)}" y2="62"/>` + note(X(LEAN), 76, 'Lean limit 19896', 'middle') + note(Math.min(X(ram) - 6, 690), 46, ram + ' B', 'end');
    el.querySelector('[data-out]').innerHTML = svg(720, 88, s, 'RAM used for each design') + `<p class="wgcap">${obj ? `The semaphore is a kernel object: <b>96 B</b> in the game${d === 'left' ? ', and it is still allocated although nothing uses it. Delete it from the project.' : '. The notification needs none of it.'}` : 'No object exists. The counter is part of the bumper task, which is already paid for.'} ${ram <= LEAN ? '<b>Under the Lean limit.</b>' : '<span class="bad">Over the Lean limit.</span>'}</p>`;
  };
  el.addEventListener('input', draw); draw();
}

function steplab(el) {
  el.innerHTML = frame('GIVE AND TAKE ON ONE TASK\'S COUNTER', `<div class="wgrow"><label>Task calls <select data-c><option value="0">ulTaskNotifyTake(pdFALSE, portMAX_DELAY)</option><option value="1">ulTaskNotifyTake(pdTRUE, portMAX_DELAY)</option></select></label>
    <button class="hb" data-give>ISR gives</button> <button class="hb" data-take>task takes</button> <button class="hb" data-reset>reset</button></div><div data-out></div>`);
  let v, blocked, log; const reset = () => { v = 0; blocked = false; log = ['start: value 0, task running']; }; reset();
  const draw = () => {
    el.querySelector('[data-out]').innerHTML = svg(720, 70, box(20, 12, 180, 44, 'notified value: ' + v, v ? 'a' : 'd') + box(230, 12, 200, 44, blocked ? 'bumper: Blocked' : 'bumper: Running', blocked ? 'blk' : 'run') + note(450, 38, 'the last take returned the value it saw', 'start'), 'The notification counter and the task state')
      + `<pre class="wgcap">${log.slice(-6).join('\n')}</pre>`;
  };
  el.querySelector('[data-give]').onclick = () => { v++; if (blocked) { blocked = false; log.push(`give: value 1, task unblocks; take returns 1, value back to 0`); v = 0; } else log.push(`give: value ${v}`); draw(); };
  el.querySelector('[data-take]').onclick = () => {
    const clr = el.querySelector('[data-c]').value === '1';
    if (blocked) log.push('take: ignored, the task is already blocked');
    else if (v === 0) { blocked = true; log.push('take: value is 0, the task blocks (no CPU used)'); }
    else { const was = v; v = clr ? 0 : v - 1; log.push(`take: returns ${was}, value is now ${v}${clr ? ' (cleared)' : ' (decremented by 1)'}`); }
    draw();
  };
  el.querySelector('[data-reset]').onclick = () => { reset(); draw(); };
  draw();
}

function toolquiz(el) {
  const Q = [
    ['An ISR must wake one known task, once per event, and no data goes with it.', 'ntf'],
    ['A sensor task hands a 12-byte reading to a logger task.', 'queue'],
    ['One "network up" event must release three tasks at once.', 'evg'],
    ['A task has to wait until any one of three flags is set.', 'evg'],
  ], O = [['ntf', 'task notification'], ['queue', 'queue'], ['evg', 'event group']];
  el.innerHTML = frame('WHICH TOOL FITS?', Q.map(([t], i) => `<p class="wgcap">${i + 1}. ${t} <select data-q="${i}"><option value="">choose</option>${O.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select> <b data-r="${i}"></b></p>`).join(''));
  el.addEventListener('change', e => {
    const i = e.target.dataset.q; if (i === undefined) return; const v = e.target.value, r = el.querySelector(`[data-r="${i}"]`);
    r.textContent = !v ? '' : v === Q[i][1] ? 'fits' : v === 'ntf' ? 'a notification has one receiver and carries no data beyond its counter' : v === 'queue' ? 'a queue carries items, but each item goes to one receiver' : 'an event group is for flags and several waiters, more than this needs';
    r.style.color = v === Q[i][1] ? '#6fe38a' : '#ff5d4d';
  });
}

export const widgets = { burstlab, ramlab, steplab, toolquiz };

/* ================= theory ================= */

export const realCode = `// main/rover_main.c   (ESP-IDF v5.x)   stage 8: stage 7 with the bumper woken by a task notification
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "esp_attr.h"
#include "esp_log.h"
#include "rover.h"   // prototypes for the rover helpers: stop_motors, check_thermals, ... (not shown)

#define PRIO_LIGHTS    4
#define PRIO_MOTOR     3
#define PRIO_MID       2   // telemetry, science, imu, thermo
#define PRIO_LOW       1   // camera, spectro, nav, mapper, radio, bumper

#define GPIO_BUMP      GPIO_NUM_4   // example pin for the strip sensor

static const char *TAG = "rover";

// The ISR needs this to reach the task. Set it BEFORE the interrupt is enabled.
static TaskHandle_t bumper_handle = NULL;

// Stage 7 had: static SemaphoreHandle_t bump_sem;   xSemaphoreGiveFromISR(bump_sem, &woken);
// Stage 8: no kernel object. The counter lives inside the bumper task.
// IRAM_ATTR and ESP_INTR_FLAG_IRAM: see the "real hardware" note in manual section 6.
static void IRAM_ATTR on_bump(void *arg)
{
    stop_motors();                                    // safety first: short, no blocking, no flash access
    BaseType_t woken = pdFALSE;
    vTaskNotifyGiveFromISR(bumper_handle, &woken);    // value + 1; wakes bumper if it waits
    portYIELD_FROM_ISR(woken);                        // switch to bumper on return if it outranks the interrupted task
    // Wrong: xTaskNotifyGive(bumper_handle) here. The non-ISR call must never be used in an interrupt handler.
}

static void bumper_task(void *arg)
{
    for (;;) {
        // pdFALSE: take ONE give per call, so a burst of N impacts gives N wake-ups.
        // pdTRUE would reset the count to 0 and turn the burst into one wake-up.
        ulTaskNotifyTake(pdFALSE, portMAX_DELAY);     // blocks with no CPU use while the value is 0
        check_thermals();                              // 8 ms in the game
    }
}

// Tasks of stages 1 to 7: unchanged
static void beacon_task(void *arg);  static void heart_task(void *arg);     static void motor_task(void *arg);
static void camera_task(void *arg);  static void telemetry_task(void *arg); static void spectro_task(void *arg);
static void nav_task(void *arg);     static void mapper_task(void *arg);    static void science_task(void *arg);
static void radio_task(void *arg);   static void imu_task(void *arg);       static void thermo_task(void *arg);

void app_main(void)
{
    // ... GPIO, I2C and mutex setup from stages 1 to 7 ...
    // xTaskCreate return values unchecked for brevity: check == pdPASS in real code.
    xTaskCreate(beacon_task,    "beacon",    2048, NULL, PRIO_LIGHTS, NULL);
    xTaskCreate(heart_task,     "heart",     2048, NULL, PRIO_LIGHTS, NULL);
    xTaskCreate(motor_task,     "motor",     2048, NULL, PRIO_MOTOR,  NULL);
    // ... the other stage 1 to 7 tasks, at the priorities defined above ...
    xTaskCreate(bumper_task,    "bumper",    1280, NULL, PRIO_LOW, &bumper_handle);   // game stack size; real code that logs needs more

    // bumper_handle is valid now. Configure the pin with the interrupt disabled, register the handler,
    // and arm the edge interrupt last, so no edge can arrive before the handler exists.
    gpio_config_t io = { .pin_bit_mask = 1ULL << GPIO_BUMP, .mode = GPIO_MODE_INPUT, .intr_type = GPIO_INTR_DISABLE };
    ESP_ERROR_CHECK(gpio_config(&io));
    ESP_ERROR_CHECK(gpio_install_isr_service(ESP_INTR_FLAG_IRAM));
    ESP_ERROR_CHECK(gpio_isr_handler_add(GPIO_BUMP, on_bump, NULL));
    ESP_ERROR_CHECK(gpio_set_intr_type(GPIO_BUMP, GPIO_INTR_NEGEDGE));
    ESP_LOGI(TAG, "bumper ready");
}

// Build notes
//   idf.py build flash monitor
//   Handlers added with gpio_isr_handler_add run in interrupt context: no blocking calls, only ...FromISR() functions.
//   The ESP-IDF default tick is CONFIG_FREERTOS_HZ=100 (10 ms). The game uses 1000 (1 ms ticks); notifications do not depend on the tick, but pdMS_TO_TICKS rounding does.`;

export const manual = [
  ['1. Four impacts, two checks', `<p>The new strip sensor reports every impact, and the rock slide delivers two impacts within 2 ms, twice. Each impact needs its own 8 ms thermal check. The stage 7 firmware, flashed as it is, ends with <b>4 impacts and only 2 checks</b>. Before you read why, predict one burst with the stage 7 design: <code>bump_sem</code> is a binary semaphore, <code>bumper</code> is a priority 1 task in a system about 98% loaded, and it needs 29 ms to get the CPU.</p>
   <div data-w="burstlab" data-predict="1"></div>
   <p>Then change the wake-up mechanism and the sliders to see what keeps every impact.</p>
   <p>Why it happens: a binary semaphore is a queue of length 1. A give puts the token in the slot. A second give while the slot is still full has nowhere to go, and <code>xSemaphoreGiveFromISR</code> returns <code>pdFALSE</code> (the queue-full error) and drops it. The game counts these as <code>merged</code>: 2 in the stage 7 firmware.</p>
   ${mergeDia}
   <p>In stage 7 the sensor was a bump switch that reports one edge at a time, so a merge never happened and the design was correct. By the time <code>bumper</code> runs, both gives of a burst have arrived and only one is stored.</p>
   <p>Three designs keep all four impacts:</p>
   <ul><li><b>Counting semaphore</b> <code>xSemaphoreCreateCounting(8, 0)</code>: the slot holds up to 8. It works, and still costs a kernel object.</li>
   <li><b>Task notification with pdFALSE</b>: the counter is in the task, no object. The smallest design, and the one this stage teaches.</li>
   <li><b>Do the work in the ISR</b>: no waiting, so no loss, but the check takes 8 ms inside an interrupt, which blocks every task and breaks the 1 ms ISR limit. This is the wrong answer in the mission.</li></ul>`],

  ['2. Notify a task directly', `<p>A notification goes to a <b>task handle</b>, not to an object. Every task already has a 32-bit <b>notification value</b> and a notification state inside its task control block, created together with the task by <code>xTaskCreate</code>. Using it allocates nothing. Three calls cover this stage:</p>
   <pre>BaseType_t xTaskNotifyGive(TaskHandle_t task);                         // from a task
void vTaskNotifyGiveFromISR(TaskHandle_t task, BaseType_t *woken);       // from an ISR
uint32_t ulTaskNotifyTake(BaseType_t clearOnExit, TickType_t timeout);  // in the receiving task</pre>
   <p><code>xTaskNotifyGive</code> is a macro over the general <code>xTaskGenericNotify</code> with the action "increment the value". The give adds 1 to the receiver's value and, if the task was blocked in a take, makes it Ready. <code>ulTaskNotifyTake</code> blocks while the value is 0 and returns the value it saw.</p>
   ${tcbDia}
   <ul><li>The ISR needs the <b>handle</b>. <code>xTaskCreate(bumper_task, "bumper", 1280, NULL, 1, &amp;bumper_handle)</code> writes it through the last argument. It must be valid before the interrupt can fire, so create the task first and enable the interrupt afterwards.</li>
   <li>In an ISR use <code>vTaskNotifyGiveFromISR</code> and finish with <code>portYIELD_FROM_ISR(woken)</code>. If <code>woken</code> became pdTRUE, the bumper outranks the interrupted task and the kernel switches to it on return. Here <code>bumper</code> has priority 1, so no switch happens and it runs when it is the highest Ready task.</li>
   <li>Calling plain <code>xTaskNotifyGive</code> in the ISR is a bug. The game stops with "xTaskNotifyGive() was called inside an ISR" at 150 ms. On real hardware it can corrupt the scheduler state, because it takes a critical section meant for tasks.</li></ul>
   <p>Step through gives and takes:</p>
   <div data-w="steplab"></div>`],

  ['3. The counting trap: pdFALSE or pdTRUE', `<p>The first argument of <code>ulTaskNotifyTake</code> decides what happens to the counter when the task wakes:</p>
   <ul><li><code>pdFALSE</code>: the value is <b>decremented by one</b>. The task behaves like a counting semaphore: three gives are three wake-ups.</li>
   <li><code>pdTRUE</code>: the value is <b>cleared to zero</b>. The task behaves like a binary semaphore: any number of gives before the task runs are one wake-up.</li></ul>
   ${takeDia}
   <p>The return value is the count <b>before</b> it was decremented or cleared. With <code>pdTRUE</code> a task can read how many events it missed: <code>n = ulTaskNotifyTake(pdTRUE, portMAX_DELAY)</code>, then process n items in one go. That is a valid design for batching. For this stage it is the wrong one: each impact needs its own thermal check, so the bumper uses <code>pdFALSE</code>.</p>
   <ul><li>The most common mistake is copying <code>pdTRUE</code> from an example. It looks identical in the code and passes a test with one impact. It fails only when two impacts land before the task runs, which is the rock-slide case.</li>
   <li>The value is a plain 32-bit counter. It wraps after 2<sup>32</sup> gives, which is not a practical limit.</li></ul>
   <p>Three impacts, notification with pdTRUE: change the mechanism to pdFALSE and compare.</p>
   <div data-w="burstlab" data-kind="ntrue" data-n="3"></div>`],

  ['4. Limits: one receiver, one counter', `<p>A notification is cheap because it is restricted. Know what it cannot do before replacing every semaphore with it:</p>
   <ul><li><b>One receiver.</b> The value belongs to one task. You cannot wake two tasks with one give; the giver needs a handle per task.</li>
   <li><b>The receiver is a task.</b> An ISR cannot wait on a notification. It cannot be the one that blocks.</li>
   <li><b>One wait per task.</b> A task blocks on its own value only. It cannot wait for a notification and a queue at the same time (use a queue set or an event group for that).</li>
   <li><b>No data.</b> Besides the counter, the value is only 32 bits. <code>xTaskNotify</code> can set or OR bits into it, and <code>xTaskNotifyWait</code> is the richer receiving call. Both are beyond this stage.</li>
   <li><b>The giver never blocks.</b> A give is never refused for lack of room: the counter just grows. That is why a burst is safe here, and also why a producer can run arbitrarily far ahead of the consumer with no feedback.</li></ul>
   ${treeDia}
   <div data-w="toolquiz"></div>`],

  ['5. How much faster? What the game does not measure', `<p>The FreeRTOS documentation says that unblocking a task with a notification is up to 45% faster than with a binary semaphore, and that it uses less RAM. That figure comes from FreeRTOS's own measurement on a different port, not on ESP-IDF's SMP kernel, and it was not measured on an ESP32 here. The reason is plain: a give goes straight to the task's own fields. No queue is locked, no queue list of waiting tasks is searched.</p>
   ${speedDia}
   <p class="cap">The bars show the documentation's figure. This game did not measure it.</p>
   <ul><li><b>The game does not model it.</b> In the simulator a kernel call costs no time, so the notification and the semaphore wake <code>bumper</code> at identical instants: the checks run at 29, 81, 50 and 88 ms after their impacts with either. Only the 96 B of RAM is measured.</li>
   <li>On an ESP32 the saving is some hundreds of nanoseconds to a microsecond per wake-up. It matters for an event rate in the tens of thousands per second. For a bumper it does not matter at all; the reason to use a notification here is correctness (the counter) and RAM.</li>
   <li>Use the documented claim as a reason to prefer a notification when it fits. Do not use it as a reason to rewrite code that already works.</li></ul>`],

  ['6. Four habits that keep the bumper safe', `${orderDia}
   <ul><li><b>Handle first, interrupt second.</b> A <code>NULL</code> handle in the ISR crashes at the first impact, so create the task, check <code>pdPASS</code>, then call <code>gpio_isr_handler_add</code>.</li>
   <li><b>ISR rules, still.</b> The handler keeps the 1 ms limit: <code>stop_motors()</code> and one give, with no logging and no blocking call.</li>
   <li><b>Priority stays 1.</b> At about 98% load, raising <code>bumper</code> to 2, 3 or 4 only lets an 8 ms job preempt the motor or telemetry, whose deadlines (11 ms and 105 ms) then break.</li>
   <li><b>Stack.</b> 1024 B overflows in the game ("A stack overflow in task bumper has been detected"), 1280 is the working size, and stack beyond 256 B of spare counts against the Lean star.</li></ul>
   <details><summary>Real hardware (optional)</summary>
   <ul><li><b>IRAM.</b> Put <code>IRAM_ATTR</code> on the handler and install the ISR service with <code>gpio_install_isr_service(ESP_INTR_FLAG_IRAM)</code> only if the handler must run while the flash cache is disabled (during flash writes, for example). With flags 0, <code>IRAM_ATTR</code> gives no benefit. In that case everything the handler calls, <code>stop_motors()</code> included, must also be IRAM-safe, and <code>CONFIG_GPIO_CTRL_FUNC_IN_IRAM</code> should be enabled if the <code>gpio_*</code> driver calls are used from IRAM-safe code.</li>
   <li><b>Tick rounding.</b> A notification does not depend on the tick: the wake-up happens at the give. Only the timeout argument is in ticks. Game ticks are 1 ms; the ESP-IDF default <code>CONFIG_FREERTOS_HZ</code> is 100, so <code>pdMS_TO_TICKS(5)</code> would be 0 ticks there.</li>
   <li><b>Timeout.</b> <code>portMAX_DELAY</code> waits forever and costs no CPU. A timeout of 0 turns the take into a poll; in a loop with nothing else blocking it, the task never yields and the task watchdog fires (default 5 s, <code>CONFIG_ESP_TASK_WDT_TIMEOUT_S</code>; the game compresses this to about 599 ms).</li>
   <li><b>Debounce.</b> A real strip sensor produces more edges than the two in this stage. A real handler would debounce in hardware or ignore edges inside a short window, then notify.</li></ul></details>`],

  ['7. Star: what the notification saves in RAM (optional)', `<p>In stage 7 the bumper ISR gave <code>bump_sem</code>, a <b>kernel object</b> created with <code>xSemaphoreCreateBinary()</code> and shared by handle. In the game it costs <b>96 B of RAM</b>. In real FreeRTOS a semaphore is a queue whose items have size zero (length 1 for a binary semaphore), allocated from the heap at creation. A notification uses the value already inside the task, so nothing is allocated.</p>
   ${chainDia}
   <p>Switch the design and watch the RAM figure the mission measures (the Lean star needs 19896 B or less, not counting up to 256 B of spare stack per task):</p>
   <div data-w="ramlab"></div>`],
];

export const quiz = [
  { q: 'Impacts at 150 ms and 152 ms, bumper gets the CPU at 179 ms, bump_sem is binary. What happens to the second give?', opts: ['It is queued and bumper runs twice', 'It overwrites the first give, so one wake-up remains', 'It is dropped because the slot is already full, so one wake-up remains'], a: 2, why: 'A binary semaphore holds one token. A give into a full slot returns pdFALSE and the token is not stored. The effect is one check for two impacts.', wrong: ["A binary semaphore is a queue of length 1. With the slot already full there is no room to queue a second give.", "A semaphore has no stored value to overwrite. A give into a full slot is refused and returns pdFALSE, and nothing is written.", null] },
  { q: 'The ISR calls vTaskNotifyGiveFromISR(bumper_handle, &woken) but bumper_handle is assigned after gpio_isr_handler_add. What can go wrong?', opts: ['An impact before the assignment passes a NULL handle and the system faults', 'Nothing, because the kernel looks up the task by name', 'The first impact is lost but the later ones work'], a: 0, why: 'The handler runs as soon as the interrupt is enabled and uses the handle as it finds it. Create the task, then add the handler.', wrong: [null, "The kernel does not look up a task by name for this call. The ISR simply uses whatever the variable holds at that moment.", "A NULL handle is not a quiet loss of one impact. The ISR uses it as a task pointer, which fails an assertion or crashes."] },
  { q: 'Three impacts arrive before bumper runs. It calls ulTaskNotifyTake(pdTRUE, portMAX_DELAY) once per loop. How many checks run?', opts: ['Three, one per impact', 'One, because pdTRUE clears the count to 0', 'Two, because the first give is consumed by the wake-up'], a: 1, why: 'pdTRUE resets the value to zero when the task wakes, so the burst is one wake-up. pdFALSE would decrement by one and give three.', wrong: ["Three wake-ups need pdFALSE, which takes one give per call. With pdTRUE the count is not taken one at a time.", null, "The wake-up does not consume a give by itself. pdTRUE sets the whole value to 0 when the task runs, so the burst is taken in one step."] },
  { q: 'Two tasks must both wake when a "link up" event happens. Why is a task notification the wrong tool?', opts: ['A notification goes to one task handle and has one receiver', 'A notification cannot be given from a task', 'A notification is slower than a semaphore'], a: 0, why: 'The value belongs to a single task. Waking several tasks needs an event group (or several notifications, one per handle).', wrong: [null, "A notification can be given from a task with xTaskNotifyGive(). The FromISR variants are only the interrupt versions.", "The FreeRTOS documentation says a notification is faster, not slower. Speed has nothing to do with waking two tasks."] },
  { q: 'A colleague argues for a notification because the documentation says it is about 45% faster. Which statement is accurate for this game?', opts: ['The game confirms the 45% figure with its timeline', 'The game measures only the 96 B RAM saving, the speed figure comes from the documentation', 'The notification is 45% faster only on a dual-core chip'], a: 1, why: 'The simulator charges no time for kernel calls, so both designs wake bumper at the same instants. The speed claim is the documentation\'s, not a measurement here.', wrong: ["The simulator charges no time for kernel calls, so the timeline cannot show a speed difference between the two designs.", null, "The 45% figure comes from the FreeRTOS documentation and is not tied to the number of cores."] },
  { q: 'The 8 ms thermal check now feels slow, so bumper gets priority 3. What is the consequence?', opts: ['The check finishes sooner and nothing else changes', 'The 8 ms job preempts the motor and telemetry, whose deadlines then fail', 'The ISR runs longer because bumper now shares its priority'], a: 1, why: 'The system is about 98% loaded. Priority 3 ties with the motor and outranks telemetry, so the motor gap and the telemetry gap exceed their limits. The urgent work is already done in the ISR.', wrong: ["The check costs 8 ms of work at any priority. A higher priority only changes which tasks get delayed by it.", null, "bumper is a task, not an ISR. An ISR outranks every task, and ISR timing does not depend on bumper's priority."] },
  { q: 'Mission control wants less RAM. The bumper wake-up has one ISR giving and one task taking. What is the saving of a notification over bump_sem?', opts: ['Nothing: the notification still needs a kernel object, only a different kind', 'The 96 B semaphore object, because the counter lives in the task that exists anyway', 'The stack of the bumper task, because the task no longer needs to block'], a: 1, why: 'Each task already contains a notification value. Deleting bump_sem frees 96 B and the bumper stack is unchanged.', wrong: ["A notification stores its value in the task control block, which exists anyway. No separate object is created, so there is nothing to keep.", null, "A notification does not change the bumper stack. The task still runs check_thermals() on that stack."] },
];
