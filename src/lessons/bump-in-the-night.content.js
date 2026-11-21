// Field manual for stage 7 (ESP-IDF): interrupts, binary semaphores and deferred work.
import { svg, box, arrow, note } from '../widgets.js';

const bar = (x, y, w, cls, h = 20) => `<rect class="bx ${cls}" x="${x}" y="${y}" width="${Math.max(1.5, w)}" height="${h}" rx="2"/>`;
const axis = (x0, x1, y) => `<line class="ar" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" marker-end="url(#ah)"/>`;
const frame = (title, body) => `<div class="wg"><div class="wgh">INTERACTIVE · ${title}</div>${body}</div>`;
const sl = (id, label, min, max, v) => `<label>${label} <input type="range" data-${id} min="${min}" max="${max}" value="${v}"> <b data-${id}v></b></label>`;
const val = (el, id, unit = ' ms') => { const v = +el.querySelector('[data-' + id + ']').value; el.querySelector('[data-' + id + 'v]').textContent = v + unit; return v; };

/* ================= diagrams ================= */

// 1. polling against an interrupt (one message: polling can miss a short event, an interrupt cannot)
const pollDia = svg(720, 200, (() => {
  const X = t => 110 + t * 11; let s = note(100, 34, 'task polls', 'end') + note(100, 100, 'interrupt', 'end');
  for (let k = 0; k <= 5; k++) s += `<line class="tick" x1="${X(k * 10)}" y1="22" x2="${X(k * 10)}" y2="46"/>` + note(X(k * 10), 16, 'read pin', 'middle');
  s += bar(X(12), 62, X(15) - X(12), 'r', 14) + note(X(13.5), 58, 'bump: 3 ms', 'middle');
  s += `<line class="dash" x1="${X(12)}" y1="60" x2="${X(12)}" y2="126"/>` + bar(X(12), 90, 4, 'g', 20) + note(X(12) + 8, 128, 'ISR starts within microseconds', 'start');
  s += axis(110, 700, 148) + [0, 10, 20, 30, 40, 50].map(t => note(X(t), 164, t + ' ms', 'middle')).join('');
  s += note(110, 190, 'The polls at 10 and 20 ms both see "not pressed": the bump is gone.', 'start');
  return s;
})(), 'A polling task misses a bump shorter than its period; an interrupt reacts at once');

// 2. priority stack with the ISR on top
const stackDia = svg(720, 200, (() => {
  let s = box(40, 12, 300, 30, 'ISR  onBump (hardware interrupt)', 'isr') + note(356, 32, 'above every task, whatever its priority', 'start');
  [['beacon, heart  (4)', 'a'], ['motor  (3)', 'c'], ['telemetry, imu, thermo  (2)', 'c'], ['camera, nav, mapper, radio  (1)', 'c'], ['idle  (0)', 'd']].forEach(([t, c], i) => { s += box(40, 52 + i * 26, 300, 24, t, c) + (i === 0 ? note(356, 68, 'tasks: highest-priority Ready one runs', 'start') : ''); });
  s += arrow(24, 168, 24, 20) + note(34, 184, 'more urgent', 'start');
  s += note(356, 120, 'While the ISR runs, the scheduler does not run.', 'start') + note(356, 138, 'No task is switched in, not even priority 4.', 'start') + note(356, 156, 'The tick interrupt itself is held off too.', 'start');
  return s;
})(), 'An ISR sits above every task priority');

// 3. deferred processing
const deferDia = svg(720, 120, (() =>
  box(10, 30, 120, 54, 'bumper pin|edge', 'c') + arrow(130, 57, 180, 57)
  + box(180, 30, 170, 54, 'ISR onBump (short)|stop_motors()|give bump_sem', 'isr') + arrow(350, 57, 410, 57, 'give', 0, -8)
  + box(410, 30, 120, 54, 'bump_sem|binary, 1 flag', 'a') + arrow(530, 57, 580, 57, 'take', 0, -8)
  + box(580, 30, 130, 54, 'bumper task (1)|check_thermals()|8 ms, low priority', 'g')
  + note(180, 104, 'microseconds, urgent', 'start') + note(710, 104, 'milliseconds, can wait', 'end')
)(), 'The ISR does the urgent part, a semaphore wakes a task for the rest');

// 4. a binary semaphore is a flag
const flagDia = svg(720, 130, (() =>
  box(20, 20, 150, 40, 'empty (0)', 'd') + arrow(170, 40, 270, 40, 'give', 0, -8) + box(270, 20, 150, 40, 'full (1)', 'g')
  + arrow(420, 40, 520, 40, 'take', 0, -8) + `<path class="ar" d="M95 60 C 95 100, 345 100, 345 62" fill="none" marker-end="url(#ah)"/>`
  + note(220, 112, 'second give while full: nothing changes (returns pdFALSE)', 'middle')
  + note(540, 30, 'take on empty: the task', 'start') + note(540, 48, 'blocks, asleep, until', 'start') + note(540, 66, 'a give arrives', 'start')
)(), 'A binary semaphore holds one flag');

