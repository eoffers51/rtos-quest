// Field manual for stage 13 (ESP-IDF): two cores, pinning, shared data and critical sections.
import { svg, box, arrow, note } from '../widgets.js';

const bar = (x, y, w, cls, h = 20) => `<rect class="bx ${cls}" x="${x}" y="${y}" width="${Math.max(1, w)}" height="${h}" rx="2"/>`;
const axis = (x0, x1, y) => `<line class="ar" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" marker-end="url(#ah)"/>`;

/* ================= widgets ================= */

const frame = (title, body) => `<div class="wg"><div class="wgh">INTERACTIVE · ${title}</div>${body}</div>`;
const sl = (id, label, min, max, v, step = 1) => `<label>${label} <input type="range" data-${id} min="${min}" max="${max}" step="${step}" value="${v}"> <b data-${id}v></b></label>`;
const val = (el, id, unit = ' ms') => { const v = +el.querySelector('[data-' + id + ']').value; el.querySelector('[data-' + id + 'v]').textContent = v + unit; return v; };
const meter = (name, pct) => `<div class="lvcpu"><span>${name}</span><div class="gbar"><i class="${pct >= 100 ? 'hot' : ''}" style="width:${Math.min(100, pct)}%"></i></div><em>${pct}%</em></div>`;

// Widget 1: task board. Click a task to move it to the other core; two load bars and two idle rows follow.
// Shares are rounded for the demo: the stage 12 rover measures 95% on core 1; vision (14 ms per 50 ms) and fusion (8 ms per 50 ms) are 28% and 16%.
function taskboard(el) {
  const T = [['motor + lights', 17, 1], ['camera', 48, 1], ['sensors', 20, 1], ['bus + weather', 10, 1], ['vision', 28, 1], ['fusion', 16, 1]];
  el.innerHTML = frame('THE TASK BOARD: CLICK A TASK TO MOVE IT TO THE OTHER CORE', `<div class="wgrow" data-btns></div><div data-out></div>`);
  const draw = () => {
    el.querySelector('[data-btns]').innerHTML = T.map((t, i) => `<button class="hb ${t[2] === 0 ? 'hot' : ''}" data-i="${i}">${t[0]} ${t[1]}%: core ${t[2]}</button>`).join('');
    el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { T[+b.dataset.i][2] ^= 1; draw(); });
    const load = c => T.filter(t => t[2] === c).reduce((a, t) => a + t[1], 0);
    const l0 = load(0), l1 = load(1), idle = c => c >= 100 ? 'IDLE never runs' : 'IDLE runs ' + (100 - c) + '% of the time';
    const dead = l1 >= 100 ? 1 : l0 >= 100 ? 0 : -1;
    el.querySelector('[data-out]').innerHTML = meter('core 0', l0) + meter('core 1', l1)
      + `<p class="wgcap">IDLE0: ${idle(l0)}. IDLE1: ${idle(l1)}. ` + (dead < 0 ? `<span class="good">Both idle tasks run, so the task watchdog is fed on both cores.</span>` : `<span class="bad">E (599) task_wdt: Task watchdog got triggered. The following tasks/users did not reset the watchdog in time:<br>E (599) task_wdt:&nbsp;- IDLE${dead} (CPU ${dead})<br>The game is set to panic on this, so the chip resets. On a real board that needs CONFIG_ESP_TASK_WDT_PANIC=y; by default the watchdog only prints.</span>`)
      + ` Start of the stage: everything on core 1, vision and fusion included. Two cores add up to 200% of CPU time, but a task still gets only the core it is on.</p>`;
  };
  draw();
}

// Widget 2: how much extra work a core can take before its idle task starves.
function idlebar(el) {
  el.innerHTML = frame('HOW MUCH EXTRA WORK DOES A BUSY CORE TAKE?', `<div class="wgrow">${sl('w', 'extra work per 50 ms on core 1', 0, 20, 14)}</div><div data-out></div>`);
  const draw = () => {
    const w = val(el, 'w'), base = 47.5, load = Math.round((base + w) / 50 * 100), over = base + w >= 50;
    const X = t => 20 + t * 13;
    let ch = bar(X(0), 20, X(Math.min(50, base)), 'c') + bar(X(base), 20, X(Math.min(w, 50 - base)), 'r');
    if (!over) ch += bar(X(base + w), 20, X(50 - base - w), 'd');
    ch += note(X(0), 14, 'rover tasks: 47.5 ms', 'start') + note(X(48), 14, 'extra', 'start') + axis(20, 680, 60) + [0, 10, 20, 30, 40, 50].map(t => note(X(t), 78, t + ' ms', 'middle')).join('');
    el.querySelector('[data-out]').innerHTML = svg(700, 90, ch, 'One 50 ms period on core 1: rover tasks, extra work and the idle share')
      + meter('core 1', load) + `<p class="wgcap">${over ? `<span class="bad">Idle share 0. IDLE1 is starved and the task watchdog fires 600 ms into the run (the game scales the real 5 s default down).</span>` : `<span class="good">Idle share ${Math.round((50 - base - w) * 2)}%. IDLE1 still runs and feeds the watchdog.</span>`} With the rover at 95% the idle task has 2.5 ms in every 50. Vision needs 14 ms, fusion 8 ms. Any value from 3 ms upwards is fatal here.</p>`;
  };
  el.querySelector('input').oninput = draw; draw();
}

