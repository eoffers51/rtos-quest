// Field manual for stage 3 (ESP-IDF): ticks, drift and xTaskDelayUntil.
import { svg, box, arrow, note } from '../widgets.js';

const bar = (x, y, w, cls, h = 20) => `<rect class="bx ${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>`;
const axis = (x0, x1, y) => `<line class="ar" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" marker-end="url(#ah)"/>`;

// 1a. Where a tick comes from (one message: the chain)
const tickDia = svg(720, 76, (() => {
  return box(20, 14, 150, 44, 'periodic timer|interrupt (per core)', 'c') + arrow(170, 36, 230, 36, '1 ms', 0, -8)
    + box(230, 14, 170, 44, 'tick interrupt|xTaskIncrementTick()', 'a') + arrow(400, 36, 460, 36)
    + box(460, 14, 240, 44, 'tick count + 1; wake every task|whose wake time has been reached', 'g');
})(), 'The tick interrupt counts ticks and wakes delayed tasks');

// 1b. What a delay is made of (one message: wake only on a tick)
const wakeDia = svg(720, 160, (() => {
  const X = t => 40 + t * 62; let s = '';
  for (let t = 0; t <= 10; t++) s += `<line class="tick" x1="${X(t)}" y1="76" x2="${X(t)}" y2="92"/>` + (t % 2 === 0 ? note(X(t), 110, 'tick ' + t, 'middle') : '');
  s += axis(30, 700, 84) + bar(X(2.4), 70, X(6) - X(2.4), 'g', 12);
  s += note(X(2.4), 56, 'vTaskDelay(4) called here, 0.4 ms after tick 2', 'start') + note(X(6), 132, 'wakes at tick 6: asked for 4 ticks, got 3.6 ms', 'middle');
  return s;
})(), 'A delay ends on a tick, so it lasts less than the requested ticks');

// 2. vTaskDelay counts from the end of the work
const delayDia = svg(720, 170, (() => {
  const X = t => 110 + t * 7; let s = note(100, 35, 'vTaskDelay', 'end') + note(100, 100, 'what you wanted', 'end');
  [[0, 5, 5 + 20], [25, 30, 50], [50, 55, 75]].forEach(([a, b, c]) => { s += bar(X(a), 24, X(b) - X(a), 'c') + bar(X(b), 24, X(c) - X(b), 'd'); });
  for (let k = 0; k < 4; k++) s += bar(X(k * 20), 90, X(k * 20 + 5) - X(k * 20), 'c', 20);
  s += note(X(2.5), 18, 'work 5', 'middle') + note(X(17.5), 18, 'delay 20', 'middle') + note(X(37.5), 18, 'period 25 ms, not 20', 'middle');
  s += `<line class="dash" x1="${X(20)}" y1="60" x2="${X(20)}" y2="120"/><line class="dash" x1="${X(40)}" y1="60" x2="${X(40)}" y2="120"/><line class="dash" x1="${X(60)}" y1="60" x2="${X(60)}" y2="120"/>`;
  s += axis(110, 700, 140) + [0, 20, 40, 60, 80].map(t => note(X(t), 158, t + ' ms', 'middle')).join('');
  return s;
})(), 'With vTaskDelay the period is the work time plus the delay');

// 3. The two grids drift apart
const driftDia = svg(720, 170, (() => {
  const X = t => 110 + t * 2.9; let s = note(100, 40, 'slot k × 20 ms', 'end') + note(100, 100, 'real start k', 'end');
  for (let k = 0; k < 9; k++) {
    s += bar(X(k * 20) - 1, 28, 2, 'a', 20) + bar(X(k * 25), 90, 8, 'c', 20);
    if (k > 0) s += note(X(k * 25) + 4, 80, '+' + k * 5, 'middle');
  }
  s += note(X(0), 18, 'ideal grid: 50 Hz', 'start') + note(X(70), 130, 'lateness grows by the work time on every lap', 'start');
  s += axis(110, 710, 148) + [0, 50, 100, 150, 200].map(t => note(X(t), 164, t + ' ms', 'middle')).join('');
  return s;
})(), 'The real sample grid walks away from the ideal grid');

