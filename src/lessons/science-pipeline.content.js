// Field manual for stage 5 (ESP-IDF): queues, blocking on a queue, sizing, priorities around a queue, ISRs.
import { svg, box, arrow, note, stateKey } from '../widgets.js';

// Local note with a larger font than the shared .at class (about 10 px once the SVG is scaled).
const nt = (x, y, t, anchor = 'start') => `<text class="at" style="font-size:14px" x="${x}" y="${y}" text-anchor="${anchor}">${t}</text>`;
const cap = t => `<p class="cap"><small>${t}</small></p>`;

const problem = svg(720, 170, (() => {
  const X = t => 110 + t * 5.6; let s = '';
  s += nt(100, 40, 'instrument', 'end') + nt(100, 100, 'science task', 'end');
  [0, 20, 40, 60, 80].forEach((t, k) => { const lost = k === 1 || k === 3; s += `<line class="${lost ? 'dash' : 'tick'}" x1="${X(t)}" y1="24" x2="${X(t)}" y2="48" ${lost ? 'style="stroke:#ff5d4d;stroke-width:3"' : ''}/>` + nt(X(t), 16, k + (lost ? ' lost' : ''), 'middle'); });
  s += `<rect class="bx c" x="${X(0)}" y="86" width="${X(48) - X(0)}" height="22" rx="2"/>` + `<rect class="bx c" x="${X(48)}" y="86" width="${X(96) - X(48)}" height="22" rx="2"/>`;
  s += nt((X(0) + X(48)) / 2, 102, 'transmit(0)', 'middle') + nt((X(48) + X(96)) / 2, 102, 'transmit(2)', 'middle');
  s += `<line class="ar" x1="${X(0)}" y1="132" x2="${X(100)}" y2="132" marker-end="url(#ah)"/>` + [0, 20, 40, 60, 80, 100].map(t => nt(X(t), 154, t + ' ms', 'middle')).join('');
  return s;
})(), 'A task that transmits for 48 ms misses two of every five samples');

const ring = svg(720, 228, (() => {
  let s = note(20, 22, 'xQueueCreate(4, sizeof(sample_t)): four slots, storage allocated once', 'start');
  const slots = ['s5', 's6', 's7', ''];
  for (let i = 0; i < 4; i++) s += box(150 + i * 90, 50, 80, 50, slots[i] || 'free', slots[i] ? 'c' : 'd');
  s += arrow(190, 150, 190, 104, 'head: next to receive', 100, 44, 'start') + arrow(460, 150, 460, 104, 'tail: next free slot', 90, 44, 'start');
  s += note(20, 80, 'FIFO order', 'start') + note(20, 98, 'count = 3', 'start');
  s += note(150, 200, 'xQueueSend copies the item in at the tail.', 'start') + note(150, 218, 'xQueueReceive copies the oldest one out of the head.', 'start');
  return s;
})(), 'A queue as a ring buffer with head, tail and count');

const blocking = svg(760, 215, (() => {
  let s = box(10, 50, 150, 50, 'Running|xQueueReceive', 'run') + box(310, 50, 170, 50, 'Blocked on the queue|waits for an item', 'blko') + box(630, 50, 120, 50, 'Ready|waits for CPU', 'rdy');
  s += arrow(160, 75, 308, 75) + nt(234, 98, 'empty, timeout &gt; 0', 'middle') + arrow(480, 75, 628, 75) + nt(554, 98, 'item arrives / timeout', 'middle');
  s += `<polyline fill="none" class="ar" points="690,104 690,150 85,150 85,104" marker-end="url(#ah)"/>`;
  s += nt(390, 172, 'scheduler picks it: it resumes inside xQueueReceive', 'middle');
  s += stateKey(40, 203);
  return s;
})(), 'Task states around a blocking queue receive');

