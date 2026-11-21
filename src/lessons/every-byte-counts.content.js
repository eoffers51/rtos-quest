// Field manual for stage 4 (ESP-IDF): task stacks, the heap, high-water marks, RAM budgets.
// Colour vocabulary in every diagram: green = task stack, amber = TCB / static data / bookkeeping,
// cyan = heap, grey = unused or other, red = overflow, NULL or over budget.
// The worked example is a "logger" task (peak 1900 B, stack 2112 B). The mission tasks (nav, mapper) are measured by the player.
import { svg, box, arrow, note } from '../widgets.js';

const memmap = svg(720, 240, (() => {
  let s = '';
  s += '<rect class="bx d" x="20" y="14" width="200" height="212" rx="5"/>' + note(120, 32, 'internal RAM (SRAM)', 'middle');
  s += box(32, 42, 176, 36, '.data / .bss|globals, statics', 'a');
  s += box(32, 86, 176, 128, 'heap|malloc() and|xTaskCreate()', 'c');
  s += arrow(222, 120, 262, 120);
  s += note(270, 24, 'xTaskCreate(logger_task, "logger", 2112, ...)', 'start');
  s += note(270, 42, 'takes two blocks from the heap:', 'start');
  s += box(270, 54, 130, 30, 'TCB, about 350 B', 'a') + box(270, 92, 130, 72, 'stack of logger|2112 B', 'g');
  s += note(420, 74, 'task control block', 'start') + note(420, 128, 'the task\'s own stack', 'start');
  s += note(270, 192, 'No stack size is stored anywhere else.', 'start');
  s += note(270, 210, 'Real ESP32: about 300 KB of heap. The game uses 8 KB.', 'start');
  return s;
})(), 'RAM map: static data, the heap, and the TCB and stack blocks that xTaskCreate takes from the heap');

const frames = svg(720, 270, (() => {
  let s = '';
  s += note(20, 16, 'stack of logger, high addresses at the top, growing downward');
  const rows = [['saved context area', 'a', 768, 'game: 768 B base'], ['logger_task() locals', 'g', 100, '100 B'], ['format_line() locals, saved regs', 'g', 1032, 'deepest call: 1032 B'], ['free (never used)', 'd', 212, '212 B margin']];
  let y = 26; const k = 0.1;
  rows.forEach(([t, cls, n, lab]) => { const h = Math.max(22, n * k); s += box(20, y, 260, h, t, cls); if (lab) s += note(292, y + h / 2 + 4, lab); y += h; });
  s += arrow(10, 30, 10, 238, '', 0, 0);
  s += note(450, 60, 'Every call pushes a frame:', 'start') + note(450, 80, '  return address, saved registers,', 'start') + note(450, 96, '  the function\'s local variables', 'start');
  s += note(450, 124, 'Every return pops it again.', 'start');
  s += note(450, 156, 'A task switch pushes the whole CPU', 'start') + note(450, 172, 'context onto this same stack, so an', 'start') + note(450, 188, 'interrupted task needs room for that', 'start') + note(450, 204, 'too, at any depth.', 'start');
  s += note(450, 234, 'Peak use = 768 + 100 + 1032 = 1900 B.', 'start') + note(450, 252, 'It depends on the code path, not on time.', 'start');
  return s;
})(), 'Stack of one task: context area, nested call frames, unused space');

const canary = svg(720, 190, (() => {
  let s = '';
  s += box(20, 20, 230, 24, 'stack top (high address)', 'd');
  s += box(20, 44, 230, 70, 'frames in use|growing downward', 'g');
  s += box(20, 114, 230, 28, 'unused, filled with 0xA5', 'd');
  s += box(20, 142, 230, 24, 'end of stack: guard word', 'r');
  s += arrow(262, 154, 310, 154);
  s += note(320, 158, 'overwritten = overflow', 'start');
  s += note(320, 44, 'Checked when the task is switched out:', 'start');
  s += note(320, 66, 'guard bytes changed: overflow happened.', 'start');
  s += note(320, 96, 'Then the panic handler prints:', 'start');
  s += note(320, 116, 'A stack overflow in task logger', 'start') + note(320, 134, 'has been detected.', 'start');
  return s;
})(), 'Stack end with a guard word, and what detects an overwrite');