// 5. give from ISR and the yield
const yieldDia = svg(720, 210, (() => {
  const X = t => 110 + t * 22; let s = note(100, 34, 'motor (3)', 'end') + note(100, 84, 'ISR', 'end') + note(100, 134, 'handler (5)', 'end');
  s += bar(X(0), 22, X(3) - X(0), 'c') + bar(X(3.6), 22, X(8) - X(3.6), 'c');
  s += bar(X(3), 72, X(3.6) - X(3), 'isr', 20) + bar(X(3.6), 122, X(6) - X(3.6), 'g');
  s += note(X(3), 66, 'give', 'middle') + note(X(3.8), 112, 'woken = pdTRUE', 'start') + note(X(3.8), 66, 'portYIELD_FROM_ISR(woken)', 'start');
  s += note(X(0), 170, 'The motor is interrupted. The handler has the higher priority,', 'start') + note(X(0), 190, 'so the switch happens on the way out of the ISR.', 'start');
  return s;
})(), 'The ISR gives the semaphore and asks for a switch on exit');

// 6. priority ladder with the bumper at 1
const ladderDia = svg(720, 190, (() => {
  const row = (y, t, c, w) => box(20, y, 190, 26, t, c) + bar(220, y + 3, w, c === 'g' ? 'g' : 'c', 20);
  let s = row(12, 'motor  (3)  10 ms steps', 'c', 420) + row(44, 'telemetry  (2)  every 101 ms', 'c', 300) + row(76, 'bumper  (1)  8 ms per bump', 'g', 120);
  s += note(20, 128, 'System load is 98%. The 8 ms thermal check must fit into', 'start') + note(20, 146, 'the 2% left over, so it goes at the bottom.', 'start');
  s += note(20, 168, 'Priority 2 shares with telemetry. Priority 3 and 4 preempt the motor.', 'start');
  return s;
})(), 'The handler task belongs at the bottom of the priority ladder');

// 7. contact bounce
const bounceDia = svg(720, 130, (() => {
  const X = t => 60 + t * 12; let p = `M${X(0)} 90 L${X(4)} 90 L${X(4)} 30 L${X(5.5)} 30 L${X(5.5)} 90 L${X(6.5)} 90 L${X(6.5)} 30 L${X(7.5)} 30 L${X(7.5)} 90 L${X(8.2)} 90 L${X(8.2)} 30 L${X(30)} 30`;
  return `<path class="ar" d="${p}" fill="none"/>` + [4, 5.5, 6.5, 7.5, 8.2].map(t => `<line class="dash" x1="${X(t)}" y1="20" x2="${X(t)}" y2="100"/>`).join('')
    + note(X(10), 80, 'one press, five edges within 4 ms', 'start') + note(X(0), 120, 'idle (pin high)', 'start') + note(X(14), 14, 'each edge fires the ISR once', 'start');
})(), 'A mechanical switch bounces for a few milliseconds');

/* ================= widgets ================= */

/* poll or interrupt: deterministic. A bump lasts `len` ms from `at`; a task reads the pin at 0, P, 2P ... */
function polllab(el) {
  el.innerHTML = frame('POLL OR INTERRUPT? ONE BUMP, ONE PIN', `<div class="wgrow">${sl('p', 'poll every', 1, 50, 10)}${sl('len', 'bump lasts', 1, 20, 3)}${sl('at', 'bump starts at', 0, 49, 12)}</div><div data-out></div>`);
  const draw = () => {
    const P = val(el, 'p'), len = val(el, 'len'), at = val(el, 'at');
    const polls = []; for (let t = 0; t <= 60; t += P) polls.push(t);
    const seen = polls.find(t => t >= at && t < at + len);
    const X = t => 60 + t * 10; let s = note(54, 34, 'polling', 'end') + note(54, 84, 'bump', 'end');
    polls.forEach(t => { const hit = t === seen; s += `<line class="${hit ? 'dash' : 'tick'}" x1="${X(t)}" y1="20" x2="${X(t)}" y2="44" ${hit ? 'style="stroke:#3fe08f;stroke-width:3"' : ''}/>`; });
    s += bar(X(at), 72, X(at + len) - X(at), 'r', 18) + axis(60, 690, 116) + [0, 10, 20, 30, 40, 50, 60].map(t => note(X(t), 132, t + ' ms', 'middle')).join('');
    el.querySelector('[data-out]').innerHTML = svg(720, 140, s, 'Poll instants against a bump')
      + `<p class="wgcap">Polling: ` + (seen === undefined ? `<b class="bad">missed.</b> The pin was read at none of the instants while the bump was active.` : `<b class="good">seen after ${seen - at} ms.</b>`)
      + ` Worst-case reaction of a poll loop is its period (<b>${P} ms</b>), and the poll costs CPU time even when nothing happens. An interrupt reacts in <b class="good">microseconds</b> (a few µs on the ESP32; the exact figure depends on the interrupt level and cache state) and costs nothing while the pin is quiet.</p>`;
  };
  el.addEventListener('input', draw); draw();
}