// Widget 3: pin or float. A floating task takes core 0 when it is free and spills to core 1 when core 0 already has something to run.
function pinfloat(el) {
  const T = [['vision', 28, 'pin0'], ['fusion', 16, 'pin0'], ['logger', 6, 'float']];
  const opts = [['pin0', 'pinned to core 0'], ['pin1', 'pinned to core 1'], ['float', 'tskNO_AFFINITY']];
  el.innerHTML = frame('PIN OR FLOAT', `<div class="wgrow">${T.map((t, i) => `<label>${t[0]} ${t[1]}% <select data-s="${i}">${opts.map(o => `<option value="${o[0]}" ${o[0] === t[2] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></label>`).join('')}<label>core 0 is <select data-busy><option value="0">quiet</option><option value="1">busy right now</option></select></label></div><div data-out></div>`);
  const draw = () => {
    const base0 = 0, base1 = 95, busy = el.querySelector('[data-busy]').value === '1';
    let l0 = base0, l1 = base1, rows = '';
    T.forEach((t, i) => {
      const m = el.querySelector(`[data-s="${i}"]`).value; let core;
      if (m === 'pin0') core = 0; else if (m === 'pin1') core = 1; else core = busy || l0 > 0 ? 1 : 0;
      if (core === 0) l0 += t[1]; else l1 += t[1];
      rows += `<li><b>${t[0]}</b> runs on core ${core}${m === 'float' ? ' (the scheduler chose; it can change from one run to the next)' : ' (always)'}</li>`;
    });
    const dead = l1 >= 100 ? 1 : l0 >= 100 ? 0 : -1;
    el.querySelector('[data-out]').innerHTML = `<ul>${rows}</ul>` + meter('core 0', l0) + meter('core 1', l1)
      + `<p class="wgcap">${dead < 0 ? '<span class="good">Both cores keep an idle share.</span>' : `<span class="bad">Core ${dead} is full: IDLE${dead} starves and task_wdt resets the chip.</span>`} The game's own run with vision floating crashes at 857 ms: it floats onto core 1 as soon as core 0 has work. The model here reduces "has work" to the two switches above.</p>`;
  };
  el.querySelectorAll('select').forEach(s => s.onchange = draw); draw();
}

// Widget 4: two windows on one record. The reader's window is 5 ms and the writer's w ms (elapsed time: the 3 ms read and 4 ms write of CPU time are stretched by time slices); the record is torn when the windows overlap.
function overlap(el) {
  el.innerHTML = frame('WHEN IS A READ TORN?', `<div class="wgrow">${sl('o', 'fusion starts reading at', 0, 20, 9)}${sl('w', 'vision writes for', 1, 8, 8)}<label><input type="checkbox" data-d> reader delays 20 ms first</label></div><div data-out></div>`);
  const draw = () => {
    const o0 = val(el, 'o'), w = val(el, 'w'), dly = el.querySelector('[data-d]').checked, o = dly ? o0 + 20 : o0, ws = 12, rl = 5;
    const hit = o < ws + w && ws < o + rl;
    const X = t => 80 + t * 17;
    let ch = note(74, 36, 'fusion', 'end') + note(74, 76, 'vision', 'end');
    ch += bar(X(o), 24, X(rl) - X(0), hit ? 'r' : 'g') + note(X(o), 18, 'read_hazard()', 'start') + bar(X(ws), 64, X(w) - X(0), hit ? 'r' : 'c') + note(X(ws), 58, 'publish_hazard()', 'start');
    ch += axis(80, 690, 110) + [0, 5, 10, 15, 20, 25, 30].map(t => note(X(t), 128, t, 'middle')).join('') + note(690, 146, 'ms into the 50 ms cycle', 'end');
    el.querySelector('[data-out]').innerHTML = svg(700, 152, ch, 'Read window and write window on the hazard record')
      + `<p class="wgcap">${hit ? `<span class="bad">Torn read in every cycle: 19 in 1 s.</span> The reader gets the distance of frame N and the bearing of frame N-1.` : `<span class="good">The windows do not overlap, 0 torn reads.</span>${dly ? ' But the read now ends ' + (o + rl) + ' ms into the cycle, late, and any change of timing brings the race back. A delay is luck, not a lock.' : ' Today. A slower task or a longer write moves the windows into each other.'}`} The game starts the read at 9 ms and the write at about 12 ms. The two tasks alternate by time slice, so the 3 ms read and 4 ms write of CPU time stretch to windows of 5 ms and 8 ms on the clock (the defaults here); the game scales the copies up from microseconds so that the collision fits a 1 s test. Two cores overlap in real parallel. On one core, equal-priority tasks alternate every tick and overlap the same way.</p>`;
  };
  el.querySelectorAll('input').forEach(i => i.oninput = draw); draw();
}