// 4. xTaskDelayUntil keeps a mark
const untilDia = svg(780, 160, (() => {
  const X = t => 150 + t * 7.5; let s = note(112, 38, 'task', 'end') + note(112, 95, 'last (mark)', 'end');
  [5, 8, 3, 6].forEach((w, k) => { s += bar(X(k * 20), 26, X(w) - X(0), 'c') + bar(X(k * 20 + w), 26, X(20 - w) - X(0), 'd'); s += note(X(k * 20 + w + (20 - w) / 2), 20, 'sleeps ' + (20 - w), 'middle'); });
  for (let k = 0; k <= 4; k++) s += `<line class="dash" x1="${X(k * 20)}" y1="50" x2="${X(k * 20)}" y2="108"/>` + box(X(k * 20) - 28, 78, 56, 24, 'last=' + k * 20, 'a');
  s += axis(150, 760, 130) + [0, 20, 40, 60, 80].map(t => note(X(t), 148, t + ' ms', 'middle')).join('');
  return s;
})(), 'xTaskDelayUntil sleeps until a mark that advances by a fixed period');

// 5. Jitter: scatter around the grid, no walk-away
const jitterDia = svg(720, 130, (() => {
  const X = t => 110 + t * 11, late = [0, 7, 3, 12, 1, 9, 0, 5, 14]; let s = note(100, 40, 'slot', 'end') + note(100, 110, 'real start', 'end');
  late.forEach((l, k) => {
    s += bar(X(k * 20) - 1, 28, 2, 'a', 20) + bar(X(k * 20 + l), 98, 7, 'c', 20);
    if (l) s += `<line class="ar" x1="${X(k * 20)}" y1="92" x2="${X(k * 20 + l)}" y2="92" marker-end="url(#ah)"/>`;
  });
  s += note(X(12), 76, 'a high-priority task held the CPU: this one starts 12 ms late', 'start');
  return s;
})(), 'Samples scatter around their slots but do not walk away');

// 6. Overrun: the mark is already in the past
const overDia = svg(720, 130, (() => {
  const X = t => 110 + t * 5; let s = note(100, 42, 'work 28 ms', 'end') + note(100, 100, 'marks', 'end');
  for (let k = 0; k < 4; k++) s += bar(X(k * 28), 30, X(28) - X(0), 'r');
  for (let k = 0; k <= 4; k++) s += `<line class="dash" x1="${X(k * 20)}" y1="62" x2="${X(k * 20)}" y2="108"/>` + note(X(k * 20), 122, 'last=' + k * 20, 'middle');
  s += note(X(0), 20, 'ends at 28: mark 20 is already past, so the call returns pdFALSE', 'start');
  return s;
})(), 'Work longer than the period: the wake time is always in the past');

export const realCode = `// main/rover_main.c   (ESP-IDF v5.x)   stage 3: stage 2 plus a spectrometer sampled at exactly 50 Hz
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "rover.h"   // prototypes for the rover helpers (not shown)

// Priorities in one place, highest first. Higher number = more urgent.
#define PRIO_LIGHTS     4   // tight timing, microseconds of CPU
#define PRIO_MOTOR      3   // 10 ms control loop
#define PRIO_TELEMETRY  2   // 100 ms
#define PRIO_CAMERA     1   // no deadline: takes what is left
#define PRIO_SPECTRO    1   // 25 ms of drift is allowed, so it does not need to be on top

#define SPECTRO_PERIOD_MS 20   // 50 Hz

static const char *TAG = "rover";

// Each sample takes 3 to 7 ms of CPU (the game cycles 3, 5, 7, 4, 6).
static void spectro_task(void *arg)
{
    // Start the mark ONCE, before the loop. It is the task's fixed reference in time.
    TickType_t last = xTaskGetTickCount();
    for (;;) {
        sample_spectrometer();                                           // 3 to 7 ms
        // Wrong (stage 3 start code): vTaskDelay(pdMS_TO_TICKS(20));  counts from NOW, so the period is 23 to 27 ms
        xTaskDelayUntil(&last, pdMS_TO_TICKS(SPECTRO_PERIOD_MS));        // wakes at last + 20 ms, then advances last
    }
}

static void motor_task(void *arg)     { for (;;) { motor_step();       vTaskDelay(pdMS_TO_TICKS(8));   } }   // about 2 ms of work
static void telemetry_task(void *arg) { for (;;) { send_telemetry();   vTaskDelay(pdMS_TO_TICKS(85));  } }
static void camera_task(void *arg)    { for (;;) { compress_frame();   vTaskDelay(pdMS_TO_TICKS(120)); } }
// beacon_task (500 ms) and heart_task (200 ms): unchanged from stage 1
static void beacon_task(void *arg);
static void heart_task(void *arg);
// Prototypes for sample_spectrometer, motor_step, send_telemetry and compress_frame come from rover.h (not shown).

void app_main(void)
{
    // ... GPIO setup from stage 1 ...
    // Return values unchecked for brevity: check == pdPASS in real code.
    xTaskCreate(beacon_task,    "beacon",    2048, NULL, PRIO_LIGHTS,    NULL);
    xTaskCreate(heart_task,     "heart",     2048, NULL, PRIO_LIGHTS,    NULL);
    xTaskCreate(motor_task,     "motor",     2048, NULL, PRIO_MOTOR,     NULL);
    xTaskCreate(telemetry_task, "telemetry", 3072, NULL, PRIO_TELEMETRY, NULL);
    xTaskCreate(camera_task,    "camera",    4096, NULL, PRIO_CAMERA,    NULL);
    xTaskCreate(spectro_task,   "spectro",   1280, NULL, PRIO_SPECTRO,   NULL);   // game stack size; a task that calls ESP_LOGx needs more on real hardware
    ESP_LOGI(TAG, "tick period: %d ms", (int)portTICK_PERIOD_MS);
}

// Build notes
//   idf.py menuconfig   Component config > FreeRTOS > Kernel > configTICK_RATE_HZ  (CONFIG_FREERTOS_HZ)
//   The ESP-IDF default is 100 (10 ms tick). With it, pdMS_TO_TICKS(20) is 2 ticks and any period that is not a multiple of 10 ms is rounded down.
//   The game runs at 1000 (1 ms tick). Set 1000 on real hardware to match the game's timing.
//   idf.py build flash monitor`;