const budget = svg(720, 160, (() => {
  const X = v => 20 + v / 12000 * 680; let s = '';
  const segs = [[0, 7000, 'rest of the firmware', 'd'], [7000, 9112, 'logger', 'g']];
  segs.forEach(([a, b, t, cls]) => { s += box(X(a), 40, X(b) - X(a), 40, t, cls); });
  s += `<rect class="bx r" x="${X(9112)}" y="40" width="${X(11096) - X(9112)}" height="40" rx="5" style="fill-opacity:.15;stroke-dasharray:4 4"/>` + note(X(9112) + 6, 64, 'if 4096 B', 'start');
  s += `<line class="dash" x1="${X(10000)}" y1="26" x2="${X(10000)}" y2="96"/>` + note(X(10000) + 4, 20, 'example limit 10000', 'start');
  s += note(20, 112, 'Example: logger stack 2112 B gives 9112 B in total, under the limit.', 'start');
  s += note(20, 130, 'The same task at 4096 B gives 11096 B, over it.', 'start');
  s += note(20, 148, 'In the mission the total includes two stacks you size yourself. Add them up before you flash.', 'start');
  return s;
})(), 'RAM budget bar: rest of firmware, one sized stack, the example limit and the saved space');

export const realCode = `// main/rover_main.c   (ESP-IDF v5.x)   stage 4: stage 3 plus navigation and terrain mapping, within a RAM budget
#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_heap_caps.h"
#include "esp_system.h"
#include "esp_log.h"

#define PRIO_NAV     1
#define PRIO_MAPPER  1
#define FRAME_BYTES  2048          // game number: one terrain frame buffer

// Sizes come from measurement, not from copy and paste. Worked example from the manual, a logger task:
//   peak use 1900 B (768 B base + 100 B locals + format_line() 1032 B) -> stack 2112 B, margin 212 B
// For nav and mapper, start from 4096, run the worst case, read uxTaskGetStackHighWaterMark(NULL),
// then set peak + margin. Leave 10 percent or more in real firmware.
// ESP-IDF gives the stack depth in BYTES (vanilla FreeRTOS uses words).
#define STACK_NAV    4096          // MEASURE: replace with peak + margin
#define STACK_MAPPER 4096          // MEASURE: replace with peak + margin

static const char *TAG = "rover";

// The game's work functions, stubbed here so the file builds. In the game they burn the CPU time and stack noted below.
static void plan_path(void) { /* path planning: deep locals, measure the peak */ }
static void process_frame(uint8_t *buf, size_t len) { (void)buf; (void)len; /* terrain mapping */ }

static void nav_task(void *arg)
{
    for (;;) {
        plan_path();                                   // about 20 ms of CPU, deep call chain
        // Peak so far: the smallest amount of stack that was ever left, in bytes.
        ESP_LOGD(TAG, "nav stack free at peak: %u B", (unsigned)uxTaskGetStackHighWaterMark(NULL));
        vTaskDelay(pdMS_TO_TICKS(250));                // 1000 Hz tick as in the game; at the default 100 Hz this is 25 ticks of 10 ms
    }
}

static void mapper_task(void *arg)
{
    for (;;) {
        uint8_t *frame = malloc(FRAME_BYTES);          // pvPortMalloc() underneath; NULL when the heap cannot serve it
        if (frame == NULL) {                           // the original bug: nobody checked, and nobody freed
            ESP_LOGE(TAG, "no memory for a frame, free heap %u B, largest block %u B",
                     (unsigned)esp_get_free_heap_size(),
                     (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_8BIT));
            vTaskDelay(pdMS_TO_TICKS(250));
            continue;
        }
        process_frame(frame, FRAME_BYTES);             // about 10 ms
        free(frame);                                   // the fix: every malloc() has exactly one free()
        ESP_LOGD(TAG, "mapper stack free at peak: %u B", (unsigned)uxTaskGetStackHighWaterMark(NULL));
        vTaskDelay(pdMS_TO_TICKS(250));
    }
}
// beacon_task, heart_task, motor_task, camera_task, telemetry_task, spectro_task: unchanged from stage 3

void app_main(void)
{
    // ... GPIO setup and the stage 1 to 3 tasks, unchanged ...
    // Return value unchecked for brevity: check == pdPASS in real code. Stack and TCB are two heap blocks,
    // so a full heap makes xTaskCreate() return errCOULD_NOT_ALLOCATE_REQUIRED_MEMORY.
    xTaskCreate(nav_task,    "nav",    STACK_NAV,    NULL, PRIO_NAV,    NULL);
    xTaskCreate(mapper_task, "mapper", STACK_MAPPER, NULL, PRIO_MAPPER, NULL);

    ESP_LOGI(TAG, "free heap %u B, lowest ever %u B",
             (unsigned)esp_get_free_heap_size(), (unsigned)esp_get_minimum_free_heap_size());
}

// Build notes
//   idf.py build size              total flash and RAM use of the image
//   idf.py size-components         static RAM per component (stacks of tasks are NOT in here: they come from the heap at run time)
//   idf.py menuconfig              Component config -> FreeRTOS -> Kernel -> Check for stack overflow (CONFIG_FREERTOS_CHECK_STACKOVERFLOW_CANARY, the default)
//                                  Component config -> Heap memory debugging -> Heap corruption detection (CONFIG_HEAP_POISONING_LIGHT)
//   To find the real peak of a task: print uxTaskGetStackHighWaterMark(NULL) after it has run its deepest path, then add a margin.
//   Static allocation (no heap involved): StaticTask_t tcb; static StackType_t stack[2112]; xTaskCreateStatic(logger_task, "logger", 2112, NULL, 1, stack, &tcb);`;