/* ISR length: motor task steps every 10 ms (grid), a bump at 150 ms stops the world for L ms. Telemetry gap 101 + L when the ISR hits its wake-up (the measured case). */
function isrlab(el) {
  el.innerHTML = frame('HOW LONG MAY AN INTERRUPT RUN? THE START CODE, BUMP AT 150 ms', `<div class="wgrow">${sl('l', 'ISR runs for', 0, 20, 8)}</div><div data-out></div>`);
  const draw = () => {
    const L = val(el, 'l'), steps = []; let from = 120, to = 200, prev = null, gap = 0;
    for (let t = from; t <= to; t += 10) { const at = (L > 0 && t >= 150 && t < 150 + L) ? 150 + L : t; steps.push(at); }
    steps.forEach((t, i) => { if (i) gap = Math.max(gap, t - steps[i - 1]); });
    const X = t => 90 + (t - from) * 7.5; let s = note(44, 34, 'motor', 'end') + note(44, 84, 'ISR', 'end');
    steps.forEach(t => { s += bar(X(t), 22, 5, 'c', 20); });
    if (L > 0) s += bar(X(150), 72, X(150 + L) - X(150), 'isr', 20) + note(X(150), 66, 'onBump ' + L + ' ms', 'start');
    s += axis(90, 700, 116) + [120, 140, 160, 180, 200].map(t => note(X(t), 132, t, 'middle')).join('') + note(66, 132, 'ms', 'end');
    const tel = L > 0 ? 101 + L : 101;
    el.querySelector('[data-out]').innerHTML = svg(720, 140, s, 'Motor steps around the ISR')
      + `<p class="wgcap">Longest gap between motor steps: <b class="${gap <= 11 ? 'good' : 'bad'}">${gap} ms</b> (limit 11). Telemetry gap if the bump lands in its wake-up: <b class="${tel <= 105 ? 'good' : 'bad'}">${tel} ms</b> (limit 105). `
      + (L === 8 ? 'This is the start code: 18 ms and 109 ms are what the game reports.' : L <= 1 ? 'Short enough that every stage 2 limit holds.' : 'No task can run while the ISR does. The ISR time is added to every task in its path.') + '</p>';
  };
  el.addEventListener('input', draw); draw();
}

/* priority picker: measured table from the game (bumper priority against motor and telemetry gaps), plus the ISR-only variant */
function priolab(el) {
  const M = { 0: [10, 101], 1: [10, 101], 2: [10, 110], 3: [12, 112], 4: [18, 109] };
  el.innerHTML = frame('WHERE DOES THE 8 ms THERMAL CHECK GO? MEASURED IN THE GAME', `<div class="wgrow"><label>work runs in <select data-wh><option value="task">a bumper task, take on bump_sem</option><option value="isr">the ISR itself</option></select></label>${sl('pr', 'bumper priority', 1, 4, 1, '')}</div><div data-out></div>`);
  const draw = () => {
    const where = el.querySelector('[data-wh]').value, pr = val(el, 'pr', ''), r = where === 'isr' ? [18, 109] : M[pr];
    const rows = [['motor  (3)', 'c', 10, 11, r[0], 'ms between steps'], ['telemetry  (2)', 'c', 101, 105, r[1], 'ms between packets']];
    let s = ''; rows.forEach(([n, c, base, lim, v, u], i) => {
      const y = 14 + i * 42, X = x => 170 + x * 3; s += note(160, y + 15, n, 'end') + bar(170, y, v * 3, v > lim ? 'r' : c, 22) + `<line class="dash" x1="${X(lim)}" y1="${y - 4}" x2="${X(lim)}" y2="${y + 26}"/>` + note(170 + v * 3 + 6, y + 16, v + ' ' + u, 'start');
    });
    el.querySelector('[data-out]').innerHTML = svg(720, 100, s, 'Motor and telemetry gaps for the chosen design')
      + `<p class="wgcap">` + (where === 'isr' ? '<b class="bad">Work inside the ISR:</b> every bump freezes the motor for 8 ms.' : pr === 1 ? '<b class="good">Priority 1:</b> the only plain-priority choice that keeps stage 2. The system is 98% loaded, so the 8 ms has to run in the idle gaps.'
        : pr === 2 ? '<b class="bad">Priority 2:</b> shares with telemetry. Round robin cuts the 8 ms into slices that delay telemetry.' : pr === 3 ? '<b class="bad">Priority 3:</b> ties with the motor and preempts telemetry.' : '<b class="bad">Priority 4:</b> preempts the motor for the whole 8 ms.')
      + ` Limits: motor 11 ms, telemetry 105 ms. These numbers were measured with the game's kernel.</p>`;
  };
  el.addEventListener('input', draw); draw();
}

/* give/take stepper for a binary or a counting semaphore */
function semlab(el) {
  el.innerHTML = frame('GIVE AND TAKE: BINARY OR COUNTING?', `<div class="wgrow"><label>type <select data-t><option value="bin">binary</option><option value="cnt">counting (max 8)</option></select></label><button class="hb" data-g>GIVE (an ISR)</button><button class="hb" data-k>TAKE (the task)</button><button class="hb" data-r>RESET</button></div><div data-out></div>`);
  let n = 0, log = [];
  const cap = () => el.querySelector('[data-t]').value === 'bin' ? 1 : 8;
  const draw = () => {
    let s = ''; for (let i = 0; i < 8; i++) s += box(30 + i * 40, 20, 34, 34, i < n ? '1' : '', i < n ? 'g' : 'd') + (i >= cap() ? `<line class="ar" x1="${30 + i * 40}" y1="20" x2="${64 + i * 40}" y2="54" style="stroke:#ff5d4d"/>` : '');
    el.querySelector('[data-out]').innerHTML = svg(360, 70, s, 'Semaphore count') + `<p class="wgcap">Count: <b>${n}</b> of ${cap()}. ${log.slice(-4).map(x => `<span>${x}</span>`).join(' · ')}</p>`;
  };
  const t = el.querySelector('[data-t]');
  el.querySelector('[data-g]').onclick = () => { if (n < cap()) { n++; log.push('give: pdTRUE'); } else log.push('<b class="bad">give: pdFALSE (lost)</b>'); draw(); };
  el.querySelector('[data-k]').onclick = () => { if (n > 0) { n--; log.push('take: pdTRUE, handler runs'); } else log.push('take: blocks, task sleeps'); draw(); };
  el.querySelector('[data-r]').onclick = () => { n = 0; log = []; draw(); };
  t.onchange = () => { n = Math.min(n, cap()); log = []; draw(); }; draw();
}

