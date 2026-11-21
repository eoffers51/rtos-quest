// Field manual for lesson 1 (ESP-IDF), with block diagrams drawn as inline SVG.

import { svg, box, arrow, note, stateKey } from '../widgets.js';

const loopVsTasks = svg(720, 280,
  note(8, 16, 'SUPER LOOP: one thread of control') + box(20, 34, 130, 44, 'toggle BEACON', '') + arrow(150, 56, 196, 56) + box(198, 34, 130, 44, 'spin 500 ms|CPU 100% busy', 'run')
  + arrow(263, 78, 263, 120) + box(198, 122, 130, 44, 'toggle HEART', '') + arrow(198, 144, 152, 144) + box(20, 122, 130, 44, 'spin 200 ms|CPU 100% busy', 'run') + arrow(85, 122, 85, 80)
  + note(20, 196, 'Both LEDs get the same 700 ms period.') + note(20, 214, 'Nothing else can run: the idle task starves.')
  + `<line class="sep" x1="360" y1="6" x2="360" y2="244"/>`
  + note(380, 16, 'RTOS: independent tasks, one scheduler') + box(380, 34, 100, 50, 'beacon task|toggle|sleep 500', 'blk') + box(492, 34, 100, 50, 'heart task|toggle|sleep 200', 'blk') + box(604, 34, 108, 50, 'idle task|priority 0', 'd')
  + arrow(430, 84, 500, 124) + arrow(542, 84, 546, 124) + arrow(658, 84, 592, 124)
  + box(426, 126, 240, 44, 'Scheduler|runs the highest-priority Ready task', '') + arrow(546, 170, 546, 196) + box(486, 198, 120, 40, 'CPU core', '') + stateKey(20, 268), 'A super loop compared with RTOS tasks and a scheduler');

const createTask = svg(720, 210,
  box(8, 60, 150, 60, 'xTaskCreate(|fn, name, stack,|arg, prio, &amp;handle)', '') + arrow(158, 90, 214, 90, 'allocates', 0, -8)
  + `<rect class="grp" x="216" y="14" width="230" height="160" rx="6"/>` + note(228, 32, 'MEMORY (heap)')
  + box(226, 42, 210, 56, 'Task record|name · priority · state', '') + box(226, 108, 210, 56, 'Stack (N bytes)|local variables, return addresses', '')
  + arrow(446, 90, 504, 90, 'joins', 0, -8) + `<rect class="grp" x="506" y="14" width="206" height="160" rx="6"/>` + note(518, 32, 'READY TASKS, by priority')
  + box(520, 50, 60, 30, 'prio 1', 'd') + box(588, 50, 54, 30, 'main', 'rdy') + box(646, 50, 58, 30, 'beacon', 'rdy')
  + box(520, 96, 60, 30, 'prio 0', 'd') + box(588, 96, 54, 30, 'IDLE', 'rdy')
  + note(520, 148, 'Scheduler runs the first task') + note(520, 163, 'of the highest non-empty row.') + stateKey(8, 196), 'What xTaskCreate allocates and where the new task is queued');

const delayTiming = svg(720, 226, (() => {
  const X = t => 110 + t * 1.15, rows = { b: 40, i: 86, k: 132 }; let s = '';
  s += note(100, rows.b + 5, 'beacon task', 'end') + note(100, rows.i + 5, 'idle task', 'end') + note(100, rows.k + 5, 'tick interrupt', 'end');
  for (const t of [0, 500]) s += `<rect class="bx run" x="${X(t)}" y="${rows.b - 12}" width="6" height="24" rx="1"/>` + note(X(t) + 3, rows.b - 20, t === 0 ? 'toggle, then vTaskDelay(500)' : 'wakes exactly at tick 500', t === 0 ? 'start' : 'end');
  s += `<line class="dash blk" x1="${X(0) + 8}" y1="${rows.b}" x2="${X(500) - 2}" y2="${rows.b}"/>` + note(X(250), rows.b + 18, 'Blocked: on the delayed list, costs no CPU', 'middle');
  s += `<rect class="bx d" x="${X(0) + 8}" y="${rows.i - 10}" width="${X(500) - X(0) - 10}" height="20" rx="2"/>` + note(X(250), rows.i + 4, 'Running: the CPU sleeps here', 'middle');
  for (let t = 0; t <= 520; t += 20) s += `<line class="tick n" x1="${X(t)}" y1="${rows.k - 7}" x2="${X(t)}" y2="${rows.k + 7}"/>`;
  s += note(X(250), rows.k + 26, 'every tick the kernel counts time and checks the delayed list', 'middle') + arrow(X(500), rows.k - 9, X(500) + 2, rows.b + 14);
  s += `<line class="ar" x1="${X(0)}" y1="176" x2="${X(520)}" y2="176" marker-end="url(#ah)"/>` + note(X(0), 192, '0 ms') + note(X(500), 192, '500 ms', 'middle') + stateKey(20, 214);
  return s;
})(), 'Timing of a task that toggles a pin and calls vTaskDelay(500)');