const prioHigh = svg(720, 100, (() => {
  const X = t => 150 + t * 5.4; let s = '';
  s += nt(140, 30, 'science (prio 2)', 'end') + nt(140, 66, 'camera (prio 1)', 'end');
  s += `<rect class="bx c" x="${X(0)}" y="18" width="${X(3) - X(0)}" height="16" rx="2"/>` + `<rect class="bx t-camera" x="${X(3)}" y="54" width="${X(20) - X(3)}" height="16" rx="2"/>` + `<rect class="bx c" x="${X(20)}" y="18" width="${X(23) - X(20)}" height="16" rx="2"/>` + `<rect class="bx t-camera" x="${X(23)}" y="54" width="${X(60) - X(23)}" height="16" rx="2"/>`;
  s += `<line class="dash" x1="${X(20)}" y1="10" x2="${X(20)}" y2="78"/>` + nt(X(20), 94, 'sample at 20 ms', 'middle');
  return s;
})(), 'Reader above the camera preempts it at once');

const prioEqual = svg(720, 100, (() => {
  const X = t => 150 + t * 5.4; let s = '';
  s += nt(140, 30, 'science (prio 1)', 'end') + nt(140, 66, 'camera (prio 1)', 'end');
  s += `<rect class="bx t-camera" x="${X(0)}" y="54" width="${X(20) - X(0)}" height="16" rx="2"/>`;
  for (let t = 20; t < 36; t++) s += t % 2 === 0 ? `<rect class="bx c" x="${X(t)}" y="18" width="${X(t + 1) - X(t)}" height="16"/>` : `<rect class="bx t-camera" x="${X(t)}" y="54" width="${X(t + 1) - X(t)}" height="16"/>`;
  s += `<rect class="bx t-camera" x="${X(36)}" y="54" width="${X(60) - X(36)}" height="16" rx="2"/>`;
  s += `<line class="dash" x1="${X(20)}" y1="10" x2="${X(20)}" y2="78"/>` + nt(X(20), 94, 'sample at 20 ms', 'middle');
  return s;
})(), 'Reader at the camera level shares the CPU in 1 ms slices');

export const realCode = `// main/rover_main.c   (ESP-IDF v5.x)   stage 5: science pipeline, a reader and a radio decoupled by a queue
// Build: idf.py build flash monitor
// Needs CONFIG_FREERTOS_HZ=1000, the game's tick. At the ESP-IDF default of 100 Hz one tick is 10 ms, so pdMS_TO_TICKS(5) would be 0 ticks.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "driver/gpio.h"
#include "esp_log.h"

#define SAMPLE_QUEUE_LEN   3     // 2 is the minimum for a burst of 5 at 20 ms with a 48 ms radio; 3 leaves one spare slot
#define PRIO_SCIENCE       2     // above camera (1) so it meets the instrument's 20 ms deadline, below motor (3)
#define PRIO_RADIO         1     // slow but not urgent

typedef struct { float bin[32]; } sample_t;      // one spectrum: 32 floats = 128 bytes

static const char *TAG = "science";
static QueueHandle_t samples;                    // queue of sample_t, copied by value

void read_sample(sample_t *out);                 // blocks until the instrument has a sample (about 1 ms of work)
void transmit(const sample_t *x);                // blocks 45 ms, 3 ms of CPU

static void science_task(void *arg)              // fast: never waits for the radio unless the queue is full
{
    sample_t s;
    for (;;) {
        read_sample(&s);
        // portMAX_DELAY: if the queue is full, wait for space rather than drop the sample.
        if (xQueueSend(samples, &s, portMAX_DELAY) != pdPASS) {
            ESP_LOGE(TAG, "send failed");        // not reachable with portMAX_DELAY, kept for the 0-tick variant
        }
    }
}

static void radio_task(void *arg)                // slow: drains the backlog at its own pace
{
    sample_t s;
    for (;;) {
        if (xQueueReceive(samples, &s, portMAX_DELAY) == pdPASS) {   // Blocked here, at zero CPU, while the queue is empty
            transmit(&s);
        }
    }
}

// beacon_task, heart_task, motor_task, telemetry_task, spectro_task, nav_task, mapper_task: unchanged from stage 4

void app_main(void)
{
    // ... GPIO setup and the tasks from stage 4 ...
    samples = xQueueCreate(SAMPLE_QUEUE_LEN, sizeof(sample_t));      // 3 x 128 B of storage plus the queue control block, one heap allocation
    if (samples == NULL) { ESP_LOGE(TAG, "no heap for the queue"); return; }

    // Create the queue BEFORE the tasks that use it: a task that runs first would use a NULL handle.
    // Stack sizes are in bytes in ESP-IDF. Peak use plus margin: science 768 + 400, radio 768 + 1200.
    xTaskCreate(science_task, "science", 1280, NULL, PRIO_SCIENCE, NULL);
    xTaskCreate(radio_task,   "radio",   2048, NULL, PRIO_RADIO,   NULL);

    ESP_LOGI(TAG, "queue holds %u of %u", (unsigned)uxQueueMessagesWaiting(samples), SAMPLE_QUEUE_LEN);
}

// Useful checks on real hardware:
//   uxQueueMessagesWaiting(samples)   items in the queue right now
//   uxQueueSpacesAvailable(samples)   free slots; a value stuck at 0 means the radio cannot keep up
//   uxTaskGetStackHighWaterMark(NULL) free stack in the calling task`;