export const manual = [
  ['1. Where the RAM goes: stacks, heap, static data', `<p>An ESP32 has a few hundred kilobytes of internal RAM, and everything the firmware needs at run time comes out of it. Three kinds of use matter here:</p>
   <ul><li><b>Static data:</b> global and <code>static</code> variables (<code>.data</code> and <code>.bss</code>). Fixed size, known at link time, visible in <code>idf.py size</code>.</li>
   <li><b>The heap:</b> everything from <code>malloc()</code>, <code>pvPortMalloc()</code> and the kernel's own allocations. Grows and shrinks while the program runs.</li>
   <li><b>Task stacks and TCBs:</b> not a separate region. <code>xTaskCreate()</code> asks the heap for two blocks, one for the stack and one for the task control block (TCB, roughly 350 bytes; the exact size depends on version and config; the lab below uses 352). They live until the task is deleted.</li></ul>
   ${memmap}
   <p>That is why a task with a large stack costs RAM all the time, even while it is Blocked. Ten tasks at 4096 bytes each are 40 KB gone, whatever they do.</p>
   <p><b>The game simplifies the numbers.</b> A real ESP32 has about 300 KB of heap for your application. The game gives the rover 8 KB so that a leak or an oversized stack shows up within a second of simulated time. The 768-byte base stack, the 96 bytes per kernel object and the 2048-byte frame buffer are game numbers. The reasoning transfers; the sizes do not.</p>
   <p>Create tasks in the lab until the heap is full. Look at what happens to the return value.</p>
   <div data-w="heap"></div>`],

  ['2. What lives on a task\'s stack', `<p>Every task has its own stack, so that it can be paused in the middle of anything and resumed later. A stack holds three things:</p>
   <ul><li><b>Call frames:</b> each function call pushes a return address, saved registers and the callee's local variables. Returning pops them.</li>
   <li><b>Local variables:</b> <code>char buf[512]</code> inside a function takes 512 bytes of stack for as long as the function runs. <code>printf</code> and the <code>ESP_LOGx</code> macros are hungry here: they format into stack buffers and call deep library code.</li>
   <li><b>The saved context:</b> when the scheduler switches a task out, all CPU registers go onto that task's stack. The task needs room for this at any moment, including at its deepest call. The game models it as a 768-byte base for every task.</li></ul>
   ${frames}
   <p><b>Worked example.</b> The size you need is <b>base + the deepest call chain</b> that any code path can reach. A logger task has 100 bytes of locals and calls <code>format_line()</code>, which needs 1032 bytes. Peak use is 768 + 100 + 1032 = 1900 bytes. With a margin of about 11 percent the stack is 2112 bytes.</p>
   <p><b>Your turn, in the mission.</b> The nav task calls <code>planPath()</code> and the mapper calls <code>processFrame()</code>. Their stack costs are not given here. Run them, read the peak from the result table, and apply the same sum.</p>
   <p>Three consequences that surprise people:</p>
   <ul><li>Peak use depends on the <b>worst path</b>, not the average one. An error branch that logs a long message may be the deepest path and runs once a month.</li>
   <li>Recursion has no fixed depth. Each level takes a frame, so an unbounded recursion eats any stack.</li>
   <li>Huge local arrays belong in the heap or in <code>static</code> storage. A 4 KB buffer on a 4 KB stack overflows on entry.</li></ul>
   <p>In ESP-IDF the stack depth argument of <code>xTaskCreate()</code> is in <b>bytes</b>. Vanilla FreeRTOS counts words, so older tutorials need translating. 4096 is the common starting point in the examples. A starting point is not a measurement.</p>
   <details><summary>Going deeper (not needed for the mission): configMINIMAL_STACK_SIZE</summary>
   <p>In ESP-IDF <code>configMINIMAL_STACK_SIZE</code> is not a fixed number: it follows the idle task stack size setting (<code>CONFIG_FREERTOS_IDLE_TASK_STACKSIZE</code>, default 1536 bytes, 768 at the lowest) plus any configured stack overhead. It sizes the idle task and is not a minimum that <code>xTaskCreate()</code> enforces. The 768-byte base used in the game is a game number.</p></details>`],

  ['3. Stack overflow: how it is detected and what it looks like', `<p>When the frames grow past the end of the stack, the next write goes into whatever block sits beside it on the heap: another task's stack, a TCB, a buffer. The result is corrupted data that fails far away from the cause. For that reason FreeRTOS tries to catch the overflow as early as it can.</p>
   ${canary}
   <p>The default check in ESP-IDF is the <b>canary</b> (<code>CONFIG_FREERTOS_CHECK_STACKOVERFLOW_CANARY</code>, set in <code>menuconfig</code> under FreeRTOS, Kernel): the last bytes of the stack are filled with a known pattern. At every task switch the kernel checks that the pattern is intact. It catches an overflow that wrote through the guard, but only at the next switch, after the damage is done.</p>
   <p>The result is a panic with a message of the form <code>***ERROR*** A stack overflow in task logger has been detected.</code> followed by a register dump and a reboot. In the game the same event is a crash on the serial monitor with the task name. Read the task name first: it tells you which stack to enlarge.</p>
   <p><b>The check is not instant.</b> An overflow that happens and is gone before the next task switch is never seen, and a large local array can skip over the guard word without touching it. Detection is a safety net, and sizing is the control.</p>
   <details><summary>Going deeper (not needed for the mission): other check modes and the watchpoint</summary>
   <ul><li><code>_PTRVAL</code> is the weaker variant that only checks the stack pointer; <code>_NONE</code> turns the check off.</li>
   <li><b>Watchpoint on the end of the stack (<code>CONFIG_FREERTOS_WATCHPOINT_END_OF_STACK</code>):</b> a hardware watchpoint on the last 32 bytes of the stack. It is off by default, takes one of the debug watchpoints that GDB would otherwise use, and adds about 60 bytes of stack overhead. The CPU stops on the write itself, so the report points at the real culprit. The message then reads <code>Stack canary watchpoint triggered (logger)</code>.</li></ul></details>
   <details><summary>Going deeper: why an exact fit fails at once</summary>
   <p>A task with a peak of 1900 bytes on a stack of 1792 fails on its first pass through the deepest path: it needs 108 bytes more than exist. An overflow that depends on one rare path, by contrast, can survive for weeks in the field, which is why the next section measures instead of waiting for a crash.</p></details>`],

  ['4. High-water marks: measure, do not guess', `<p>The kernel fills a new stack with a known byte pattern (0xA5 in FreeRTOS). Every byte that still holds the pattern was never touched. <code>uxTaskGetStackHighWaterMark(handle)</code> counts the untouched bytes from the end of the stack and returns the smallest value that was ever seen. Pass <code>NULL</code> for the calling task.</p>
   <ul><li>In ESP-IDF the return value is in <b>bytes</b>. In vanilla FreeRTOS it is words.</li>
   <li>The value only goes down. It is a <b>low-water mark of free stack</b>, which is the same as a high-water mark of used stack. The game's result screen shows it as "unused stack" and "peak use".</li>
   <li>It only knows paths that have run. Run the deepest path of the task before you trust the number: error handling, the longest message, the first lap after boot.</li>
   <li>The reading is the smallest free space ever, so a task reporting <b>180</b> has come within 180 bytes of overflowing, and that 180 is its whole margin.</li></ul>
   <p>Procedure: start generous, run the worst case, read the mark, set the size to <b>peak plus 10 percent or more</b>, and run again. The lab below has the game's measured numbers for nav and mapper. Before you touch it, find their peaks yourself from the mission's result table or by reasoning from the call chain, then check your figures against the lab. Drag each stack below its peak to see an overflow. Then find the smallest sizes that keep both margins above 128 bytes and the RAM under the limit.</p>
   <div data-w="stacklab"></div>`],

  ['5. The heap: malloc, free and leaks', `<p><code>malloc()</code> in ESP-IDF ends in the heap allocator, which hands out blocks from lists of free regions. The same allocator serves <code>pvPortMalloc()</code> and <code>xTaskCreate()</code>. There is one pool, so a leak in one task starves every other.</p>
   <ul><li><b>NULL means no.</b> When no free block is big enough, <code>malloc()</code> returns <code>NULL</code>. Code that goes on to write through the pointer writes to address 0 and panics with a load or store fault. By default the allocator does not abort for you. With <code>CONFIG_HEAP_ABORT_WHEN_ALLOCATION_FAILS</code> it does, which is blunt but at least loud.</li>
   <li><b>A leak</b> is memory allocated and never freed. It does not show on the first lap. The heap drains by one buffer per lap until the last allocation fails, and the crash message points at the victim, not at the leaking code.</li></ul>
   ${svg(720, 70, (() => {
     let s = note(20, 16, 'leak: one block more per lap, none returned');
     for (let i = 0; i < 4; i++) s += box(20 + i * 70, 24, 66, 28, 'frame ' + (i + 1), 'c');
     s += box(300, 24, 66, 28, 'NULL', 'r');
     return s;
   })(), 'A heap bar filling with leaked frames until the next allocation returns NULL')}
   <p>The lab models the mapper task: one 2048-byte buffer per lap in an 8192-byte heap. Change what the loop frees and how slowly it runs.</p>
   <div data-w="leaklab"></div>
   <p>A slow loop is the classic false cure. It stretches the time to the crash from a second to a minute, and the bug stays. In the game this answer passes the build and fails the heap objective.</p>
   <details><summary>Going deeper (not needed for the mission): fragmentation</summary>
   <p>Fragmentation is the other way to run out. Free bytes can be plentiful in total and still be scattered between live blocks. A 2048-byte request fails when the largest free block is 1500, whatever the total says. The game does not simulate this.</p>
   ${svg(720, 70, (() => {
     let s = note(20, 16, 'fragmentation: 4 KB free in total, but not in one piece');
     const pat = ['g', 'd', 'g', 'd', 'g', 'd', 'g', 'd'];
     pat.forEach((cls, i) => { s += box(20 + i * 46, 24, 44, 28, cls === 'g' ? 'used' : 'free', cls === 'g' ? 'c' : 'd'); });
     s += note(400, 42, 'largest free block: 512 B', 'start');
     return s;
   })(), 'A heap bar full of small free holes')}</details>`],

  ['6. Budgets and margins', `<p>A flight board has a RAM budget. Everything you reserve is gone for good, so every stack must be as small as the code allows. Every stack must also be bigger than the code needs. The rule that resolves this:</p>
   <pre>stack = measured peak + margin       margin: 10 percent or more of the peak, never zero</pre>
   ${budget}
   <ul><li><b>Why not exactly the peak?</b> The peak is measured on the inputs you tried. A new sensor value, an added log call, one more local, a library update or a different compiler setting moves it. A margin of zero turns the next small change into a crash that only shows up in the field.</li>
   <li><b>Why not 4096 everywhere?</b> The 4096 in the examples fits their tasks, not yours. In the diagram a single oversized stack already pushes the total past the limit. Add up all of your stacks against the budget.</li>
   <li><b>Debug builds need more.</b> Compiling without optimisation, enabling stack protection or heavy logging all raise the peak. Measure the build you ship.</li></ul>
   <p>On a real ESP32 you often have megabytes of flash and 300 KB of heap, and the temptation is to give everything 8 KB and forget it. The discipline matters for the small parts, for dozens of tasks, and for the day the heap is 90 percent full and the Wi-Fi stack needs a block.</p>`],

  ['7. Real ESP-IDF tools', `<p><b>The three you need for the mission:</b></p>
   <ul><li><code>uxTaskGetStackHighWaterMark(NULL)</code>: free stack at the peak, in bytes, per task. Print it from a debug build after the worst case.</li>
   <li><code>esp_get_free_heap_size()</code>: free heap now. <code>esp_get_minimum_free_heap_size()</code>: the lowest it has ever been since boot, which catches a dip that recovered.</li>
   <li><code>free()</code> for every <code>malloc()</code>, and a <code>NULL</code> check on the result.</li></ul>
   <details><summary>Going deeper (not needed for the mission): more tools</summary>
   <ul><li><code>heap_caps_get_largest_free_block(MALLOC_CAP_8BIT)</code>: the biggest single allocation that would succeed now. A large gap to the free total means fragmentation. <code>heap_caps_get_free_size()</code> and <code>heap_caps_print_heap_info()</code> report per capability and per region.</li>
   <li><b>Finding heap bugs:</b> <code>CONFIG_HEAP_POISONING_LIGHT</code> catches buffer overruns and underruns with canary words at the head and tail of each block, checked on free and on integrity checks. <code>CONFIG_HEAP_POISONING_COMPREHENSIVE</code> also fills freed memory with 0xFE, so a write after free is caught the next time the block is checked. <code>CONFIG_HEAP_TRACING_STANDALONE</code> with <code>heap_trace_start()</code> and <code>heap_trace_dump()</code> lists every block still allocated and who allocated it. <code>heap_caps_check_integrity_all()</code> checks the heap on demand.</li>
   <li><code>idf.py size</code>, <code>size-components</code> and <code>size-files</code>: static RAM and flash by component. They do not include task stacks, which are heap.</li>
   <li><code>xTaskCreateStatic()</code>: you provide the stack array and the TCB (a <code>StaticTask_t</code>) as static storage. Nothing comes from the heap, so creation cannot fail at run time and the RAM shows up in <code>idf.py size</code>. In ESP-IDF <code>StackType_t</code> is a byte, so the array length is in bytes.</li>
   <li><code>vTaskList()</code> and <code>vTaskGetInfo()</code> (with the trace facility enabled) print the free stack of every task in one table.</li></ul>
   <p>A use-after-free is not caught by the game: it lets <code>freeFrame</code> run before <code>processFrame</code> and passes. A real heap with comprehensive poisoning enabled can flag it. Free only after the last use.</p></details>`],
];