/* yield: does the handler run when the ISR returns? */
function yieldlab(el) {
  el.innerHTML = frame('portYIELD_FROM_ISR: WHEN DOES THE HANDLER RUN?', `<div class="wgrow"><label>interrupted task <select data-run><option value="3">motor (3)</option><option value="1">camera (1)</option><option value="0">idle (0)</option></select></label>${sl('hp', 'handler priority', 1, 5, 5, '')}<label>ISR ends with <select data-y><option value="1">portYIELD_FROM_ISR(woken)</option><option value="0">no yield call</option></select></label><label>tick <select data-hz><option value="1">1 ms (1000 Hz, game)</option><option value="10">10 ms (100 Hz, ESP-IDF default)</option></select></label>${sl('ph', 'ISR ends this far into a tick', 0, 9, 0)}</div><div data-out></div>`);
  const draw = () => {
    const run = +el.querySelector('[data-run]').value, hp = val(el, 'hp', ''), y = el.querySelector('[data-y]').value === '1', tk = +el.querySelector('[data-hz]').value;
    const ph = Math.min(val(el, 'ph'), tk - 1), woken = hp > run;
    let msg;
    if (!woken) msg = `<b>woken = pdFALSE:</b> the handler (priority ${hp}) is not above the interrupted task (priority ${run}). The ISR returns to that task, and the handler runs when it blocks. Yielding would change nothing.`;
    else if (y) msg = `<b class="good">woken = pdTRUE and the yield is requested:</b> the handler runs <b>0 ms</b> after the ISR returns.`;
    else msg = `<b class="bad">woken = pdTRUE but nobody yields:</b> the interrupted task keeps the CPU until the next tick (or until it blocks). Handler starts <b>${tk - ph} ms</b> late. At the default 10 ms tick that is a whole tick of dead time.`;
    el.querySelector('[data-out]').innerHTML = `<p class="wgcap">${msg}</p>`;
  };
  el.addEventListener('input', draw); el.addEventListener('change', draw); draw();
}

/* contact bounce against a binary or a counting semaphore. 1 ms step simulation, no randomness. */
function bouncelab(el) {
  el.innerHTML = frame('CONTACT BOUNCE: ONE PRESS, MANY GIVES', `<div class="wgrow">${sl('n', 'edges per press', 1, 8, 5, '')}${sl('sp', 'edge spacing', 1, 4, 1)}${sl('w', 'handler work', 1, 12, 8)}<label>semaphore <select data-t><option value="1">binary</option><option value="8">counting (max 8)</option></select></label></div><div data-out></div>`);
  const draw = () => {
    const n = val(el, 'n', ''), sp = val(el, 'sp'), w = val(el, 'w'), cap = +el.querySelector('[data-t]').value;
    const edges = Array.from({ length: n }, (_, i) => 10 + i * sp), end = 10 + n * sp + n * w + 20;
    let cnt = 0, busyTo = -1; const runs = []; let lost = 0;
    for (let t = 0; t < end; t++) {
      if (busyTo === t) busyTo = -1;
      if (edges.includes(t)) { if (cnt < cap) cnt++; else lost++; }
      if (busyTo < 0 && cnt > 0) { cnt--; busyTo = t + w; runs.push([t, t + w]); }
    }
    const X = t => 60 + t * (640 / end); let s = note(54, 34, 'edges', 'end') + note(54, 84, 'handler', 'end');
    edges.forEach(t => { s += `<line class="tick" x1="${X(t)}" y1="18" x2="${X(t)}" y2="42"/>`; });
    runs.forEach(([a, b]) => { s += bar(X(a), 72, X(b) - X(a), 'g', 20); });
    s += axis(60, 704, 112) + note(60, 128, '0 ms') + note(704, 128, end + ' ms', 'end');
    el.querySelector('[data-out]').innerHTML = svg(720, 134, s, 'Edges and handler runs')
      + `<p class="wgcap">Edges: <b>${n}</b>. Handler runs: <b class="${runs.length === 1 ? 'good' : 'bad'}">${runs.length}</b>. Gives lost: <b>${lost}</b>. `
      + (cap === 1 ? '' + `A binary semaphore merges edges that arrive while it is full or the handler is busy into one pending run. Here the handler ran ${runs.length} time${runs.length === 1 ? '' : 's'} for ${n} edge${n === 1 ? '' : 's'}. With fast bounce and a long handler that is a feature.` + '' : 'A counting semaphore counts every edge, so each bounce becomes a full 8 ms handler run. It is the right tool for counting events, and the wrong one for a noisy switch.') + '</p>';
  };
  el.addEventListener('input', draw); el.addEventListener('change', draw); draw();
}