export const manual = [
  ['1. The problem: a slow consumer', `<p>A producer makes data at its own pace. A consumer handles it at another. The instrument on the rover makes a burst of five samples 20 ms apart. <code>transmit()</code> needs 45 ms of blocked time and 3 ms of CPU, 48 ms in all. A task that reads a sample, transmits it and reads the next cannot keep up: it is inside <code>transmit()</code> while two more samples arrive. The instrument holds one sample, so each new one overwrites the one nobody has read.</p>
   ${problem}
   ${cap('<code>transmit()</code> holds the task for 48 ms. The instrument makes a sample every 20 ms and keeps only the newest, so samples 1 and 3 are overwritten unread: 3 of 5 get through per burst, 6 of 10 over two bursts.')}
   <ul><li>This bug has no error code. Nothing fails. The data is just missing, and the game reports it as "overwritten inside the instrument".</li>
   <li>It is the same bug class as a UART FIFO overrun, an ADC result register read too late or an I2S DMA buffer that is not refilled. Whenever a producer is bound to a clock you do not control, a slow consumer loses data.</li>
   <li>Making <code>transmit()</code> faster is not a fix, only a smaller number. The fix is to <b>decouple</b> the two: a fast task that always reaches the instrument in time, and a slow task that works through what the fast one collected. They need a place to hand the data over. In FreeRTOS that place is a queue.</li></ul>`],

  ['2. What a queue is', `<p>A FreeRTOS queue is a fixed-size FIFO buffer owned by the kernel. You choose the number of items and the size of one item when you create it. After that the kernel does the locking, the copying and the waking of tasks.</p>
   ${ring}
   <pre>QueueHandle_t q = xQueueCreate(length, itemSize);          // NULL if the heap is too small
BaseType_t    r = xQueueSend(q, &item, ticksToWait);        // pdPASS, or errQUEUE_FULL
BaseType_t    r = xQueueReceive(q, &item, ticksToWait);     // pdPASS, or pdFALSE (queue empty after the timeout)</pre>
   <ul><li><b>Copy by value.</b> <code>xQueueSend</code> copies <code>itemSize</code> bytes from your variable into the queue, <code>xQueueReceive</code> copies them out. The sender can reuse its variable at once. The cost is one <code>memcpy</code> per side, which grows with the item size.</li>
   <li><b>One allocation.</b> <code>xQueueCreate</code> takes one block from the heap: the control block (roughly 80 bytes on the ESP32; it varies with config options) plus <code>length x itemSize</code> of storage. The game rounds the control block to 96 B, so its queue of length L and 128-byte items costs <code>96 + L x 128</code> bytes.</li>
   <li><b>FIFO.</b> The oldest item comes out first.</li>
   <li><code>uxQueueMessagesWaiting(q)</code> is the item count, <code>uxQueueSpacesAvailable(q)</code> the free slots.</li>
</ul>
   <p>A queue is created at run time, so it must exist before any task uses its handle. Create it first in <code>app_main()</code>, check for <code>NULL</code> and only then create the tasks.</p>`],

  ['3. Blocking on a queue', `<p>The third argument of every queue call is a timeout in ticks. It decides what happens when the call cannot finish at once: <code>xQueueReceive</code> on an empty queue, <code>xQueueSend</code> on a full one.</p>
   ${blocking}
   <pre>timeout 0                  never waits: returns at once with pdFALSE / errQUEUE_FULL
timeout pdMS_TO_TICKS(100) waits up to 100 ms, then returns the failure code
timeout portMAX_DELAY      waits forever: the call returns only when it has succeeded</pre>
   <ul><li><b>A blocked task costs nothing.</b> The kernel moves it from the ready list to the wait list of that queue. It is not polled and uses no CPU, and the idle task and the lower priorities run in the gap. A radio task with <code>portMAX_DELAY</code> sits at zero CPU until a sample arrives.</li>
   <li><b>Polling is the lazy alternative:</b> <code>xQueueReceive(q, &s, 0)</code> in a loop never blocks. It returns at once, the task stays Ready and burns CPU. In the game a polling radio raises CPU use from about 90 to 95 percent, which costs a star.</li>
   <li>When the item arrives, the blocked task becomes Ready. If it outranks the running task it preempts it at once (stage 2).</li>
   <li><b>A blocking send applies back-pressure.</b> If the queue is full and the sender waits, the producer slows to the speed of the consumer. That is safe for data you must not lose. It is wrong for a task that has its own deadline: while the reader is stuck in <code>xQueueSend</code> it is not reading the instrument.</li>
   <li>Always look at the return value when the timeout is not <code>portMAX_DELAY</code>. A send with timeout 0 that ignores <code>errQUEUE_FULL</code> silently drops data. The game counts it as "dropped because the queue was full".</li></ul>
   <p>Drive a task through the state it enters while it waits on an empty queue. The queue event is the second button.</p>
   <div data-w="states"></div>`],

  ['4. Sizing the queue', `<p>A queue absorbs a <b>burst</b>. It does not fix an average rate that is too high: if the producer is faster than the consumer for ever, any queue fills up. Here the average is fine (10 samples in a second, 480 ms of radio time) and only the short burst is the problem. Then the length follows from arithmetic.</p>
   <pre>backlog = samples that have arrived - samples the radio has already taken

burst of 5 at t = 0, 20, 40, 60, 80 ms, radio takes one every 48 ms:
  at 80 ms: 5 arrived, the radio took 2 (at 0 and 48) -> 3 are waiting at the peak
  the reader itself holds one of them (blocked in the send), so the queue needs 2</pre>
   <p>Length 2 is the minimum. Length 3 gives one spare slot for the case where the radio is a little slower than measured. Length 20 also works and wastes RAM. Change the numbers below and find the shortest queue yourself. The length 0 setting stands for the original design with no queue.</p>
   <div data-w="queuelab"></div>
   <ul><li><b>RAM:</b> <code>length x itemSize + control block</code>, 96 + 3 x 128 = 480 B here. Each extra slot costs 128 B. The game's RAM budget turns that into a star.</li>
   <li><b>Item size matters.</b> Every send and receive copies the whole item. A 128-byte spectrum is fine. A 4 KB frame in a queue costs two 4 KB copies per hop and 4 KB for every slot. Large data goes by pointer: put the address in the queue and keep the buffer elsewhere (the heap or a pool).</li>
   <li><b>Ownership rule for pointers.</b> The queue does not own what the pointer points to. Exactly one task owns the buffer at any time: the sender gives it up when it sends, the receiver frees or returns it. A sender that keeps writing to the buffer after the send corrupts the data in flight.</li>
   <li><b>Do not hide an average overload.</b> Add <code>uxQueueSpacesAvailable()</code> to a debug log. A queue that is always nearly full means the consumer is too slow, and making the queue longer only delays the loss.</li></ul>`],

  ['5. Priorities around a queue', `<p>A queue changes who waits for whom, so the priorities need a second look. The two tasks in the pipeline have different jobs:</p>
   <ul><li><b>The reader has a deadline.</b> It must be at the instrument within 20 ms of every sample. It needs almost no CPU (about 1 ms per sample), so a high priority is free (stage 2).</li>
   <li><b>The radio has none.</b> It works through the backlog when nothing more urgent runs. It needs 3 ms of CPU per sample and blocks for the other 45.</li></ul>
   ${prioHigh}
   ${cap('Reader at priority 2: the sample at 20 ms preempts the camera frame. The reader is at the instrument within 3 ms and goes back to sleep.')}
   ${prioEqual}
   ${cap('Reader at priority 1: the camera and the reader take turns in 1 ms slices while the frame runs. In the game this reader lost the sample at 22 ms.')}
   <ul><li>The reader must outrank the <code>camera</code>. A camera frame needs 60 ms of CPU. At the same priority the reader gets only every other tick, and the game measured a lost sample at 22 ms. In the game the reader at priority 2 passes and at priority 1 loses a sample.</li>
   <li>The reader must stay below the motor (3). At priority 3 it ties with the motor and takes ticks from its 10 ms loop, and the motor-gap objective from stage 2 fails.</li>
   <li>The radio at priority 5 would preempt the motor every time a sample arrives: 3 ms of CPU, the motor gap grows to 13 ms and the telemetry gap changes too. It is slow but not urgent, so it belongs low. Priority 2 works as well as 1, because it blocks nearly all of its time.</li>
   <li><b>A queue is not a priority fix.</b> A reader that is starved by a busy task loses samples no matter how long the queue is, because the loss happens in the instrument before the data reaches the queue.</li></ul>
   <p>Test the rule on your own pipeline in the mission: the chart shows the reader as a faded bar when it is Ready but kept off the CPU.</p>`],

  ['6. Back-pressure, and a look ahead', `<p>Two ways to wait on a queue give two different systems. A blocking send on a full queue makes the producer slow down to the consumer's speed (<b>back-pressure</b>): nothing is lost, but the producer stops. A send with timeout 0 never stops, and drops data when the queue is full. A blocking receive costs no CPU. A polling receive costs CPU all the time. Choose per task: the radio blocks forever on receive, and a task with a deadline never blocks forever on send.</p>
   <p><b>Preview, stage 7:</b> interrupts cannot block, so they use calls ending in <code>FromISR</code> (<code>xQueueSendFromISR</code>) to hand data to a task. This stage's mission does not use them.</p>
   <details><summary>Beyond this stage (optional)</summary>
   <ul><li><code>xQueueCreateStatic()</code> takes the storage from memory you provide. <code>xQueueSendToFront()</code> puts an urgent item at the head.</li>
   <li><code>xQueueOverwrite()</code> on a queue of length 1 makes a mailbox that always holds the latest value (read it with <code>xQueuePeek()</code>).</li>
   <li>Queue sets let one task wait on several queues. Stream and message buffers move byte streams with one writer and one reader.</li>
   <li>The ESP-IDF default tick is 100 Hz (<code>CONFIG_FREERTOS_HZ</code>); this game runs at 1000 Hz, so write timeouts with <code>pdMS_TO_TICKS()</code>.</li></ul></details>`],
];

