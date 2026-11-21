// Field manual for stage 2 (ESP-IDF): priorities, preemption, time slicing.
import { svg, box, arrow, note } from '../widgets.js';

const preempt = svg(720, 190, (() => {
  const X = t => 110 + t * 14, row = { hi: 46, lo: 96 }; let s = '';
  s += note(100, row.hi + 5, 'motor (prio 3)', 'end') + note(100, row.lo + 5, 'camera (prio 1)', 'end');
  const bar = (r, a, b, cls) => `<rect class="bx ${cls}" x="${X(a)}" y="${r - 11}" width="${X(b) - X(a)}" height="22" rx="2"/>`;
  s += bar(row.lo, 0, 10, 't-camera') + bar(row.hi, 10, 12, 't-motor') + bar(row.lo, 12, 20, 't-camera') + bar(row.hi, 20, 22, 't-motor') + bar(row.lo, 22, 30, 't-camera') + bar(row.hi, 30, 32, 't-motor') + bar(row.lo, 32, 40, 't-camera');
  for (const t of [10, 20, 30]) s += `<line class="dash" x1="${X(t)}" y1="20" x2="${X(t)}" y2="120"/>`;
  s += note(X(10), 14, 'motor wakes: preempts at once', 'middle') + note(X(12) + 4, row.lo + 30, 'camera resumes exactly where it was', 'start');
  s += `<line class="ar" x1="${X(0)}" y1="146" x2="${X(41)}" y2="146" marker-end="url(#ah)"/>` + [0, 10, 20, 30, 40].map(t => note(X(t), 162, t + ' ms', 'middle')).join('');
  s += note(X(0), 182, 'The camera never notices. Its registers are saved on its stack and restored later.');
  return s;
})(), 'A high-priority motor task preempting a low-priority camera task every 10 ms');

const slicing = svg(720, 160, (() => {
  const X = t => 140 + t * 30, names = ['motor', 'camera', 'telemetry'], cls = ['t-motor', 't-camera', 't-telemetry']; let s = '';
  names.forEach((n, i) => { s += note(130, 30 + i * 30 + 5, n + ' (prio 1)', 'end'); });
  for (let t = 0; t < 18; t++) { const i = t % 3; s += `<rect class="bx ${cls[i]}" x="${X(t)}" y="${19 + i * 30}" width="28" height="22" rx="2"/>`; }
  s += `<line class="ar" x1="${X(0)}" y1="116" x2="${X(18.5)}" y2="116" marker-end="url(#ah)"/>` + note(X(0), 132, 'one tick each, in turn') + note(X(18), 150, 'the motor needs 2 ms of CPU: it finishes after 4 to 6 ms of wall time', 'end');
  return s;
})(), 'Round-robin time slicing between three tasks of equal priority');

const rate = svg(720, 200, (() => {
  let s = note(20, 18, 'shorter period', 'start') + note(250, 18, 'higher priority', 'start') + note(430, 18, 'CPU share = C / T', 'start');
  const rows = [['motor', 'T = 10 ms, C = 2 ms', 'prio 3', 20, 'c'], ['telemetry', 'T = 97 ms, C = 12 ms', 'prio 2', 12, 'a'], ['camera', 'T = 180 ms, C = 60 ms', 'prio 1', 33, 'g']];
  rows.forEach(([n, t, p, u, c], i) => {
    const y = 30 + i * 46;
    s += box(20, y, 190, 36, n + '|' + t, c) + arrow(210, y + 18, 248, y + 18) + box(250, y, 110, 36, p, c);
    s += `<rect class="bx ${c}" x="430" y="${y + 6}" width="${u * 6}" height="24" rx="2"/>` + note(430 + u * 6 + 8, y + 23, u + '%');
  });
  s += note(20, 186, 'Total about 65% of the CPU. Urgency (period) sets the priority, not importance.', 'start');
  return s;
})(), 'Rate-monotonic priorities: the shorter the period, the higher the priority, with each task\'s CPU share');