// Widget 5: pick the protection for four sections.
function protect(el) {
  const S = [
    ['16-byte record copy, a task on the other core reads it', 'cs', 'A copy of a few microseconds that never blocks: a spinlock critical section. A mutex would cost more (a context switch) than the copy itself.'],
    ['10 ms image analysis that reads a shared frame buffer', 'mx', 'A section of milliseconds, which may be preempted: a mutex. A critical section would mask most interrupts on this core for 10 ms and make the other core spin for 10 ms.'],
    ['counter incremented by an ISR and read by a task', 'cs', 'An ISR cannot take a mutex. Use a critical section with the _ISR variant in the ISR, and a normal one in the task.'],
    ['SPI transaction of 2 ms that waits for a DMA interrupt', 'mx', 'The code blocks inside the section. Blocking in a critical section is forbidden: only a mutex may be held while a task waits.']];
  const O = [['cs', 'critical section (spinlock)'], ['mx', 'mutex'], ['pr', 'a higher priority for the writer']];
  el.innerHTML = frame('PICK THE PROTECTION', S.map((s, i) => `<div class="wgrow"><label>${s[0]} <select data-p="${i}"><option value="">choose...</option>${O.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select></label><span data-v="${i}"></span></div>`).join('') + `<p class="wgcap">No section is right with a priority: a higher priority decides who runs first, not who touches the data. On two cores both tasks run at once whatever their priorities are.</p>`);
  el.querySelectorAll('select').forEach(s => s.onchange = () => {
    const i = +s.dataset.p, v = s.value, out = el.querySelector(`[data-v="${i}"]`);
    out.innerHTML = !v ? '' : v === S[i][1] ? `<span class="good">Right.</span> ${S[i][2]}` : v === 'pr' ? `<span class="bad">Wrong.</span> A priority is not a lock. The stage's "vision above fusion" case has 0 torn reads and fails on timing instead, and "fusion above vision" only hides the race.` : `<span class="bad">Wrong.</span> ${S[i][2]}`;
  });
}

// Widget 6: how long the lock is held decides how late the reader is.
function holdtime(el) {
  el.innerHTML = frame('HOW LONG IS THE LOCK HELD?', `<div class="wgrow">${sl('h', 'vision holds hz_lock for', 4, 14, 4)}</div><div data-out></div>`);
  const draw = () => {
    const h = val(el, 'h'), s = 14 - h, r = 8, rl = 3;                 // vision's lock window [s, 14]; fusion wants the lock at 8 for 3 ms
    const rs = s <= r ? 14 : r, re = rs + rl, delay = re + 0;           // reader waits for vision when vision already holds the lock
    const vs = s <= r ? s : Math.max(s, re), ve = s <= r ? 14 : vs + h;
    const X = t => 80 + t * 17, late = delay > 15;
    let ch = note(74, 36, 'fusion', 'end') + note(74, 76, 'vision', 'end');
    ch += bar(X(r), 24, X(rs - r) - X(0), 'blko') + bar(X(rs), 24, X(rl) - X(0), late ? 'r' : 'g') + note(X(rs), 18, 'read_hazard()', 'start');
    ch += bar(X(vs), 64, X(ve - vs) - X(0), 'c') + note(X(vs), 58, 'lock held by vision', 'start');
    ch += `<line class="dash" x1="${X(15)}" y1="14" x2="${X(15)}" y2="104"/>` + note(X(15) + 5, 102, 'limit 15 ms', 'start');   // at the foot of the line: the top is where the read label sits
    ch += axis(80, 690, 110) + [0, 5, 10, 15, 20, 25].map(t => note(X(t), 128, t, 'middle')).join('');
    el.querySelector('[data-out]').innerHTML = svg(700, 136, ch, 'Lock held by vision against the read of fusion')
      + `<p class="wgcap">Reader done ${delay} ms after its slot. ${late ? `<span class="bad">Over the 15 ms limit: fusion waited ${rs - r} ms for the lock.</span> Locking the whole analysis serialises the two tasks.` : `<span class="good">Inside the 15 ms limit.</span> A short section leaves the lock free when the reader asks.`} The game measured 13 ms for a lock around the publish and 17 ms for a lock around the analysis; this model is idealised and its step sits at 6 ms.</p>`;
  };
  el.querySelector('input').oninput = draw; draw();
}

export const widgets = { taskboard, idlebar, pinfloat, overlap, protect, holdtime };

/* ================= diagrams ================= */

// 1. Two lanes
const lanesDia = svg(720, 190, (() => {
  let s = note(10, 24, 'core 0 (PRO_CPU)', 'start') + note(10, 112, 'core 1 (APP_CPU)', 'start');
  s += box(10, 32, 120, 44, 'IDLE0|priority 0', 'd') + box(140, 32, 150, 44, 'ISRs, system tasks|(Wi-Fi, esp_timer)', 'isr') + box(300, 32, 410, 44, 'empty: 0% load in the stage 13 start', 'd');
  s += box(10, 120, 120, 44, 'IDLE1|priority 0', 'd') + box(140, 120, 70, 44, 'motor|lights', 'c') + box(216, 120, 70, 44, 'camera', 'c') + box(292, 120, 70, 44, 'sensors', 'c') + box(368, 120, 70, 44, 'bus|weather', 'c') + box(444, 120, 80, 44, 'vision', 'a') + box(530, 120, 80, 44, 'fusion', 'a');
  s += `<line class="dash" x1="10" y1="96" x2="710" y2="96"/>`;
  return s;
})(), 'Two cores: core 0 almost empty, core 1 holding every rover task');