export const quiz = [
  { q: 'A producer makes a sample every 20 ms and the consumer needs 48 ms for one. The producer keeps only the newest sample. In a burst of five, how many does a single task that reads and then consumes get through?', opts: ['All five, because the consumer is faster than the whole burst', 'Three: it reads sample 0, then 2 and then 4, and 1 and 3 are overwritten', 'Two: only the first and the last'], a: 1, why: 'Read at 0 ms, back at the instrument at 48 ms where the newest is sample 2 (1 was overwritten at 40), then at 96 ms where it is 4 (3 was overwritten at 80). Making the consumer a bit faster still loses samples. Decoupling is the fix.', wrong: ["The consumer needs 48 ms per sample but samples arrive every 20 ms. It is slower than the producer, and the instrument keeps only the newest sample.", null, "Follow the timeline: the task is back at the instrument at 48 ms and again at 96 ms, so it reads at 0, 48 and 96 ms, which is three samples, not two."] },
  { q: 'xQueueReceive(q, &x, 0) is called on an empty queue. What happens?', opts: ['It returns pdFALSE at once, and x still holds its old value', 'It blocks until an item arrives', 'It returns pdPASS with an item of zeros'], a: 0, why: 'A timeout of 0 never blocks. The call reports failure straight away and does not touch x. A loop built on this is polling: the task stays Ready and uses CPU.', wrong: [null, "A timeout of 0 means do not wait. Only a non-zero timeout lets a call block.", "On failure the call reports pdFALSE and copies nothing into x. Success always means a real item was copied out."] },
  { q: 'A sender calls xQueueSend(q, &x, portMAX_DELAY) on a full queue. What does it do?', opts: ['Overwrites the oldest item and returns pdPASS', 'Returns errQUEUE_FULL after one tick', 'Goes Blocked until a receiver makes room, and the sender does nothing else in the meantime'], a: 2, why: 'portMAX_DELAY waits for ever. The data is safe but the sender stops: a reader with a deadline that blocks here stops reading the instrument.', wrong: ["xQueueSend never overwrites an item. Overwriting is a separate call, xQueueOverwrite, and only for queues of length 1.", "errQUEUE_FULL comes back only when the timeout runs out. With portMAX_DELAY the timeout never runs out.", null] },
  { q: 'Samples arrive at t = 0, 20, 40, 60, 80 ms. The radio takes one out of the queue every 48 ms, starting at 0. What is the shortest queue that loses nothing, if the reader can hold one blocked sample itself?', opts: ['1', '2', '5'], a: 1, why: 'At 80 ms five samples have arrived and the radio has taken two, so three are waiting. The blocked reader holds one, the queue holds two. A length of 5 works but costs 384 B more than length 2 for nothing.', wrong: ["With a length of 1, plus the one sample the reader holds, only two samples can be kept, but three are waiting at 80 ms, so one would be lost.", null, "A length of 5 would work, but the question asks for the shortest queue. At 80 ms only three samples are waiting, and the reader holds one of them."] },
  { q: 'The reader task has the same priority as the camera, and the queue is 20 items long. Samples are still lost. Why does the longer queue not help?', opts: ['The queue is copied by value and 20 items are too many', 'A queue longer than 10 is silently cut by the kernel', 'The loss happens in the instrument, before the reader runs: the camera holds the CPU for 60 ms and the reader never gets to read in time'], a: 2, why: 'The queue only stores what the reader has already read. If the reader is kept off the CPU the sample is overwritten upstream. The reader must outrank the camera.', wrong: ["Copy by value is not the problem, and 20 items of 128 bytes is only 2560 bytes. The queue length has no effect on whether the reader gets the CPU.", "The kernel puts no such limit on queue length. A long queue is created normally if the heap has room.", null] },
  { q: 'The reader task has a 20 ms deadline at the instrument and uses xQueueSend(q, &s, portMAX_DELAY). The radio falls behind and the queue fills. What happens?', opts: ['The reader drops the newest sample and carries on', 'The reader blocks in the send, stops reading the instrument and samples are overwritten there', 'The kernel grows the queue by one slot'], a: 1, why: 'A blocking send on a full queue is back-pressure: it protects the data in the queue but stops the producer. A task with its own deadline then misses it. Use a longer queue, a faster consumer, or a bounded timeout and handle the failure.', wrong: ["A blocking send does not drop anything. Dropping happens with a timeout of 0, not with portMAX_DELAY.", null, "Queues have a fixed length set at creation. The kernel never adds slots."] },
];