export const manual = [
  ['1. vTaskDelay counts from now', `<p><code>vTaskDelay(n)</code> means: block this task for n ticks, <b>starting at the moment of the call</b>. The call comes after the work, so the work time is not part of the delay. The period of the loop is work plus delay. (A tick is one beat of the kernel clock, 1 ms in this game; section 4 explains it.)</p>
   ${delayDia}
   <p>The spectrometer task is <code>sampleSpectrometer(); vTaskDelay(pdMS_TO_TICKS(20));</code>. The sample takes 3 to 7 ms, so the loop runs every 23 to 27 ms, about 40 Hz instead of 50 Hz. In the game, with the other tasks preempting it as well, only 91 of the 150 samples exist after 3 s.</p>
   <p>Move the work slider with the delay call selected. Then switch the call. The chart shows an idealised task with no other load, so the numbers are a little better than the game's.</p>
   <div data-w="driftlab"></div>`],

  ['2. Drift adds up', `<p>A period that is too long by 3 ms looks harmless for one sample. Samples are numbered, though, and sample k is expected at k × 20 ms. Each lap adds the error again, so the lateness of sample k is <b>k × error</b>. It never stops growing.</p>
   ${driftDia}
   <pre>real start of sample k   = k × (work + 20)
wanted start of sample k = k × 20
lateness                 = k × work

work = 5 ms:  sample 50 is 250 ms late,  sample 100 is 500 ms late
In the game's 3 s run, 150 samples were due and 91 happened, so 59 are missing.</pre>
   <ul><li>Drift is a property of the <b>loop structure</b>, not of the CPU. A faster chip shrinks the work time and shrinks the drift rate, but never to zero.</li>
   <li>Shortening the delay by hand (<code>vTaskDelay(15)</code>) fits one average work time. The work here varies between 3 and 7 ms, so the loop is still wrong, and any change in work time breaks it.</li>
   <li>Anything that depends on the rate, such as a filter coefficient, a frequency analysis or a log timestamp, gets wrong silently. Nothing crashes.</li></ul>`],

  ['3. xTaskDelayUntil: count from a fixed mark', `<p><b>Name:</b> ESP-IDF v5 uses <code>xTaskDelayUntil()</code>. The older name <code>vTaskDelayUntil()</code> still compiles (it is a macro for the new call) and has the same arguments. This manual uses the x name everywhere.</p>
   <p><code>xTaskDelayUntil(&amp;last, period)</code> does not ask "how long from now". It keeps a wake mark in the variable <code>last</code>. Each call adds <code>period</code> to the mark and blocks until the tick counter reaches it. Work that ran for 3 ms simply leaves 17 ms of sleep; work that ran for 7 ms leaves 13 ms.</p>
   ${untilDia}
   <p class="cap">On every call the kernel does: last += 20, then sleeps until tick <code>last</code>. The work time never enters the sum.</p>
   <pre>TickType_t last = xTaskGetTickCount();     // once, before the loop
for (;;) {
    sample_spectrometer();
    xTaskDelayUntil(&amp;last, pdMS_TO_TICKS(20)); // wake at last + 20 ms, then last += 20 ms
}</pre>
   <ul><li><code>last</code> is read and updated by the kernel, so the task has to <b>keep it between laps</b>. Re-initialising it with <code>xTaskGetTickCount()</code> inside the loop gives back the vTaskDelay behaviour.</li>
   <li>The first lap runs at once and the first wake is at start + 20 ms.</li>
   <li>The period is in ticks and <code>pdMS_TO_TICKS</code> rounds down (section 4), so use a period that is a whole number of ticks.</li>
   <li>The call returns a <code>BaseType_t</code>: <code>pdTRUE</code> if the task blocked, <code>pdFALSE</code> if the mark was already past (section 6).</li></ul>
   <p>The same work, the same load. Compare the two calls over 3 s:</p>
   <div data-w="driftlab"></div>`],

  ['4. Ticks: the clock behind every delay (prerequisite)', `<p>A FreeRTOS task cannot sleep for "20 ms". It can only sleep until a <b>tick</b>. A hardware timer raises an interrupt at a fixed rate; the handler adds 1 to the kernel's tick count and moves every task whose wake time has been reached from the Blocked list to Ready. Nothing in the kernel measures time at a finer grain.</p>
   ${tickDia}
   <p>Because a delay can only end on a tick, a call that lands part-way through a tick period gets a shorter wait than asked.</p>
   ${wakeDia}
   <p class="cap">A delay of n ticks lasts between n-1 and n tick periods, depending on when in a tick it was called.</p>
   <ul><li>The rate is <code>CONFIG_FREERTOS_HZ</code>. <b>The ESP-IDF default is 100 Hz, a 10 ms tick.</b> This game runs at 1000 Hz (1 ms ticks) so that short timings are visible. On a real board, set 1000 in <code>menuconfig</code> to get the game's behaviour.</li>
   <li><code>pdMS_TO_TICKS(ms)</code> computes <code>ms * CONFIG_FREERTOS_HZ / 1000</code> in integer arithmetic and rounds down. At 100 Hz, 20 ms is 2 ticks, 25 ms is also 2 ticks, and 5 ms is 0 ticks.</li>
   <li><code>portTICK_PERIOD_MS</code> is the length of one tick in ms (10 at the default). <code>xTaskGetTickCount()</code> returns the current count.</li></ul>
   <p>Try both rates and watch the rounding:</p>
   <div data-w="ticks"></div>`],

  ['5. Jitter is not drift (after you pass)', `<p>In the game, the fixed spectrometer still starts consecutive samples 7 to 35 ms apart, not exactly 20 ms. That is <b>jitter</b>: each wake-up is on time as far as the kernel is concerned, but the task only runs when it is the highest-priority Ready task. The spectrometer has priority 1. While the motor (priority 3) or the lights (priority 4) are running, it waits.</p>
   ${jitterDia}
   <p class="cap">The next slot is still at k × 20 ms; a late start does not move it. Spread of the starts around the grid is jitter. Distance that keeps growing is drift.</p>
   <ul><li>xTaskDelayUntil removes <b>drift</b>. It cannot remove jitter, because the delay in start time comes from preemption, not from the delay call. The worst distance from the grid in the reference solution is 17 ms, and the average rate is exactly 50 Hz.</li>
   <li>The stage goal therefore allows 25 ms. A stricter limit would need other tasks to be retuned, and those tasks have deadlines of their own.</li>
   <li>If samples need a tight start time, the real fix is hardware: let a timer or the ADC trigger the sampling and keep the task for processing the result (stage 8 introduces timers).</li></ul>
   <p>Add late wake-ups and compare the calls:</p>
   <div data-w="jitterlab"></div>`],

  ['6. When the work does not fit in the period (after you pass)', `<p>xTaskDelayUntil cannot make a loop faster than its work. If the work takes longer than the period, the wake mark is already in the past when the call is made. The kernel then <b>does not block</b>. <code>xTaskDelayUntil()</code> returns <code>pdFALSE</code> ("not delayed"), and the mark still advances by one period, so the task tries to catch up lap after lap.</p>
   ${overDia}
   <p class="cap">xTaskDelayUntil does not block, so the sampler runs back to back with no sleep. It never gets back to the grid, and the idle task starves.</p>
   <ul><li>A task that never blocks never leaves the Ready state. Everything of lower priority starves, including the idle task, and after the task watchdog timeout (5 s by default, <code>CONFIG_ESP_TASK_WDT_TIMEOUT_S</code>) <code>task_wdt</code> reports it. This is what happens in the game if you ask for <code>until(10)</code>: sampling at 100 Hz needs more than all of the CPU.</li>
   <li>Check the return value if a missed deadline matters: <code>if (xTaskDelayUntil(&amp;last, p) == pdFALSE) { ESP_LOGW(TAG, "late"); }</code>. It is the cheapest overrun detector the kernel has.</li>
   <li>Utilisation is work ÷ period, and it adds up across tasks. The spectrometer alone is 25% of the CPU (5 ms every 20 ms). Stage 2's tasks were about 65%, so the whole rover now runs at about 80%, and the camera drops to 11 frames in 3 s.</li></ul>
   <p>Raise the work until the bar turns red:</p>
   <div data-w="limitlab"></div>`],

  ['7. Going further: priority cost and real ESP-IDF habits (after you pass)', `<ul><li><b>Raising the priority is not free.</b> Giving the spectrometer priority 3 or higher pushes the motor to 12 ms between steps, and anything above 2 pushes telemetry past its 105 ms limit. The jitter improves, but the stage 2 deadlines break.</li>
   <li><b>Tick rate:</b> <code>idf.py menuconfig</code>, Component config, FreeRTOS, Kernel, configTICK_RATE_HZ (<code>CONFIG_FREERTOS_HZ</code>). The default is 100. 1000 gives finer delays and costs 10 times as many tick interrupts per second. The game assumes 1000.</li>
   <li><b>Periodic work in a task:</b> use <code>xTaskDelayUntil</code> for loops that must keep a rate, and <code>vTaskDelay</code> for loops where "wait a while" is enough, like the telemetry in stage 2.</li>
   <li><b>Time units:</b> keep all periods as <code>pdMS_TO_TICKS(n)</code> constants in one place, so that changing the tick rate cannot silently change a period.</li>
   <li><b>Dual core:</b> in the game there is one core, so a lower-priority task waits while a higher one runs. On a dual-core ESP32 an unpinned task can run on the other core, so the wait does not always happen; <code>xTaskCreatePinnedToCore</code> reproduces the game's behaviour.</li>
   <li><b>Tick wrap-around:</b> the count is a 32-bit <code>TickType_t</code>. At 1 kHz it wraps after 2<sup>32</sup> ms, about 49.7 days. The kernel's delay arithmetic handles the wrap as long as you compare tick values with the kernel API and not by hand.</li>
   <li><b>Time stamps:</b> the tick count is coarse. For microsecond time stamps use <code>esp_timer_get_time()</code>, which returns microseconds since boot as a 64-bit value.</li>
   <li><b>Light sleep:</b> with automatic light sleep enabled, the tick interrupt is suppressed while idle and the tick count is corrected afterwards (this needs <code>CONFIG_PM_ENABLE</code> and <code>CONFIG_FREERTOS_USE_TICKLESS_IDLE</code>). Delays still hold.</li></ul>`],
];