// 2. The start chart
const wdtDia = svg(720, 170, (() => {
  const X = t => 90 + t * 0.9; let s = note(84, 34, 'IDLE0', 'end') + note(84, 74, 'IDLE1', 'end') + note(84, 114, 'vision', 'end');
  s += bar(X(0), 22, X(599) - X(0), 'isr') + `<text class="at" x="${X(300)}" y="36" text-anchor="middle">runs every ms</text>`;
  s += `<rect class="bx blko" x="${X(0)}" y="62" width="${X(599) - X(0)}" height="20" rx="2"/>` + note(X(300), 76, 'never ran: nothing fed the watchdog', 'middle');
  [20, 70, 120, 170, 220, 270, 320, 370, 420, 470, 520, 570].forEach(t => { s += bar(X(t), 102, 3, 'c'); });
  s += `<line class="dash" x1="${X(599)}" y1="14" x2="${X(599)}" y2="134"/>` + note(X(599), 150, 'E (599) task_wdt: IDLE1 (CPU 1)', 'end');
  s += axis(90, 690, 160);
  return s;
})(), 'Start chart: IDLE0 runs, IDLE1 never runs, reset at 599 ms');

// 3. Pinned and floating arrows: two columns (core 0 left, core 1 right), the floating task in the gap between them, no crossing lines
const pinDia = svg(720, 190, (() => {
  let s = box(20, 10, 300, 40, 'core 0', 'g') + box(400, 10, 300, 40, 'core 1', 'a');
  s += box(20, 140, 140, 40, 'vision|pinned 0', 'c') + box(180, 140, 140, 40, 'fusion|pinned 0', 'c') + box(450, 140, 140, 40, 'old task|pinned 1', 'c') + box(280, 85, 160, 40, 'logger|tskNO_AFFINITY', 'd');
  s += arrow(90, 140, 90, 50) + arrow(250, 140, 250, 50) + arrow(520, 140, 520, 50);
  s += `<line class="ar dash" x1="320" y1="85" x2="300" y2="50" marker-end="url(#ah)"/><line class="ar dash" x1="400" y1="85" x2="420" y2="50" marker-end="url(#ah)"/>`;
  return s;
})(), 'Pinned tasks have one arrow, a task without affinity can land on either core');

// 4. Overlapping windows
const tornDia = svg(720, 160, (() => {
  const X = t => 90 + t * 24; let s = note(84, 36, 'fusion', 'end') + note(84, 86, 'vision', 'end');
  s += bar(X(0), 24, X(5), 'r') + note(X(0), 18, 'read 59 to 64', 'start') + bar(X(3), 74, X(8), 'r') + note(X(3), 68, 'publish 62 to 70', 'start');
  s += `<rect class="bx blko" x="${X(3)}" y="22" width="${X(2)}" height="72" rx="2" fill-opacity=".3"/>` + note(X(4), 114, 'overlap: distance of frame N,', 'middle') + note(X(4), 129, 'bearing of frame N-1', 'middle');
  s += axis(90, 700, 144) + [0, 2, 4, 6, 8, 10].map(t => note(X(t), 158, 59 + t, 'middle')).join('');
  return s;
})(), 'The hazard read from 59 to 64 ms overlaps the publish from 62 to 70 ms');

// 5. Decision table (HTML so that cells wrap; used in the going-further box of section 5)
const tdS = 'style="border:1px solid rgba(255,255,255,.18);padding:6px 8px;vertical-align:top"';
const tableDia = `<table style="width:100%;border-collapse:collapse;font-size:.86rem;margin:8px 0" aria-label="Which protection fits a section, by length and by who touches the data">`
  + [['', 'a few microseconds', 'milliseconds, may block'], ['task only (same core)', 'critical section or mutex', 'mutex'], ['task on the other core', 'critical section (spinlock)', 'mutex'], ['ISR involved', 'critical section, _ISR variant', 'split the work: the ISR sends to a task']]
    .map((r, i) => '<tr>' + r.map(t => i === 0 ? `<th ${tdS}>${t}</th>` : `<td ${tdS}>${t}</td>`).join('') + '</tr>').join('') + '</table>';

// 5b. Mutex wait (section 5): fusion asks while vision holds the lock
const mutexDia = svg(720, 130, (() => {
  const X = t => 90 + t * 24; let s = note(84, 36, 'fusion', 'end') + note(84, 86, 'vision', 'end');
  s += bar(X(0), 74, X(4), 'c') + note(X(0), 68, 'vision holds hz_lock', 'start');
  s += bar(X(1), 24, X(3), 'blko') + note(X(1), 18, 'fusion: take blocks', 'start') + bar(X(4), 24, X(3), 'g') + note(X(4), 56, 'read, then give', 'start');
  s += axis(90, 700, 110);
  return s;
})(), 'A mutex makes fusion block while vision holds hz_lock, then fusion reads');

// 6. Solution chart
const solDia = svg(720, 170, (() => {
  const X = t => 90 + t * 24; let s = note(84, 36, 'fusion', 'end') + note(84, 86, 'vision', 'end');
  s += bar(X(0), 24, X(3), 'g') + note(X(0), 18, 'read, lock free', 'start') + bar(X(3), 24, X(2), 'rdy') + note(X(5), 38, 'fusionStep, no lock', 'start');
  s += bar(X(0), 74, X(3), 'rdy', 20) + bar(X(3), 74, X(1), 'blko') + bar(X(4), 74, X(4), 'c') + note(X(4), 68, 'publish under hz_lock', 'start');
  s += note(X(0) , 114, 'visionStep before this point: no lock held', 'start') + axis(90, 700, 130) + [0, 2, 4, 6, 8].map(t => note(X(t), 148, '+' + t * 2, 'middle')).join('');
  return s;
})(), 'Solution: the lock covers only the read and the publish, so they run one after the other');