export const widgets = { polllab, isrlab, priolab, semlab, yieldlab, bouncelab };

/* ================= reference code ================= */

export const realCode = `// main/rover_main.c   (ESP-IDF v5.x)   stage 7: a bumper interrupt that stops the motors at once and defers the thermal check
// Build: idf.py build flash monitor
// Needs CONFIG_FREERTOS_HZ=1000 (the game's tick). The ESP-IDF default is 100 (10 ms tick).
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include "driver/gpio.h"
#include "esp_attr.h"     // IRAM_ATTR
#include "esp_log.h"
#include "rover.h"        // stop_motors(), check_thermals() and the earlier stages' helpers (not shown)

#define PIN_BUMPER     GPIO_NUM_4
#define PRIO_BUMPER    1      // the 8 ms of work goes at the BOTTOM: the system is 98% loaded and every higher priority breaks stage 2

static const char *TAG = "bump";
static SemaphoreHandle_t bump_sem;       // binary: starts EMPTY. The ISR gives it, the bumper task takes it.

// Interrupt service routine. Runs above every task, with the scheduler frozen. Do the urgent part only, then get out.
static void IRAM_ATTR onBump(void *arg)
{
    BaseType_t woken = pdFALSE;
    stop_motors();                               // must be ISR-safe: a register write, no blocking, no ESP_LOGx, no malloc
    xSemaphoreGiveFromISR(bump_sem, &woken);     // the FromISR variant never blocks; sets woken if a higher-priority task became Ready
    portYIELD_FROM_ISR(woken);                   // switch to that task on the way out of the ISR, not at the next tick
}

// The deferred part: a normal task, preemptible, allowed to block and to log.
static void bumper_task(void *arg)
{
    for (;;) {
        xSemaphoreTake(bump_sem, portMAX_DELAY); // asleep, no CPU, until the ISR gives
        check_thermals();                        // 8 ms, about 400 B of stack in the game
        ESP_LOGW(TAG, "bump handled, thermals checked");
    }
}

// beacon, heart, motor, camera, telemetry, spectro, nav, mapper, science, radio, imu and thermo (with i2c_lock): unchanged from stage 6.

void app_main(void)
{
    // ... GPIO setup and the tasks from stage 6 ...
    bump_sem = xSemaphoreCreateBinary();                              // 96 B of heap; returns NULL if the heap is full
    if (bump_sem == NULL) { ESP_LOGE(TAG, "no heap for bump_sem"); return; }

    // Create the semaphore and the task BEFORE the interrupt can fire.
    // Stack: 768 base + 400 for check_thermals() = 1168, so 1280 leaves 112 B. That is the game's figure.
    // Real code that calls ESP_LOGx usually needs about 2048 B or more, because formatted logging is stack-hungry.
    if (xTaskCreate(bumper_task, "bumper", 1280, NULL, PRIO_BUMPER, NULL) != pdPASS) {
        ESP_LOGE(TAG, "task create failed");
        return;
    }

    gpio_config_t io = {
        .pin_bit_mask = 1ULL << PIN_BUMPER,
        .mode         = GPIO_MODE_INPUT,
        .pull_up_en   = GPIO_PULLUP_ENABLE,
        .intr_type    = GPIO_INTR_NEGEDGE,        // the switch pulls the pin low when pressed
    };
    ESP_ERROR_CHECK(gpio_config(&io));
    ESP_ERROR_CHECK(gpio_install_isr_service(ESP_INTR_FLAG_IRAM));    // one shared GPIO interrupt; ESP_INTR_FLAG_IRAM keeps it serviced with the cache off, so each handler must be IRAM_ATTR
    ESP_ERROR_CHECK(gpio_isr_handler_add(PIN_BUMPER, onBump, NULL));  // registers onBump for this pin
}

// Build notes
//   The game fires onBump at fixed times (150, 420 and 703 ms); a real board fires it on each falling edge of the pin.
//   The game's thermal check is 8 ms inside the handler on purpose: real ISRs should take microseconds.
//   Never call xSemaphoreGive(), xSemaphoreTake(), vTaskDelay(), printf or ESP_LOGx from an ISR. Use the ...FromISR() functions.
//   With ESP_INTR_FLAG_IRAM the ISR and everything it calls must live in IRAM (IRAM_ATTR) and may touch only IRAM or DRAM data (DRAM_ATTR for constants).
//   stop_motors() must be declared IRAM_ATTR too. The FreeRTOS ...FromISR() functions must also be in IRAM
//   (the default, unless CONFIG_FREERTOS_PLACE_FUNCTIONS_INTO_FLASH is on).
//   Real switches bounce: add a debounce (see the manual) before relying on one edge per press.`;

/* ================= manual ================= */