export const quiz = [
  { q: 'xTaskCreate(fn, "nav", 4096, NULL, 1, NULL) returns errCOULD_NOT_ALLOCATE_REQUIRED_MEMORY although 4200 bytes of heap are free. What did the call need besides the stack?', opts: ['A separate stack region, which is full while the heap is not', 'A task control block from the same heap, so the call needs more than 4096 bytes', 'A second copy of the stack, kept for the context switch'], a: 1, why: 'The stack and the TCB are two heap blocks. 4096 plus the TCB (about 350 B) does not fit in 4200. Always check the return value and size the heap with the TCBs in mind.', wrong: ["There is no separate stack region. The stack and the task control block are both allocated from the same heap.", null, "The kernel keeps no second copy of the stack. A context switch saves the registers onto the task's own stack, so no extra block is needed for it."] },
  { q: 'A function inside a task adds a 600-byte local array to a call chain that peaked at 1900 bytes of a 2112-byte stack. What happens?', opts: ['The task runs out of stack at run time, damages a neighbouring heap block, and is caught later by the canary check or crashes elsewhere', 'The compiler reports the stack error at build time, so it never reaches the board', 'The kernel grows the stack by the missing bytes the first time the task needs them'], a: 0, why: 'Stacks are fixed blocks. Nothing grows them. The function now needs 2500 bytes at its peak against 2112, and the overflow is only reported at the next check, if at all.', wrong: [null, "Nothing in a normal build checks the real worst-case stack depth of a task, so the problem appears at run time, not at build time.", "Stacks are fixed blocks allocated when the task is created. Nothing resizes them while the task runs."] },
  { q: 'The canary check is enabled and the firmware does not report a stack overflow. Does that prove no task has overflowed?', opts: ['Yes, the kernel compares the guard word on every instruction', 'No, it is checked at task switches and can miss damage that was undone or that jumped over the guard word', 'Yes, as long as the build runs on the dual-core ESP32'], a: 1, why: 'The canary is a safety net checked at switches. A large local array can step over the guard word, and between switches nothing looks. Measure the high-water mark and keep a margin.', wrong: ["The check runs at task switches, not on every instruction, so damage between two switches is not seen.", null, "The check works the same on one core or two. The number of cores has no influence on whether a missed overflow goes unseen."] },
  { q: 'uxTaskGetStackHighWaterMark(NULL) in a task returns 180 after a long run of the worst-case path. What was the safety margin of that stack?', opts: ['180 bytes of used stack, so the task has plenty of room left', '180 percent of the peak, the usual rule for a margin', '180 bytes, the smallest free stack ever seen'], a: 2, why: 'The value is the free stack at the deepest point so far. 180 bytes is the margin. If the worst case has not run yet, the real margin may be smaller.', wrong: ["The value counts unused bytes, not used ones. A low number means little room is left, not plenty.", "The value is a count of bytes of free stack, not a percentage of the peak.", null] },
  { q: 'A mapper task allocates a 2048-byte buffer every lap and forgets free(). A colleague changes the loop delay from 250 ms to 400 ms to avoid the crash. What is the result?', opts: ['The leak is fixed because the heap has more time to recover between laps', 'The allocation fails sooner because a longer lap holds the buffer longer', 'The heap still drains by 2048 bytes per lap, so the crash comes later but still comes'], a: 2, why: 'Time does not return memory. Only free() does. A slower loop hides the bug in a short test and moves it to a field failure after minutes.', wrong: ["Waiting does not give memory back. Only free() does, and a leaked block stays allocated however long the loop sleeps.", "The buffer is not held longer. It is never freed in either case, and the lap time only changes how fast the blocks pile up.", null] },
  { q: 'A task\'s deepest call chain needs 1900 B on top of the 768 B base, so its peak is 2668 B. Which stack size follows the rule peak plus 10 percent or more, without wasting RAM?', opts: ['2668 bytes, exactly the peak, so nothing is wasted', '3000 bytes, the peak plus a margin of about 12 percent', '4096 bytes, the usual default for a task of this size'], a: 1, why: '2668 has no margin, so the next code change can overflow it. 4096 is a default, not a measurement, and wastes about 1400 B. 3000 is at least 2668 + 267 = 2935 B and stays close to the peak.', wrong: ["2668 is the measured peak with no margin at all. One new local variable or log call pushes the stack over the edge.", null, "4096 would work, but it is a default, not a measurement. The rule is peak plus about 10 percent, and 4096 wastes RAM that other tasks may need."] },
  { q: 'In stage 3 the spectrometer had to run at 50 Hz while nav now adds about 20 ms of CPU every 250 ms lap. Which call in the spectrometer loop keeps the average rate at 50 Hz even when nav delays one sample?', opts: ['vTaskDelay(20) after each sample, so every lap is 20 ms of sleep', 'vTaskDelayUntil() with a 20 ms period from a fixed mark', 'vTaskDelay(15), a shorter sleep that cancels the sample time'], a: 1, why: 'vTaskDelay counts from the moment it is called, so work time and delays add up and the loop falls behind. vTaskDelayUntil counts from a fixed mark, so a late sample is followed by a shorter sleep.', wrong: ["vTaskDelay(20) counts from the call, after the work, so each lap is work plus 20 ms and the rate falls below 50 Hz.", null, "A shorter fixed delay fits one average work time. The work varies, so the period still varies and drifts, and any change in the work breaks it."] },
];