const ladder = svg(720, 200, (() => {
  const X = l => 40 + l * 26.4; let s = '';
  for (let l = 0; l <= 24; l++) s += `<rect class="bx ${l === 0 ? 'd' : l < 18 ? 'c' : 'a'}" x="${X(l)}" y="90" width="25" height="26" rx="2"/>`;
  s += note(X(0) + 12, 108, '0', 'middle') + note(X(24) + 12, 108, '24', 'middle');
  const mark = (l, t, y) => `<line class="dash" x1="${X(l) + 12}" y1="${y + 4}" x2="${X(l) + 12}" y2="90"/>` + note(X(l) + 12, y, t, 'middle');
  s += mark(0, 'IDLE0/1', 60) + mark(1, 'main (app_main)', 36) + mark(18, 'tiT', 60) + mark(20, 'sys_evt', 36) + mark(22, 'esp_timer', 60) + mark(23, 'wifi', 36) + mark(24, 'ipc0/1', 60);
  s += `<line class="ar" x1="${X(1)}" y1="136" x2="${X(17) + 25}" y2="136" marker-end="url(#ah)"/>` + note((X(1) + X(17) + 25) / 2, 156, 'your tasks live roughly here (1 to 17)', 'middle');
  s += note(X(18), 156, 'system tasks: do not starve', 'start') + note(20, 190, 'Higher number = more urgent. Defaults from ESP-IDF v5; vTaskList() shows what your build uses.', 'start');
  return s;
})(), 'The ESP-IDF priority ladder from 0 to 24 with the system tasks marked');

export const realCode = `// main/rover_main.c   (ESP-IDF v5.x)   stage 2: stage 1 plus three more tasks, ordered by urgency
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "esp_log.h"

// Priorities in one place, highest first. Higher number = more urgent.
#define PRIO_LIGHTS     4   // tight timing, microseconds of CPU
#define PRIO_MOTOR      3   // 10 ms control loop
#define PRIO_TELEMETRY  2   // 100 ms
#define PRIO_CAMERA     1   // no deadline: takes what is left

static const char *TAG = "rover";
static TaskHandle_t camera_handle;

static void motor_task(void *arg)
{
    for (;;) {
        motor_step();                      // about 2 ms
        // Needs CONFIG_FREERTOS_HZ=1000 (the game's tick). At the default 100 Hz
        // pdMS_TO_TICKS(8) is 0 and this loop would never sleep.
        vTaskDelay(pdMS_TO_TICKS(8));
    }
}
static void telemetry_task(void *arg) { for (;;) { send_telemetry(); vTaskDelay(pdMS_TO_TICKS(85)); } }
static void camera_task(void *arg)    { for (;;) { compress_frame(); vTaskDelay(pdMS_TO_TICKS(120)); } }
// beacon_task and heart_task: unchanged from stage 1

void app_main(void)
{
    // ... GPIO setup from stage 1 ...
    xTaskCreate(beacon_task,    "beacon",    2048, NULL, PRIO_LIGHTS,    NULL);
    xTaskCreate(heart_task,     "heart",     2048, NULL, PRIO_LIGHTS,    NULL);
    xTaskCreate(motor_task,     "motor",     2048, NULL, PRIO_MOTOR,     NULL);
    xTaskCreate(telemetry_task, "telemetry", 3072, NULL, PRIO_TELEMETRY, NULL);
    xTaskCreate(camera_task,    "camera",    4096, NULL, PRIO_CAMERA,    &camera_handle);

    ESP_LOGI(TAG, "camera priority is %u", (unsigned)uxTaskPriorityGet(camera_handle));
    // Priorities can change at run time, e.g. while taking an urgent photo:
    // vTaskPrioritySet(camera_handle, PRIO_TELEMETRY);
}

// To see where the CPU time goes on real hardware (enable the run-time stats options in menuconfig):
//   char buf[512]; vTaskGetRunTimeStats(buf); printf("%s", buf);`;