export const manual = [
  ['1. A switch that cannot wait', `<p>The bumper is a switch on a GPIO pin. A bump may last a few milliseconds, and the motors must stop at once. There are two ways to learn that the pin changed.</p>
   ${pollDia}
   <ul><li><b>Polling:</b> a task reads the pin every P ms. The worst-case reaction is P. A bump shorter than P can fall between two reads and be <b>missed entirely</b>. A shorter P costs CPU on every read, even when nothing happens, and a task that polls at 1 ms forces a wake-up (a context switch) 1000 times a second.</li>
   <li><b>Interrupt:</b> the GPIO hardware detects the edge and the CPU jumps to a handler within microseconds, no matter what the tasks are doing. Nothing runs and nothing is spent while the pin is quiet.</li></ul>
   <details class="real"><summary>Real hardware: setting up the GPIO interrupt</summary><p>On ESP-IDF v5 the pin is set up with <code>gpio_config()</code> (field <code>intr_type</code>: <code>GPIO_INTR_NEGEDGE</code>, <code>POSEDGE</code>, <code>ANYEDGE</code>, <code>LOW_LEVEL</code>, <code>HIGH_LEVEL</code>), then <code>gpio_install_isr_service(flags)</code> once and <code>gpio_isr_handler_add(pin, handler, arg)</code> per pin. The service has one shared low-level handler that calls yours. The full code is in the reference solution.</p></details>
   <p>Change the poll period and the bump length to see when polling misses:</p>
   <div data-w="polllab"></div>`],

  ['2. What happens inside an interrupt', `<p>An interrupt service routine (ISR) is not a task. The CPU stops whatever it was running, saves a few registers and runs the handler. <b>The scheduler does not run until the handler returns</b>, so no task can be switched in, whatever its priority. On a real dual-core ESP32 this holds for the core that took the interrupt only; the game simulates one core.</p>
   ${stackDia}
   <ul><li><b>The cost goes to everyone.</b> In the start code the ISR runs the 8 ms thermal check. For 8 ms the CPU belongs to the ISR. The motor, with its 10 ms period, steps 18 ms apart, and telemetry slips from 101 to 109 ms. Both stage 2 promises break, though no task did anything wrong.</li>
   <li><b>ISRs cannot block.</b> There is no task to put to sleep. <code>xSemaphoreTake()</code>, <code>vTaskDelay()</code>, a mutex, <code>malloc()</code> and <code>ESP_LOGx()</code> are all forbidden in an ISR. In the game, a plain <code>give</code> in the ISR crashes with "xSemaphoreGive() was called inside an ISR". Only the <code>...FromISR()</code> API is allowed.</li>
   <li><b>An ISR must not touch flash.</b> In the game, a <code>logToFlash</code> call in the ISR crashes with "Cache disabled but cached memory region accessed". The Real hardware box says why.</li></ul>
   <details class="real"><summary>Real hardware: IRAM and the interrupt watchdog</summary><p><b><code>IRAM_ATTR</code>.</b> Code on the ESP32 is normally fetched from flash through a cache. While the flash is being written (OTA, NVS, a file system), the cache is off. An ISR in flash that fires then reads a cache that is off and the chip panics. Put ISR code in internal RAM with <code>IRAM_ATTR</code> (and constants with <code>DRAM_ATTR</code>), and call only functions that are in IRAM as well.</p>
   <p><b>Watchdog.</b> The interrupt watchdog (<code>CONFIG_ESP_INT_WDT</code>) resets the chip if the tick interrupt stops running on a core. The timeout is a Kconfig value, <code>CONFIG_ESP_INT_WDT_TIMEOUT_MS</code>, about 300 ms by default on the ESP32 and different on other configurations. An 8 ms ISR does not trip it, but it ruins the task deadlines long before.</p></details>
   <p>Make the ISR longer and watch the motor gap:</p>
   <div data-w="isrlab"></div>`],

  ['3. Keep the ISR short: defer the work', `<p>The standard pattern splits the job in two. The ISR does only what must happen at once (stop the motors: a register write, 0 ms in the game) and then <b>signals a task</b>. The task does the slow part at a priority chosen for it.</p>
   ${deferDia}
   <ul><li>The ISR in the solution is two calls: <code>stop_motors()</code> and <code>xSemaphoreGiveFromISR()</code>. The longest ISR is below 1 ms, which is the stage's first goal.</li>
   <li>The 8 ms <code>check_thermals()</code> moves into <code>bumper_task</code>. It is now a normal task: other tasks preempt it and it can use the full API.</li>
   <li>The reaction to the bump is still immediate where it matters (motors stop within 3 ms) and the follow-up happens 29 to 39 ms later in the game, which is well inside the 100 ms goal.</li>
   <li>Rule of thumb: an ISR does the minimum to keep hardware happy (clear the cause, grab a timestamp or a byte, stop an actuator), and defers everything else.</li></ul>
   <p>See where the 8 ms lands in each design:</p>
   <div data-w="priolab"></div>`],

  ['4. Binary semaphores: a flag between two contexts', `<p>A semaphore is a counter with a wait list. <code>xSemaphoreCreateBinary()</code> makes one that holds <b>0 or 1</b> and starts at <b>0</b> (empty). <code>give</code> sets it to 1. <code>take</code> returns at once if it is 1 and sets it to 0, otherwise the task <b>blocks</b> until a give arrives or the timeout ends.</p>
   ${flagDia}
   <ul><li><b>A signal, not a lock.</b> A mutex (stage 6) has an owner: the task that took it must give it back, and the kernel raises the owner's priority to avoid priority inversion. A binary semaphore has no owner and no priority inheritance. One side gives, the other side takes. That is why it can be given from an ISR and taken in a task.</li>
   <li><b>It remembers one event.</b> Give twice before the task takes and the second give returns <code>pdFALSE</code>: still one wake-up. Use <code>xSemaphoreCreateCounting(max, initial)</code> when every event must be counted (the game's alternative uses max 8).</li>
   <li>Cost in the game: 96 B of heap for the control block, same as the mutex. <code>xSemaphoreCreateBinary()</code> returns <code>NULL</code> when the heap is full, so check it.</li>
   <li>The game starts the player with <code>bump_sem</code> already created, and the player's job is to use it: <code>giveISR</code> in the ISR, <code>take</code> in the new task.</li></ul>
   <p>Press GIVE several times, then TAKE, with each type:</p>
   <div data-w="semlab"></div>`],

  ['5. xSemaphoreGiveFromISR and the yield', `<p>Inside the kernel, give moves the waiting task from the Blocked list to the Ready list. If that task has a <b>higher priority than the task that was running when the interrupt hit</b>, the best choice is to run it as soon as the ISR is done. The kernel cannot switch inside the ISR, so it reports the need through an out parameter.</p>
   ${yieldDia}
   <pre>BaseType_t woken = pdFALSE;
// woken becomes pdTRUE if the handler outranks the task
xSemaphoreGiveFromISR(bump_sem, &amp;woken);
// pdTRUE: switch tasks as the ISR exits
portYIELD_FROM_ISR(woken);</pre>
   <ul><li><b>Why <code>woken</code> exists:</b> a plain give-from-ISR can only wake a task. Whether a switch is useful depends on priorities, and the ISR is the only place that knows when it is done.</li>
   <li><b>Without the yield call</b> the handler is Ready but the interrupted task is returned to. The handler starts on the next tick, or when that task blocks. On a 100 Hz build that can be 10 ms of dead time.</li>
   <li><b>With the solution's priority 1</b>, <code>woken</code> is <code>pdFALSE</code> while the motor or any other higher task is running, so no switch happens. The handler runs when the CPU becomes free. That is the intended behaviour for deferred work, and the reason the check lands 29 to 39 ms after the bump.</li></ul>
   <details class="real"><summary>Real hardware: the yield call</summary><p>Pass the flag: <code>portYIELD_FROM_ISR(woken)</code>. Older ESP-IDF code often used the no-argument form, which always requests a yield, even when no higher-priority task was woken.</p></details>
   <p>Try different priorities and tick rates:</p>
   <div data-w="yieldlab"></div>`],

  ['6. Where the handler task belongs', `<p>The handler is a task like any other and it needs a priority. The urgent part already happened in the ISR, so the handler can be the least urgent task. In the game the system is <b>98% loaded</b> (stage 6 left 2% free), and the thermal check adds 8 ms three times in 1000 ms.</p>
   ${ladderDia}
   <ul><li><b>Priority 1 works.</b> It runs only when nothing above it wants the CPU. Motor gap stays 10 ms, telemetry 101 ms.</li>
   <li><b>Priority 2</b> shares with telemetry. Equal-priority tasks that are Ready take turns on each tick (round robin, <code>configUSE_TIME_SLICING</code>, on by default in ESP-IDF). Telemetry gets cut into slices and its gap grows to 110 ms (limit 105).</li>
   <li><b>Priority 3</b> ties with the motor: gap 12 ms (limit 11). <b>Priority 4</b> preempts the motor for the whole 8 ms: gap 18 ms.</li>
   <li>The wrong instinct is "an important event, so an important task". The event was important; the ISR already handled that. What the task does afterwards has its own, lower, deadline.</li>
   <li><b>Stack:</b> the handler calls <code>check_thermals()</code>, which needs 400 B in the game. 768 + 400 = 1168 B, so the solution uses 1280. 1024 overflows and crashes with "A stack overflow in task bumper has been detected".</li>
   <li><b>Never poll.</b> A handler written as <code>xSemaphoreTake(bump_sem, 0)</code> in a loop without a delay never blocks. At 100% CPU the idle task starves and <code>task_wdt</code> fires. Take with <code>portMAX_DELAY</code>, or add a delay.</li></ul>
   <p>The picker from section 3 shows the measured gaps for each priority:</p>
   <div data-w="priolab"></div>`],

  ['7. Contact bounce (going further)', `<p>A mechanical switch does not change cleanly. The contacts chatter for a few milliseconds and the pin shows a burst of edges. Each edge fires the ISR. The game has no bounce, so the mission stays simple, but real hardware will show it.</p>
   ${bounceDia}
   <ul><li><b>A binary semaphore is a natural filter.</b> If five gives arrive while the handler is busy or has not run yet, the semaphore holds one, so the handler runs fewer times than there are edges (try fast edges with a long handler). A counting semaphore would run it five times.</li>
   <li><b>Software debounce:</b> in the handler task, after the take, wait 10 to 20 ms (<code>vTaskDelay</code>) and then read the pin. Do it in the task, never in the ISR, where waiting is not allowed.</li></ul>
   <details class="real"><summary>Real hardware: filters and re-arming</summary><p><b>Hardware filter:</b> the pin glitch filter (<code>gpio_new_pin_glitch_filter()</code>, then <code>gpio_glitch_filter_enable()</code>) removes pulses shorter than two IO_MUX clock cycles, which is nanoseconds, and the width is not configurable. The original ESP32 has no pin glitch filter. It removes spikes, not millisecond bounce. An RC filter (10 kΩ, 100 nF) or a Schmitt trigger on the pin works against real bounce.</p>
   <p><b>Re-arming:</b> disable the pin's interrupt in the ISR with <code>gpio_intr_disable()</code> and re-enable it from the task after the debounce time. With <code>ESP_INTR_FLAG_IRAM</code>, enable <code>CONFIG_GPIO_CTRL_FUNC_IN_IRAM</code> so it is safe while the cache is off.</p></details>
   <p>Add edges and compare the semaphore types:</p>
   <div data-w="bouncelab"></div>`],
];