/* ================= realCode ================= */

export const realCode = `// main/rover_main.c   (ESP-IDF v5.x)   stage 13: vision and fusion on core 0, hazard record behind hz_lock
#include <stdint.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "rover.h"   // rover helpers (not shown): vision_step(), fusion_step(), the tasks of stages 1 to 12

static const char *TAG = "rover";

// 16 bytes: four 32-bit words. One word is written atomically, the whole record is not.
typedef struct {
    float    distance_m;
    float    bearing_deg;
    uint32_t frame;
    uint32_t reserved;
} hazard_t;

static hazard_t          s_hazard;       // shared by vision (writer) and fusion (reader)
static SemaphoreHandle_t hz_lock;        // mutex: created before the tasks that use it

#define VISION_PERIOD_MS 50

// The game scales these to 4 ms (write) and 3 ms (read) so that two cores and a time slice can collide inside a 1 s test.
// On real hardware a 16-byte copy takes microseconds, and a spinlock critical section is the usual protection (see the notes).
static void publish_hazard(const hazard_t *h) { s_hazard = *h; }
static void read_hazard(hazard_t *h)          { *h = s_hazard; }

static void vision_task(void *arg)
{
    TickType_t last = xTaskGetTickCount();
    for (;;) {
        xTaskDelayUntil(&last, pdMS_TO_TICKS(VISION_PERIOD_MS));   // fixed 50 ms grid, as in stage 3
        hazard_t h = vision_step();                         // 10 ms of analysis: NO lock held here

        xSemaphoreTake(hz_lock, portMAX_DELAY);             // lock only the record, not the analysis
        publish_hazard(&h);                                 // the 4 ms critical section of the game
        xSemaphoreGive(hz_lock);
    }
}

static void fusion_task(void *arg)
{
    TickType_t last = xTaskGetTickCount();
    for (;;) {
        xTaskDelayUntil(&last, pdMS_TO_TICKS(VISION_PERIOD_MS));
        vTaskDelay(pdMS_TO_TICKS(8));                       // "the frame will be ready by then": a guess, so the lock below is still needed

        hazard_t h;
        xSemaphoreTake(hz_lock, portMAX_DELAY);
        read_hazard(&h);                                    // copy out under the lock
        xSemaphoreGive(hz_lock);

        fusion_step(&h);                                    // process the copy OUTSIDE the lock
    }
}

void app_main(void)
{
    // ... GPIO setup and the tasks of stages 1 to 12, all still pinned to core 1 (unchanged) ...

    hz_lock = xSemaphoreCreateMutex();                      // returns NULL if the heap is full: check it in real code

    // Stack sizes are bytes in ESP-IDF. Priority 2 for both, as in the game.
    // The last argument is the core: 0, 1 or tskNO_AFFINITY. The stage 13 start had 1 here and reset the chip.
    // Return values (pdPASS or errCOULD_NOT_ALLOCATE_REQUIRED_MEMORY) are not checked here for brevity; check == pdPASS in real code.
    xTaskCreatePinnedToCore(vision_task, "vision", 2816, NULL, 2, NULL, 0);
    xTaskCreatePinnedToCore(fusion_task, "fusion", 1600, NULL, 2, NULL, 0);

    ESP_LOGI(TAG, "vision and fusion on core %d", 0);
}

// Build notes
//   Core placement: xTaskCreate() creates a task with tskNO_AFFINITY. xTaskCreatePinnedToCore(..., core) pins it to 0 or 1.
//   Short-copy alternative (microseconds, never blocks, other core or ISR involved):
//       static portMUX_TYPE hz_mux = portMUX_INITIALIZER_UNLOCKED;
//       portENTER_CRITICAL(&hz_mux);  s_hazard = h;  portEXIT_CRITICAL(&hz_mux);
//       from an ISR: portENTER_CRITICAL_ISR(&hz_mux) ... portEXIT_CRITICAL_ISR(&hz_mux)
//     The game has only the mutex; it does not model the spinlock.
//   Per-core idle watchdog: idf.py menuconfig > Component config > ESP System Settings > Task Watchdog:
//       CONFIG_ESP_TASK_WDT_CHECK_IDLE_TASK_CPU0 and CONFIG_ESP_TASK_WDT_CHECK_IDLE_TASK_CPU1, timeout CONFIG_ESP_TASK_WDT_TIMEOUT_S (default 5 s; the game uses 600 ms).
//   Tick: the game uses 1000 Hz (CONFIG_FREERTOS_HZ=1000). The ESP-IDF default is 100 Hz.
//   idf.py build flash monitor`;

/* ================= manual ================= */