export const quiz = [
  { q: 'A sampling task does 5 ms of work and then calls vTaskDelay(pdMS_TO_TICKS(20)). How often does it sample?', opts: ['Every 20 ms, because the delay is the period', 'Every 15 ms, because the work counts towards the delay', 'Every 25 ms, because the delay starts after the work'], a: 2, why: 'vTaskDelay counts from the moment it is called, which is after the work. Period = work + delay = 25 ms.', wrong: ["The delay is not the whole period. vTaskDelay starts counting when it is called, which is after the 5 ms of work, so the work is added on top.", "The work does not count towards the delay. vTaskDelay starts counting at the call, which comes after the work, so nothing is subtracted from the 20 ms.", null] },
  { q: 'Each lap of a loop is 3 ms longer than planned. How late is lap 100 compared with the plan?', opts: ['300 ms, because the error is added on every lap', '3 ms, because the error is per lap and does not add up', 'About 30 ms, because the kernel corrects most of it'], a: 0, why: 'Nothing corrects it. Lateness is lap number × error per lap, 100 × 3 = 300 ms.', wrong: [null, "The error is not forgotten after each lap. Each lap starts where the last one really ended, so the 3 ms is added again every time.", "The kernel has no reference to the plan. vTaskDelay does not know when a lap should have started, so it cannot correct anything."] },
  { q: 'A developer moves "TickType_t last = xTaskGetTickCount();" into the loop, just before xTaskDelayUntil, to be safe. What happens?', opts: ['Nothing changes, because the call behaves the same', 'The task behaves like vTaskDelay and the drift returns', 'The call returns pdFALSE on every lap and never blocks'], a: 1, why: 'The mark restarts from now on every lap, so the work time is no longer subtracted from the sleep and the period is work plus delay again.', wrong: ["The call does not behave the same. Its mark is stored in last, and a last that is reset every lap is always \"now\", so the fixed reference is lost.", null, "pdFALSE means the mark was already in the past. With last set to the current tick just before the call, the mark is in the future, so the call does block."] },
  { q: 'CONFIG_FREERTOS_HZ is left at the ESP-IDF default. You write xTaskDelayUntil(&last, pdMS_TO_TICKS(25)). What period do you get?', opts: ['25 ms, because the macro converts exactly', '30 ms, because it rounds up to the next tick', '20 ms, because 25 ms rounds down to 2 ticks'], a: 2, why: 'At 100 Hz a tick is 10 ms and pdMS_TO_TICKS rounds down: 25 × 100 / 1000 = 2 ticks, so the loop runs every 20 ms.', wrong: ["pdMS_TO_TICKS converts in integer arithmetic at the configured tick rate. At 100 Hz, 25 ms is 2.5 ticks and the fraction is dropped, so the result is not exact.", "The macro divides in integers and drops the remainder. It never rounds up to the next tick.", null] },
  { q: 'A higher-priority task keeps the CPU for 12 ms and one wake-up of an xTaskDelayUntil sampler is late. What happens to the later samples?', opts: ['Only that sample is late, and the next marks are unchanged', 'All later samples are 12 ms late as well', 'The kernel skips the next sample to compensate'], a: 0, why: 'The wake mark advances from the old mark by a fixed period. A late start moves that sample only, and the next wake time is still on the grid.', wrong: [null, "The next wake time is the old mark plus a fixed period, not the time of the late wake-up. A late start does not move the grid, so later samples are not shifted.", "The kernel does not skip wake-ups to compensate. Every mark on the grid still produces a wake-up."] },
  { q: 'The work in an xTaskDelayUntil loop takes 30 ms with a 20 ms period and no other tasks are running. What do you expect?', opts: ['The task runs every 30 ms and the system stays healthy', 'The task never blocks, the idle task starves and task_wdt fires', 'The call blocks for 10 ms to restore the grid'], a: 1, why: 'The mark is always in the past, the call returns immediately with pdFALSE, and a task that never blocks leaves nothing for the idle task.', wrong: ["Each lap does last about 30 ms, because the work alone takes that long. But a loop that never sleeps is not healthy: every task below it, including IDLE, gets no CPU.", null, "xTaskDelayUntil cannot restore a grid it has already missed. When the mark is in the past it returns pdFALSE at once instead of blocking."] },
  { q: 'To cut the spectrometer jitter you raise its priority from 1 to 3. Which stage 2 deadline is at risk, and why?', opts: ['The camera frame rate, because it was the only task below the spectrometer', 'None, because a 3 to 7 ms sample is too short to delay anything', 'Motor and telemetry, because the spectrometer now preempts or competes with them'], a: 2, why: 'Priority 3 ties with the motor and is above telemetry, so a 3 to 7 ms sample every 20 ms is added to their wait. The motor step grows to 12 ms and telemetry passes its 105 ms limit. Jitter is bought with deadlines you already met.', wrong: ["The camera is not the only task below priority 3. Telemetry at priority 2 is also below it, and the motor is at the same level, so more than the camera is affected.", "Priority decides who goes first, whatever the size of the job. 3 to 7 ms every 20 ms is about a quarter of the CPU, and the motor and telemetry have little slack.", null] },
];