const ladder = svg(740, 170,
  box(170, 10, 440, 36, 'Interrupts: always win', 'isr')
  + box(170, 62, 440, 36, 'priority 1: your tasks (equal priority take turns)', '')
  + box(170, 114, 440, 36, 'priority 0: idle task, runs only when all above are Blocked', 'd')
  + arrow(130, 14, 130, 148) + note(120, 70, 'runs only when', 'end') + note(120, 85, 'everything above', 'end') + note(120, 100, 'is Blocked', 'end')
  + note(622, 138, 'starved too long?') + note(622, 153, 'watchdog fires'), 'Priority ladder from interrupts down to the idle task');

export const realCode = `// main/first_light.c   (ESP-IDF v5.x)
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "esp_log.h"

#define BEACON_GPIO GPIO_NUM_2      // change to pins that exist on your board
#define HEART_GPIO  GPIO_NUM_4

static const char *TAG = "first_light";

static void beacon_task(void *arg)
{
    bool on = false;
    for (;;) {                                   // a task function never returns
        on = !on;
        gpio_set_level(BEACON_GPIO, on);
        vTaskDelay(pdMS_TO_TICKS(500));          // Blocked for 500 ms: zero CPU
    }
}

static void heart_task(void *arg)
{
    bool on = false;
    for (;;) {
        on = !on;
        gpio_set_level(HEART_GPIO, on);
        vTaskDelay(pdMS_TO_TICKS(200));
    }
}

void app_main(void)
{
    gpio_reset_pin(BEACON_GPIO);
    gpio_set_direction(BEACON_GPIO, GPIO_MODE_OUTPUT);
    gpio_reset_pin(HEART_GPIO);
    gpio_set_direction(HEART_GPIO, GPIO_MODE_OUTPUT);

    //                      function     name      stack  arg   prio  handle
    BaseType_t ok = xTaskCreate(beacon_task, "beacon", 2048,  NULL, 1,    NULL);
    if (ok != pdPASS) ESP_LOGE(TAG, "not enough heap for the beacon task");
    xTaskCreate(heart_task, "heart", 2048, NULL, 1, NULL);

    ESP_LOGI(TAG, "tasks started");
    // app_main may return: the main task is deleted, the other tasks keep running.
}

// Build and flash:
//   idf.py set-target esp32s3        (or esp32, esp32c3 ...)
//   idf.py menuconfig                (Component config > FreeRTOS > Tick rate (Hz): 1000 for 1 ms ticks)
//   idf.py -p /dev/ttyUSB0 flash monitor`;