export const quiz = [
  { q: 'A bump lasts 3 ms and a task polls the bumper pin every 10 ms. What can happen?', opts: ['The task always reads the pin while the bump is active', 'The bump can fall between two reads and never be seen', 'The kernel holds the bump until the next poll arrives'], a: 1, why: 'A poll sees only the instant it reads. A 3 ms pulse that starts just after a read ends before the next one, so it is lost. An interrupt would catch it.', wrong: ["A poll sees only the instant when it reads the pin. If the bump starts and ends between two reads, no read lands inside it.", null, "The kernel does not watch the pin for you. A switch that is back at rest before the next poll leaves no trace unless an interrupt caught the edge."] },
  { q: 'The ISR runs an 8 ms check and the motor task steps every 10 ms. A bump lands exactly on a motor step. What happens to the motor?', opts: ['The motor task preempts the ISR because its priority is 3', 'The kernel splits the ISR into 1 ms slices for the motor', 'The motor step is late by the ISR time: 18 ms between steps'], a: 2, why: 'The scheduler does not run during an ISR, so no priority can preempt it. The step waits until the ISR returns. (On a real dual-core ESP32 this holds for the core that took the interrupt; the game simulates one core.)', wrong: ["A higher priority cannot preempt an ISR. The scheduler does not run until the handler returns, so task priorities do not apply while it runs.", "The kernel never cuts an ISR into slices. It runs to its end and every task waits for it.", null] },
  { q: 'Where does the 8 ms thermal check belong?', opts: ['In a task woken by the ISR, at a low priority', 'In the ISR, because it is part of the bump response', 'In a task at priority 4, so it is handled quickly'], a: 0, why: 'The urgent part (stop the motors) is in the ISR. The 8 ms of work has a deadline of 100 ms and goes in a task that does not disturb the others.', wrong: [null, "An ISR blocks every task for as long as it runs. 8 ms there breaks the motor and telemetry deadlines, and the check only has a 100 ms goal.", "Priority 4 would preempt the motor for the whole 8 ms and break its gap. An urgent event does not make the follow-up work urgent."] },
  { q: 'Three bumps arrive before the handler task runs once. The semaphore is binary. How many times does the handler run for those three gives?', opts: ['Three, because each give wakes the task once', 'Zero, because early gives are dropped without a new edge', 'Once, because the semaphore holds a single pending flag'], a: 2, why: 'A binary semaphore remembers at most one pending give. The other two return pdFALSE and are lost. Use a counting semaphore when each event matters.', wrong: ["A binary semaphore holds 0 or 1. A give into a full slot returns pdFALSE and adds nothing, so three gives are not three wake-ups.", "Only gives into an already full slot are dropped. The first give is stored, so the handler runs at least once.", null] },
  { q: 'What does the woken flag passed to xSemaphoreGiveFromISR and portYIELD_FROM_ISR tell the kernel?', opts: ['A task above the interrupted one is Ready: switch on exit', 'The ISR has finished and interrupts can be re-enabled', 'The semaphore was already full, so the give was ignored'], a: 0, why: 'woken is set to pdTRUE only when the unblocked task outranks the task that was running. Then the yield makes the switch on ISR exit instead of at the next tick.', wrong: [null, "The hardware re-enables interrupts when the handler returns. The woken flag says nothing about that.", "A give into a full semaphore returns pdFALSE. The woken flag is a separate out parameter about task priorities."] },
  { q: 'You give the bumper task priority 2 so that it "reacts quickly". What breaks in a 98% loaded rover?', opts: ['Nothing breaks: priority 2 is the safe middle ground', 'Telemetry shares priority 2, so its gap grows past 105 ms', 'The ISR, because priority 2 sits below the ISR level'], a: 1, why: 'Equal priorities share the CPU in round robin, so telemetry is delayed by the bumper slices. The only priority that keeps stage 2 is 1.', wrong: ["At 98% load there is no safe middle. Any priority above 1 lets the 8 ms job compete with tasks that have deadlines.", null, "Interrupts are not ranked against task priorities. Any ISR outranks every task."] },
  { q: 'A switch bounces five times in 4 ms. The handler task needs 8 ms per run. Why can a binary semaphore be better than a counting one here?', opts: ['It merges edges that arrive before the take: one or two runs', 'It gives faster from an ISR than a counting semaphore does', 'It ignores every edge after the first one for good'], a: 0, why: 'A binary semaphore keeps one pending event. The bounce edges collapse into it. A counting semaphore would queue five 8 ms runs for one press.', wrong: [null, "Both types are given from an ISR at about the same cost. The difference is what is kept when gives pile up before the take.", "Later edges are not ignored for good. Once the semaphore is empty again, the next give is stored."] },
];