export const manual = [
  ['1. One rule decides everything', `<p>FreeRTOS scheduling fits in one sentence: <b>the highest-priority task that is Ready runs</b>. The kernel re-applies that rule at three moments: on every tick interrupt, whenever an API call makes a task Ready (a delay expires, a queue receives data), and at the end of an interrupt handler that woke a task.</p>
   <p>When a task of higher priority becomes Ready, the running task is <b>preempted</b> immediately, in the middle of whatever statement it was executing. Its registers are pushed onto its own stack, and it continues later as if nothing had happened.</p>
   ${preempt}
   <p>The lab below runs the same simulated kernel as the game on three tasks. Change the priorities and watch the chart. Start with everything equal, then try the camera on top.</p>
   <div data-w="schedlab"></div>`],

  ['2. Time slicing: what equal priority means', `<p>Tasks at the <b>same</b> priority share the CPU round-robin, switching on every tick (<code>configUSE_TIME_SLICING</code>, on by default). This is fair, and fairness is exactly what a control loop does not want: with three busy tasks, 2 ms of work takes 4 to 6 ms to complete (4 ms if its two ticks fall back to back in the rotation, 6 ms at worst).</p>
   ${slicing}
   <ul><li>Slicing only happens <b>within</b> one priority level. A priority-2 task that stays Ready keeps every priority-1 task off the CPU for as long as it likes.</li>
   <li>A task gives up the rest of its slice early by blocking, or explicitly with <code>taskYIELD()</code>.</li>
   <li>On the dual-core ESP32 each core slices independently among the tasks allowed to run on it (stage 11).</li></ul>`],

  ['3. Choosing priorities: urgency, not importance', `<p>The camera may be the most <i>important</i> instrument on the rover, but it is the least <i>urgent</i> task: nothing breaks if a frame is compressed 50 ms later. The motor loop is the opposite. Priority encodes urgency.</p>
   <p>The standard starting point is <b>rate-monotonic</b> assignment: <b>the shorter a task's period, the higher its priority</b>. The period T is the time from one start of the task to the next, and C is the CPU time one run needs. The share of the CPU a task uses is C / T. For this stage:</p>
   <pre>motor      C = 2 ms,  T = 10 ms  (2 ms work + 8 ms delay)    2/10  = 20%
telemetry  C = 12 ms, T = 97 ms  (12 ms work + 85 ms delay)  12/97 = 12%
camera     C = 60 ms, T = 180 ms (60 ms work + 120 ms delay) 60/180 = 33%
                                                    total about 65% of the CPU</pre>
   <ul><li>Tasks that need <b>almost no CPU but exact timing</b> (your LEDs) can sit high. They cost nothing and never hold anyone up.</li>
   <li>Long computations belong at the bottom, where they fill the gaps.</li>
   <li>If you find yourself raising priorities one by one to fix symptoms, stop and list periods and deadlines first.</li></ul>
   ${rate}
   <details><summary>Going deeper: the Liu-Layland bound</summary>
   <p>Liu and Layland showed in 1973 that rate-monotonic is the best possible fixed-priority order for periodic tasks, and that all deadlines are guaranteed when the total utilisation U stays under a bound:</p>
   <pre>U = C1/T1 + C2/T2 + ... + Cn/Tn   ≤   n · (2^(1/n) − 1)

n = 1: 100%     n = 2: 82.8%     n = 3: 78.0%     n = 5: 74.3%     n → ∞: 69.3%</pre>
   <p>Above the bound the system may still work, but you have to check the worst case: every task released at the same instant. The timing chart at t = 0 is exactly that case.</p></details>`],

  ['4. Priorities in ESP-IDF', `${ladder}
   <ul><li>ESP-IDF has 25 levels, 0 to 24 (<code>configMAX_PRIORITIES</code>). A higher number is more urgent. The idle tasks sit at 0 and feed the watchdog.</li>
   <li><code>app_main()</code> runs at priority 1. A task it creates with a higher priority starts running <b>before</b> <code>xTaskCreate()</code> returns. That is for one core, as in this stage: on two cores the new task may start on the other core at the same time.</li>
   <li><code>uxTaskPriorityGet(handle)</code> and <code>vTaskPrioritySet(handle, n)</code> read and change a priority at run time. Pass <code>NULL</code> for the calling task.</li></ul>
   <details><summary>Going deeper: the system tasks on the ladder</summary>
   <p>The system's own tasks already occupy part of the ladder, and your tasks share it with them:</p>
   <pre>24  ipc0 / ipc1        cross-core calls
23  wifi               Wi-Fi driver task
22  esp_timer          high-resolution timer callbacks
20  sys_evt            default event loop
18  tiT                lwIP TCP/IP stack
 1  main               runs app_main()
 0  IDLE0 / IDLE1      idle tasks, feed the watchdog</pre>
   <p>Keep application tasks roughly between 1 and 17. A CPU-heavy task above 18 can starve networking and makes Wi-Fi drop out. These defaults are from ESP-IDF v5 and can be changed in <code>menuconfig</code>. <code>vTaskList()</code> prints what your build really uses. The rover has no Wi-Fi yet, but the same ladder applies once it does.</p></details>`],

  ['5. Starvation and other pitfalls', `<ul><li><b>Starvation:</b> a task that is Ready and never runs, because something above it always has work. In the chart it is an endless faded bar. The idle task is the first victim, and then the watchdog fires.</li>
   <li><b>Everything is urgent:</b> if all tasks end up at the same high priority you are back to round-robin, with extra steps.</li>
   <li><b>Priority as a lock:</b> "this task has the highest priority, so nobody can interrupt it" stops being true the moment it blocks, and is never true on two cores. Shared data needs a mutex (stage 6).</li>
   <li><b>Busy high-priority task:</b> anything that computes for a long time at high priority delays everything below by that long. Split it, or lower it.</li></ul>`],
];