export const manual = [
  ['1. Where your code starts (Go deeper)', `<p><i>Go deeper: skip this on a first read and come back after your first fix.</i> In ESP-IDF you never start the RTOS yourself. By the time your code runs, FreeRTOS is already up: after the bootloaders, the startup code <b>starts the FreeRTOS scheduler on each core</b> and creates a few system tasks. One is the <b>main task</b>, and all it does is call your <code>app_main()</code>.</p>
   <div data-w="boot"></div>
   <details class="deeper"><summary>Go deeper: main task details</summary><ul><li>The main task has <b>priority 1</b> and a stack of 3584 bytes by default (<code>CONFIG_ESP_MAIN_TASK_STACK_SIZE</code>). Deep call chains in <code>app_main</code> can overflow it.</li>
   <li><code>app_main()</code> is allowed to <b>return</b>. The main task is then deleted and its stack freed, while the tasks you created keep running. There is no <code>loop()</code> in ESP-IDF.</li>
   <li>Each core gets its own idle task (<code>IDLE0</code>, <code>IDLE1</code>) at priority 0. You will meet them in the task watchdog message.</li></ul></details>`],

  ['2. Reading the task timing chart (Core)', `<p>Read this before your first run. The chart at the bottom of the screen is the tool for checking your firmware. Each task has a row, with one sample per millisecond:</p>
   <div data-w="chartguide"></div>
   <ul><li><b>Solid bar:</b> Running. A thin vertical tick means the task ran for less than a millisecond.</li>
   <li><b>Faded low bar:</b> Ready, waiting for the CPU. Long stretches of this mean some other task is hogging the core.</li>
   <li><b>Dotted line:</b> Blocked on a delay.</li>
   <li><b>Red outline:</b> Blocked on a queue, semaphore or mutex (later missions).</li>
   <li><b>IDLE task row:</b> filled whenever nothing else needed the CPU. This is your power budget.</li>
   <li><b>Pin rows:</b> the logic level of each GPIO, like a logic analyzer channel.</li></ul>
   <p>Move the mouse over the chart to read the exact state of every row at that millisecond, and use the zoom to look at single ticks.</p>
   <p><b>What a correct chart looks like for this mission:</b> the BEACON pin is a square wave with an edge every 500 ms, and HEART has an edge every 200 ms. Each task row is a dotted line with a thin tick exactly under each edge of its own pin. The IDLE row is filled almost end to end. In the starting code you see the opposite: one solid bar, an empty IDLE row, and a fault marker at 600 ms.</p>`],

  ['3. Super loop versus tasks (Core)', `<p>A super loop is one thread of control: each job has to finish before the next one starts, so the slowest job sets the timing of all the others. In the starting code of this mission the two busy-waits add up, and both LEDs end up toggling every 700 ms. Neither requirement is met, and the CPU is busy all the time doing nothing useful.</p>
   ${loopVsTasks}
   <div data-w="loopvs"></div>
   <p>With an RTOS you write each job as its own small endless loop, a <b>task</b>, and you let the <b>scheduler</b> decide who gets the CPU. Each task describes one rhythm and then gets out of the way by blocking. The CPU is given to whichever task is ready, and to the idle task when none is.</p>`],

  ['4. Creating a task: xTaskCreate() (Core)', `<p>A task is created at run time with one call. In this game those calls are the lines inside <code>app_main()</code> in the firmware console, and the stack size and priority are edited there. You need three things: the function, a stack size and a priority.</p>
   <pre>BaseType_t xTaskCreate(TaskFunction_t  pxTaskCode,     // the function: void fn(void *arg)
                       const char     *pcName,         // name, for debugging and crash messages
                       uint32_t        usStackDepth,   // stack size, in BYTES on ESP-IDF
                       void           *pvParameters,   // passed to the function as arg
                       UBaseType_t     uxPriority,     // 0 (idle) ... 24, higher = more urgent
                       TaskHandle_t   *pxCreatedTask); // optional handle, or NULL</pre>
   ${createTask}
   <div data-w="heap"></div>
   <ul><li><b>The function must never return.</b> If its work is finished it calls <code>vTaskDelete(NULL)</code>. Returning from a task function aborts the program.</li>
   <li><b>Stack size is in bytes</b> on ESP-IDF. Upstream FreeRTOS documentation says words; ESP-IDF changed it. Anything calling <code>printf</code> or <code>ESP_LOGx</code> needs 2048 or more.</li>
   <li><b>Return value:</b> <code>pdPASS</code>, or an error when the heap cannot supply the memory. Check it.</li></ul>
   <details class="deeper"><summary>Go deeper: what happens inside xTaskCreate</summary><ul><li>It allocates a task control block (TCB) and the stack from the heap, prepares the stack so the task starts at the first line of its function, and links the TCB into the ready list for its priority. If the new task outranks the caller, it starts running before <code>xTaskCreate</code> even returns.</li>
   <li>The minimum stack that works is about 768 bytes (<code>configMINIMAL_STACK_SIZE</code>).</li>
   <li><b>Core affinity:</b> on dual-core chips <code>xTaskCreate()</code> creates a task that may run on either core. <code>xTaskCreatePinnedToCore(..., core)</code> adds a seventh argument to pin it to core 0 or 1.</li>
   <li><b>The handle</b> is how other code refers to the task later: <code>vTaskSuspend(h)</code>, <code>vTaskPrioritySet(h, 3)</code>, <code>vTaskDelete(h)</code>, <code>xTaskNotifyGive(h)</code>.</li></ul></details>`],

  ['5. Task states (Core)', `<p>At any moment every task is in exactly one of four states. Learning to see them is most of what there is to understand about an RTOS. Drive a task through all four below. For this mission you mainly need <b>Running</b> and <b>Blocked</b>.</p>
   <div data-w="states"></div>
   <ul><li><b>Running:</b> executing on a core right now. At most one task per core.</li>
   <li><b>Ready:</b> able to run, but a task of equal or higher priority has the core.</li>
   <li><b>Blocked:</b> waiting for time (<code>vTaskDelay</code>) or for an event (a queue, semaphore, mutex or notification), usually with a timeout. A blocked task uses no CPU at all.</li>
   <li><b>Suspended:</b> taken out of scheduling by <code>vTaskSuspend()</code> until <code>vTaskResume()</code>. Rare in application code.</li></ul>
   <p>Healthy firmware keeps every task Blocked most of the time. A task that is always Ready or Running is either doing heavy computation or, more often, polling something it should be blocking on.</p>`],

  ['6. What vTaskDelay() really does (Core)', `<p><code>vTaskDelay(n)</code> does not "wait". It makes the calling task <b>Blocked</b> for n ticks and lets another task use the CPU. When the time is up the task becomes Ready again. A hardware timer ticks the kernel's clock, once per <b>tick</b>, and each tick checks who is due.</p>
   ${delayTiming}
   <div data-w="ticks"></div>
   <ul><li><b>Always use <code>pdMS_TO_TICKS(ms)</code>.</b> It converts milliseconds to ticks for whatever tick rate is configured.</li>
   <li><b>Busy-waits</b> such as <code>esp_rom_delay_us()</code> keep the task Running. They are for sub-tick hardware timing of a few microseconds, never for milliseconds.</li></ul>
   <details class="deeper"><summary>Go deeper: tick rate, rounding and precision</summary><ul><li><b>Tick rate on real hardware.</b> ESP-IDF defaults to <code>CONFIG_FREERTOS_HZ = 100</code>, a 10 ms tick. This game simulates 1000 Hz (1 ms), which you get on real hardware by changing that option in <code>menuconfig</code>. At 100 Hz, <code>vTaskDelay(500)</code> without the macro is five seconds.</li>
   <li><b>The rounding trap (100 Hz only).</b> <code>pdMS_TO_TICKS(5)</code> at 100 Hz is 0 ticks, and <code>vTaskDelay(0)</code> does not block at all, it only yields to tasks of equal priority. A loop built on it spins and starves the idle task.</li>
   <li><b>Precision.</b> A delay of n ticks lasts between n-1 and n tick periods, because the first tick boundary can arrive almost immediately.</li>
   <li>Internally the task is moved from the ready list to a <b>delayed list</b>, stamped with its wake-up tick.</li></ul></details>`],

  ['7. The idle task and the watchdog (Core)', `<p>The scheduler rule is simple: run the highest-priority task that is Ready. Tasks of equal priority take turns, one tick each. The idle task sits at the bottom and runs only when every other task on its core is Blocked.</p>
   ${ladder}
   <div data-w="whoruns"></div>
   <p>The idle task does real work: it frees the memory of deleted tasks and, with power management enabled, puts the CPU to sleep. ESP-IDF also makes it feed a watchdog. If an idle task cannot run for too long, you get:</p>
   <pre>E (10319) task_wdt: Task watchdog got triggered. The following tasks/users did not reset the watchdog in time:
E (10319) task_wdt:  - IDLE0 (CPU 0)
E (10319) task_wdt: Tasks currently running:
E (10319) task_wdt: CPU 0: mainLoop</pre>
   <p>The last line names the culprit: a task that never blocks. In this game the timeout is 600 ms and it always resets, so that you see it within the 3-second test.</p>
   <details class="deeper"><summary>Go deeper: the task watchdog timer (TWDT)</summary><ul><li>The timeout is <code>CONFIG_ESP_TASK_WDT_TIMEOUT_S</code>, 5 seconds by default. By default the message is only a warning; with <code>CONFIG_ESP_TASK_WDT_PANIC</code> the chip resets.</li>
   <li>Higher priorities exist: tasks run from 0 to 24 (<code>configMAX_PRIORITIES</code> is 25), and system tasks such as <code>esp_timer</code> sit high (22 by default). Interrupts outrank all tasks.</li></ul></details>`],

  ['8. Pitfalls checklist (Go deeper)', `<ul><li>Forgetting any blocking call in a task loop. Symptom: <code>task_wdt</code> naming an IDLE task.</li>
   <li>Stack too small, especially for tasks that log. Symptom: <code>***ERROR*** A stack overflow in task X has been detected</code>, or stranger crashes.</li>
   <li>Ignoring the return value of <code>xTaskCreate</code>. On a nearly full heap the task silently does not exist.</li>
   <li>Passing a pointer to a local variable of <code>app_main</code> as the task argument. Once <code>app_main</code> returns, that memory is gone. Use a static or heap-allocated object.</li>
   <li>Using <code>vTaskDelay</code> for a precise period. Work time adds to the period and it drifts; mission 3 introduces <code>vTaskDelayUntil</code> for that.</li></ul>`],
];