export const manual = [
  ['1. Two brains, one rover', `<p>The ESP32 has two CPU cores: core 0 (PRO_CPU) and core 1 (APP_CPU). ESP-IDF's FreeRTOS runs <b>one scheduler over both cores</b> (symmetric multiprocessing, SMP). A task is on the ready list of its priority and each core picks the highest-priority ready task that is allowed to run on it. A task runs on <b>one core at a time</b>, so two tasks really do run at the same moment when they are on different cores.</p>
   ${lanesDia}
   <p class="cap">Core 1 holds every rover task and sits at 95% before vision and fusion arrive. Each core has its own idle task, <code>IDLE0</code> and <code>IDLE1</code>, at priority 0. A core with nothing else to do runs its idle task.</p>
   <ul><li><b>What lives where by default.</b> Interrupts that the system registers, the Wi-Fi and Bluetooth stacks and the <code>esp_timer</code> task sit mostly on core 0. The main task that calls <code>app_main()</code> starts on core 0 as well (setting <code>CONFIG_ESP_MAIN_TASK_AFFINITY_CPU0</code>, the default). In the game, ISRs run on core 0 and the timer service floats.</li>
   <li><b>Rover so far.</b> Every task from stages 1 to 12 was created pinned to core 1. Core 0 only runs ISRs, so it sits at 0% while core 1 is at 95%.</li>
   <li><b>Single-core chips.</b> The ESP32-S2 and ESP32-C3 have one core. A single-core build of an ESP32 uses <code>CONFIG_FREERTOS_UNICORE</code>, and then the core argument means nothing.</li>
   <li><b>Two cores are not 2x speed.</b> They add up to 200% of CPU time, but a task cannot be split. Work must be distributed by you, and shared data needs care (sections 4 and 5).</li></ul>
   <p>Move the rover's tasks between the cores:</p>
   <div data-w="taskboard"></div>`],

  ['2. Why the rover reset', `<p>The vision team added two tasks: <code>vision</code> (10 ms of analysis plus a 4 ms publish every 50 ms) and <code>fusion</code> (8 ms of work every 50 ms). That is 22 ms in 50 ms, about 44% of a core. They copied the template of the other tasks and pinned both to core 1, which already runs at 95%. 95% plus 44% is more than the core has.</p>
   ${wdtDia}
   <p class="cap">The idle task of core 1 never gets the CPU. IDLE0 runs every millisecond, because core 0 is empty.</p>
   <ul><li><b>The idle task is a heartbeat.</b> With <code>CONFIG_ESP_TASK_WDT_CHECK_IDLE_TASK_CPU0</code> and <code>..._CPU1</code> set, the task watchdog expects each idle task to run within the timeout. A core that is full never runs its idle task and the watchdog fires. The game then resets the chip, as a board does with <code>CONFIG_ESP_TASK_WDT_PANIC=y</code>; by default the watchdog only prints the message below. The default timeout is 5 s (<code>CONFIG_ESP_TASK_WDT_TIMEOUT_S</code>); the game scales it to 600 ms.</li>
   <li><b>The message names the core.</b> <code>E (599) task_wdt: Task watchdog got triggered. The following tasks/users did not reset the watchdog in time:</code> and, on its own next line, <code>E (599) task_wdt:  - IDLE1 (CPU 1)</code>. IDLE1 means core 1 is full; IDLE0 would mean a task on core 0 never blocks. The exact wording varies with the ESP-IDF version (older releases print "tasks" instead of "tasks/users").</li>
   <li><b>No other symptom.</b> Before the reset nothing is logged. The only evidence is the idle row of the chart and the load of each core.</li>
   <li><b>Free CPU time is on the other core.</b> Core 0 has about 100% idle. Pin the new tasks there and the rover has room.</li></ul>
   <p>Add work to a core until its idle share is gone:</p>
   <div data-w="idlebar"></div>`],

  ['3. Pinning and affinity', `<p><code>xTaskCreatePinnedToCore(fn, name, stack, arg, prio, &amp;handle, core)</code> takes the core as its last argument: <code>0</code>, <code>1</code> or <code>tskNO_AFFINITY</code>. The task then runs only on that core. <code>xTaskCreate()</code> is the same call with <code>tskNO_AFFINITY</code>: the scheduler may run the task on either core.</p>
   ${pinDia}
   <p class="cap">Solid arrow: always this core. Dashed arrows: the logger runs on whichever core the scheduler picks, and the choice changes with the load.</p>
   <ul><li><b>tskNO_AFFINITY guarantees nothing about the core.</b> Whichever core is free and picks it first, runs it. In the game core 0 is picked first, but when core 0 already has something to run the task goes to core 1. A floating <code>vision</code> therefore lands on the full core and the chip resets at 857 ms. Not at once: the crash waits for the moment where core 0 is busy.</li>
   <li><b>When to pin.</b> Pin to keep work off the core that handles Wi-Fi or an interrupt-heavy driver, to put cache-hot or timing-sensitive work on a known core, and to balance load by hand. Pin when a core is nearly full, as here.</li>
   <li><b>When to float.</b> Leave the affinity free for light, non-critical work where either core is fine. Remember that the answer to "where does it run" is then different on every boot, which makes timing measurements harder to repeat.</li>
   <li><b>Pin all of a group.</b> In the stage, fusion alone on core 1 is enough to reset the chip, and vision alone on core 1 too. Both tasks must move.</li></ul>
   <p>Try pinned and floating tasks against a quiet and a busy core 0:</p>
   <div data-w="pinfloat"></div>`],

  ['4. Now it really overlaps', `<p>After the move the chip no longer resets, and a new fault appears: <code>fusion</code> reads the hazard record at 59 ms and <code>vision</code> starts writing it at 62 ms. On every one of the 19 cycles the reader gets a record that is half old and half new (a <b>torn read</b>): the distance of frame N and the bearing of frame N-1.</p>
   ${tornDia}
   <p class="cap">The windows overlap by 2 ms. Two cores run both tasks at the same moment. On one core the same bug happens, because tasks of equal priority alternate every tick.</p>
   <ul><li><b>Why a record tears.</b> A 16-byte record is copied in several steps, and another core can run between them. Only atomic operations, such as compare-and-set, are guaranteed safe to share without a lock.</li>
   <li><b>Priority does not prevent it.</b> On two cores a lower-priority task keeps running while a higher one runs on the other core. In the game, fusion above vision hides the race and vision above fusion moves the read past its 15 ms limit.</li>
   <li><b>A delay does not fix it.</b> <code>vTaskDelay(20)</code> in the reader moves the read to 70 ms today and the windows no longer meet. A slower task, the other core or another period brings the race back, and here the read is late. Timing luck is not synchronisation.</li>
   <li><b>Scale.</b> A real 16-byte copy takes microseconds, not 4 ms, so a real collision is rare and very hard to reproduce. The stage stretches the copy so that one second is enough. The game uses 1 ms ticks; ESP-IDF's default is 100 Hz.</li></ul>
   <p>Move the windows and watch the overlap:</p>
   <div data-w="overlap"></div>`],

  ['5. Locking the hazard record', `<p>This is the fix for the torn read of section 4, and the mission needs only a tool you already know: the mutex from stages 6, 11 and 12. Create <code>hz_lock</code> with <code>xSemaphoreCreateMutex()</code>, take it around the 4 ms copy in vision and around the 3 ms read in fusion.</p>
   ${mutexDia}
   <p class="cap">While vision holds <code>hz_lock</code>, fusion blocks instead of reading half a record. When vision gives the lock, fusion reads the whole record.</p>
   <ul><li><b>What the mutex does here.</b> A task that cannot take it <b>blocks</b>, and the core goes to something else. The mutex has an owner and priority inheritance (stages 11 and 12), so only the owner can give it. It works across cores: fusion on core 0 and vision on core 0 or 1 are both held back.</li>
   <li><b>Priorities are not locks.</b> A priority decides who is chosen to run, not who touches the data. In the stage, a higher priority for vision leaves 0 torn reads but makes fusion wait behind the whole 10 ms analysis. A higher priority for fusion hides the race by shifting the windows.</li>
   <li><b>The game has only the mutex</b> (<code>hz_lock</code>). Its 4 ms copy is a scaled-up stand-in for a copy of a few microseconds.</li></ul>
   <details class="deeper"><summary>Go deeper: critical sections, spinlocks and ISRs (not needed for the mission)</summary>
   <p>On real hardware a 16-byte copy takes microseconds, and a mutex then costs more than the copy. Two tools protect shared data; both make the other side wait, but in different ways.</p>
   ${tableDia}
   <ul><li><b>Critical section</b> (<code>portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED; portENTER_CRITICAL(&amp;mux); ...; portEXIT_CRITICAL(&amp;mux);</code>). It masks interrupts on <b>this</b> core up to the syscall priority level (<code>configMAX_SYSCALL_INTERRUPT_PRIORITY</code>, so high-priority interrupts can still fire) and spins on the spinlock if the other core holds it. No task and no interrupt below that level runs on this core inside it, so it must last microseconds and must never call anything that blocks.</li>
   <li><b>ISRs.</b> A mutex cannot be taken from an ISR. In an ISR use <code>portENTER_CRITICAL_ISR</code> and <code>portEXIT_CRITICAL_ISR</code>, or hand the work to a task.</li>
   <li><b>One core is not safe by habit.</b> Disabling interrupts on one core does not stop the other core. On the ESP32 the spinlock is what protects against it, so <code>portDISABLE_INTERRUPTS()</code> alone is not enough on two cores.</li>
   <li><b>The game does not model</b> the spinlock or the interrupt latency a long critical section causes.</li></ul>
   <p>Choose the protection for four sections:</p>
   <div data-w="protect"></div></details>`],

  ['6. Keep it short, and find it in the field', `<p>The solution takes <code>hz_lock</code> around the 4 ms publish and around the read, and does the 10 ms analysis and the fusion step outside the lock.</p>
   ${solDia}
   <p class="cap">In the solution the lock is free when fusion asks for it. The read finishes 13 ms after its slot, the limit is 15 ms.</p>
   <ul><li><b>Lock the data, not the work.</b> Hold the lock for the copy only. Locking the whole analysis (<code>take; vision_step(); publish; give</code>) gives no torn reads and makes fusion wait: the read ends 17 ms after the slot, over the 15 ms limit. Keeping the lock through <code>fusion_step()</code> also works in this stage, but it holds the lock for work that does not need it.</li>
   <li><b>Never sleep or block while holding it.</b> No <code>vTaskDelay</code>, no queue wait, no second lock out of order (the lock order of stage 11 still holds). A task that waits with the lock stops everyone who needs it.</li>
   <li><b>A timeout is not a fix.</b> A timed-out take restarts the task in this simulator. No correct program here uses one.</li>
   <li><b>Tools on a real board.</b> <code>vTaskList()</code> prints state, priority and stack high-water mark per task, and the core if <code>CONFIG_FREERTOS_VTASKLIST_INCLUDE_COREID</code> is on. <code>vTaskList()</code> and <code>vTaskGetRunTimeStats()</code> are built only with <code>CONFIG_FREERTOS_USE_TRACE_FACILITY</code> and <code>CONFIG_FREERTOS_USE_STATS_FORMATTING_FUNCTIONS</code>. <code>xTaskGetCoreID(handle)</code> and <code>xPortGetCoreID()</code> tell a task where it runs. <code>vTaskGetRunTimeStats()</code> shows CPU time per task and needs <code>CONFIG_FREERTOS_GENERATE_RUN_TIME_STATS</code>. Segger SystemView shows both cores side by side.</li>
   <li><b>Watchdog options.</b> <code>CONFIG_ESP_TASK_WDT_CHECK_IDLE_TASK_CPU0</code> and <code>..._CPU1</code> choose which idle tasks are watched. Turn neither off to silence a reset: the reset is the report that a core is full.</li></ul>
   <p>Change how long the lock is held:</p>
   <div data-w="holdtime"></div>`],
];