export const quiz = [
  { q: 'A priority-1 task is in the middle of a long calculation when a priority-3 task\'s delay expires. What happens?', opts: ['The priority-3 task waits until the calculation is finished', 'The priority-3 task runs at the next tick at the latest, and the calculation resumes afterwards', 'The priority-1 task is restarted from the beginning'], a: 1, why: 'Preemption. The low task is paused with its registers saved and continues later without knowing it was interrupted.', wrong: ["Waiting for the calculation to finish is cooperative multitasking. FreeRTOS is preemptive: the moment a higher-priority task becomes Ready, it takes the CPU.", null, "Preemption does not restart anything. The paused task's registers are saved on its own stack, so it continues from the exact point where it was stopped."] },
  { q: 'Three tasks at priority 1 are all busy. One of them needs 2 ms of CPU. Roughly how long until it is done?', opts: ['3 ms', '4 to 6 ms', '2 ms'], a: 1, why: 'Round-robin gives it one tick in three, so 2 ms of work takes 4 to 6 ms of wall time depending on where its ticks fall in the rotation.', wrong: ["With two other busy tasks at the same priority the task gets only one tick in three, so 2 ms of work cannot finish in 3 ms.", null, "2 ms is the CPU time the task needs, not the time it takes. Equal-priority tasks take turns, so the wall time is longer than the work."] },
  { q: 'The motor task (priority 3) loses its vTaskDelay and loops forever. The lights are at 4, telemetry at 2, camera at 1. What runs?', opts: ['Everything, because the scheduler shares the CPU fairly', 'Only tasks at priority 3 and above. Telemetry, camera and IDLE starve, and the watchdog fires', 'Only the motor, and the lights stop as well'], a: 1, why: 'The motor never blocks, so it is always Ready and nothing below it gets the CPU. The lights at 4 still preempt it when they wake. IDLE is starved too, so it cannot feed the watchdog, which then fires.', wrong: ["Fairness exists only between tasks of the same priority. A higher-priority task is always chosen first, so the CPU is not shared across priorities.", null, "The lights at priority 4 are above the motor, so they still preempt it whenever they wake. They are not stopped."] },
  { q: 'A new LED task needs 50 microseconds of CPU per run. Is it safe to give it priority 4, above the motor at 3?', opts: ['No, a higher priority than the motor will make the motor miss its deadline', 'Yes, it takes almost no CPU, so it delays the motor by at most 50 microseconds', 'No, tasks above the motor must have a longer period'], a: 1, why: 'Priority decides who goes first, and cost is C / T. A task that runs for 50 microseconds can only delay the motor by that much, so high priority is free for it.', wrong: ["Priority decides who goes first, but the delay a task causes is its run time. 50 microseconds is tiny next to the motor's 2 ms of work and 10 ms period.", null, "There is no rule that tasks above the motor need a longer period. Rate-monotonic assignment goes the other way: the shorter the period, the higher the priority."] },
  null,
];