// One check question per section (same order as the manual; null = no question).
export const quiz = [
  { q: 'app_main() creates two tasks and then returns. What happens to the two LEDs?', opts: ['The tasks are deleted with the main task, so the LEDs stop', 'The chip resets, because app_main must never return', 'Both tasks keep running; only the main task is deleted'], a: 2, why: 'FreeRTOS was already running before app_main() started. app_main() is only the body of the main task, so returning ends that task and nothing else.' , wrong: ["The tasks have their own TCB and stack. Deleting the main task frees only the main task.", "That is true of a task function, not of app_main(). ESP-IDF's main task calls app_main() and deletes itself when it returns.", null] },
  { q: 'After your first run the chart shows one solid bar on a task row and an empty IDLE row. What does that tell you?', opts: ['That task never gives the CPU back, so nothing else can run', 'The task is Blocked on a delay', 'The IDLE task has crashed'], a: 0, why: 'A solid bar is Running without a break and an empty IDLE row means nobody left spare CPU time. A healthy task row is a dotted Blocked line with thin ticks.' , wrong: [null, "Blocked on a delay is drawn as a dotted line, and the IDLE row would be filled while it waits.", "IDLE cannot crash: it is simply never chosen while a higher-priority task stays Ready."] },
  { q: 'In the super loop the two busy-waits add up to 700 ms. Which period does BEACON actually get?', opts: ['500 ms, as written in the code', '700 ms: the whole loop has to finish before BEACON toggles again', '200 ms'], a: 1, why: 'In one thread of control every job waits for all the others. That coupling is what tasks remove.' , wrong: ["500 ms is only the first busy-wait. The loop also spends 200 ms in the second one before it comes back.", null, "200 ms is the HEART wait. BEACON has to sit through both waits."] },
  { q: 'You copy xTaskCreate(fn, "t", 2048, NULL, 1, NULL) from code written for another FreeRTOS port that counts stack in words. On ESP-IDF the stack is...', opts: ['2048 words, so 8192 bytes', '2048 kilobytes', '2048 bytes'], a: 2, why: 'ESP-IDF counts task stacks in bytes. Upstream FreeRTOS counts words, so code copied from other platforms often asks for four times too little.' , wrong: ["That is what the other port would give. ESP-IDF reads the same number as bytes.", "Stack sizes are never in kilobytes; the number is passed straight to the allocator.", null] },
  { q: 'A task polls a flag in a loop with no delay or other blocking call. What does the chart show for it and for IDLE?', opts: ['The task is always Running or Ready, and IDLE gets no time, so the watchdog fires', 'The task is Blocked most of the time and IDLE is full', 'The task row is empty and IDLE is full'], a: 0, why: 'A task that never Blocks keeps the core. The idle task starves and cannot feed the watchdog. Blocking on a delay or an event is the fix.' , wrong: [null, "Blocked needs a blocking call. A polling loop has none, so the task never leaves Running or Ready.", "An empty row means the task never ran. This one never stops."] },
  { q: 'Real hardware with the default CONFIG_FREERTOS_HZ = 100 (the game itself runs at 1000 Hz). What does vTaskDelay(pdMS_TO_TICKS(5)) do?', opts: ['Blocks for exactly 5 ms', 'Does not block at all: 5 ms rounds down to 0 ticks', 'Blocks for 10 ms, the next whole tick'], a: 1, why: 'pdMS_TO_TICKS rounds down. With a 10 ms tick anything under 10 ms becomes 0, and vTaskDelay(0) only yields. The simulator will not show this, the real board does.' , wrong: ["Delays are counted in whole ticks, and one tick is 10 ms at 100 Hz, so 5 ms cannot be represented.", null, "pdMS_TO_TICKS rounds down, not up: 5 ms becomes 0 ticks, and vTaskDelay(0) only yields."] },
  { q: 'The task watchdog message names IDLE0. What is actually wrong?', opts: ['The idle task has crashed', 'The heap is full', 'Some task on core 0 never blocks, so the idle task could not run'], a: 2, why: 'The idle task is the victim, not the culprit. Look at the "Tasks currently running" line for the task that hogs the core.' , wrong: ["The idle task is fine. It is listed because it is the one that was kept from running.", "A full heap makes allocations fail; it does not stop the idle task from being scheduled.", null] },
  { q: 'app_main() passes &counter, a local variable, to a new task and then returns. What is the risk?', opts: ['The task reads memory that no longer belongs to counter', 'The task cannot start, because the argument must be NULL', 'Nothing, the kernel copies the variable'], a: 0, why: 'Only the pointer is passed. When app_main returns its stack is freed, so the task reads garbage. Use a static or heap object.' , wrong: [null, "The argument may be any pointer. The task starts normally and then reads stale memory.", "Only the pointer value is copied. The variable itself lives on the main task's stack, which is freed."] },
];