/* ================= quiz ================= */

export const quiz = [
  { q: 'Two tasks have the same priority and are pinned to different cores. How many run at the same moment?', opts: ['One, because tasks of the same priority take turns', 'Two, one on each core', 'None until the idle tasks have run'], a: 1, why: 'Each core runs its own highest-priority ready task. Tasks on different cores run in parallel, and priority only orders tasks that share a core.', wrong: ["Taking turns happens between tasks that share one core. One scheduler runs over both cores and each core picks its own highest-priority ready task, so equal priority does not serialise tasks on different cores.", null, "Idle tasks run at priority 0, only on a core that has nothing else ready. They are never something other tasks wait for: a ready task on its own core runs straight away."] },
  { q: 'The chip resets with a task watchdog message. Which line tells you which core is full?', opts: ['The IDLE line: IDLE1 (CPU 1) means core 1 never ran its idle task', 'The first line, E (599) task_wdt, because 599 is the core number', 'The line naming the task that used the most CPU time'], a: 0, why: 'The watchdog watches the idle task of every core. The one that did not run is named with its CPU number, and that core is the full one.', wrong: [null, "The number in brackets, 599, is the time stamp of the message in ms, not a core number. The core is given as CPU 0 or CPU 1 next to a task name.", "The watchdog does not rank tasks by CPU time. It names the tasks that did not feed it, and that is a starved idle task, not the task that hogged the core."] },
  { q: 'What does tskNO_AFFINITY guarantee about the core a task runs on?', opts: ['Core 0, because it is picked first', 'Nothing: it can run on either core, and which one can change with the load', 'Core 1, because core 0 is reserved for interrupts'], a: 1, why: 'No affinity means the scheduler may use either core. In the game a floating vision lands on the full core 1 once core 0 is busy and resets the chip.', wrong: ["Core 0 is only where the scheduler often looks first. No affinity gives no promise, and when core 0 already has something to run the task goes to core 1.", null, "Core 0 is not closed to tasks: pinned tasks run there next to Wi-Fi and system tasks. Without pinning the scheduler may pick either core, so no fixed core can be assumed."] },
  { q: 'The reader gets a torn record. A developer adds vTaskDelay(pdMS_TO_TICKS(20)) before the read and the torn reads stop. Why is that not a fix?', opts: ['It only moves the two windows apart for now; other timing brings the race back, and here the read is late', 'It is a fix, because a task that waits cannot be preempted', 'It does not stop them, the torn reads continue as before'], a: 0, why: 'A delay is timing luck. Nothing makes the reader wait for the writer, so a slower writer or another period overlaps them again, and the read now misses its 15 ms deadline.', wrong: [null, "Preemption is not the issue: the writer runs on the other core at the same time, whether or not the reader waits. A delay makes the reader wait for a time, not for the writer, so it is not synchronisation.", "In this case the delay does move the read to 70 ms and the windows no longer meet, so the reads are clean today. The point is what the delay does not guarantee."] },
  { q: 'In the stage, vision publishes the hazard record in a 4 ms copy while fusion reads it from the other core. The reads are torn. What fixes it without making fusion late?', opts: ['Raise the priority of vision, so that it always runs first', 'Take hz_lock (a mutex) around the 4 ms copy in vision and around the read in fusion, and nothing else', 'Take hz_lock around the whole 10 ms analysis, so that the frame cannot change'], a: 1, why: 'A mutex makes the reader wait for the 4 ms copy and no longer. A priority does not stop two cores from touching the record at once, and a lock around the analysis serialises the tasks and makes the read end after its 15 ms limit.', wrong: ["Priority decides which task a core picks, not who touches the data. On two cores the lower-priority task keeps running on its own core, and a higher priority for vision makes fusion wait behind the whole 10 ms analysis.", null, "This does stop the torn reads, but it holds the lock for 10 ms of work that is not part of the record. Fusion has to wait for all of it and its read ends after the 15 ms limit."] },
  { q: 'What belongs inside the lock around the hazard record?', opts: ['The copy of the record only; the analysis and fusion run outside', 'The whole analysis, so that nothing else can disturb the frame', 'The copy and a short vTaskDelay, to be sure the writer is finished'], a: 0, why: 'The lock must protect the data and nothing else. Holding it across the 10 ms analysis made fusion wait and miss its 15 ms limit, and sleeping inside a lock stops everyone who needs it.', wrong: [null, "That locks the work, not the data. Holding the lock through the 10 ms analysis makes fusion wait and miss its 15 ms limit.", "Never sleep while holding a lock. A vTaskDelay inside it keeps every other task that needs the lock waiting, and it adds nothing: the lock already makes the reader wait until the copy is done."] },
];
