# Stage 5 spec: Science Pipeline

All numbers were measured with `runSim` on `stage4.solution()` plus the new parts, with L = `{ T: 1000, cores: 1, heap: 8192, pins: ['BEACON','HEART'] }`. Unit order: beacon 0, heart 1, motor 2, camera 3, telemetry 4, spectro 5, nav 6, mapper 7, **science 8**, **radio 9** (radio only in the solution).

## 1. Identity
- id: 5
- slug: `science-pipeline`
- title: Science Pipeline
- topic: Queues (xQueueCreate, xQueueSend, xQueueReceive, blocking on a queue, queue length and RAM)
- file: `main/rover_main.c`
- T: **1000** (two instrument bursts, see 6b), cores: 1
- `heap: 8192` (as stage 4), pins: `['BEACON', 'HEART']`
- ops: `['gpio', 'call', 'delay', 'until', 'busy', 'send', 'recv']`
- fns: `['readSample', 'transmit']` (both already in `F`)

## 2. Story
The science team delivered a mass spectrometer that produces a burst of five samples, 20 ms apart, at t = 0, 500, 1000 ms (the instrument keeps only the newest sample and overwrites an unread one). The radio team supplied `transmit(x)`, which blocks 45 ms and costs 3 ms CPU. Both were wired into one task, `science`: read a sample, transmit it, read the next. While `transmit()` holds the task for 48 ms the instrument produces two more samples that nobody reads, so only 6 of 10 samples ever reach Earth (ids 0, 2, 4, 5, 7, 9) and the serial monitor fills with "overwritten inside the instrument". You decouple reading from sending with a queue: a fast reader that never waits for the radio, and a slow radio task that drains the backlog.

## 3. Kernel additions
None in `src/kernel.js`. Everything exists: `F.readSample` (cost 1, stack 400, blocks until the next instrument sample, reports overwritten samples through `K.bad` and `K.w.lost`), `F.transmit` (wait 45, cost 3, stack 1200, takes `x`, empty `x` is a violation, delivered ids go to `K.w.sent`), the `send`/`recv` ops, the `queue` object (RAM = 96 + len x item bytes, `len` editable 1 to 20 in the editor, `item` fixed).

**Editor change (required, additive):** `src/editor.js` `addTask()` refuses a new task when the program already has 7 tasks (`>= 7`), but stage 4 already ships 8 tasks, start adds `science` (9), and the solution needs a 10th (`radio`). Raise the cap to **12** (`>= 12`). Without this the player cannot reach the reference solution. Nothing else in the editor changes.

Queue facts used in the game: item size 128 bytes (a spectrum: 32 floats), queue name `samples`. Say in the theory that the game's 96 B control block is a rounding of FreeRTOS's `StaticQueue_t` (about 80 B on ESP32).

## 4. Programs
Start (`start(prev)`): `clone(prev || stage4.solution())`, then
```js
p.objs = { samples: { type: 'queue', len: 1, item: 128 } };   // delivered by the "science team", naive length 1, unused by the code
p.units.push(task('science', 2, [c('readSample'), c('transmit')], { stack: 2048 }));
```
Priority 2 is deliberate: above camera (1), below motor (3), so the start meets every earlier objective and only the new ones fail. At priority 3 it ties with the motor and breaks stage 2 (motor gap 12 ms), which would muddy the lesson.

Solution:
```js
const p = stage4.solution();
p.objs = { samples: { type: 'queue', len: 3, item: 128 } };
p.units.push(task('science', 2, [c('readSample'), sn('samples', -1)], { stack: 1280 }));
p.units.push(task('radio', 1, [rc('samples', -1), c('transmit')], { stack: 2048 }));
```
Stack need: science 768 + 400 = 1168 (1280 gives 112 B margin), radio 768 + 1200 = 1968 (2048 gives 80 B margin; the stage 4 headroom rule of thumb applies but is not an objective here). Minimum queue length is 2 (len 1 loses one sample); 3 gives one spare slot. ESP-IDF form: `samples = xQueueCreate(3, sizeof(sample_t)); xQueueSend(samples, &s, portMAX_DELAY); xQueueReceive(samples, &s, portMAX_DELAY);`.

Reachability: the queue exists in `start()` (length 1), the player only edits its length and adds the `radio` task (cap fix above) and the `send`/`recv` ops.

## 5. Objectives (goals, in order) and checks
Helpers: `ids = K.w.sent || []`, `lost = K.w.lost || 0`, `sp = S_(K,'sampleSpectrometer').length`, `mg = maxGap(S_(K,'motorStep'))`, `tl = S_(K,'sendTelemetry')`, `tg = maxGap(tl)`, `b = pinT(K,'BEACON')`, `h = pinT(K,'HEART')`, `mp = E_(K,'processFrame').length`, `pl = E_(K,'planPath').length`, `steady`, `seen` as in stage 4.

| # | Goal text | Check | Start | Solution |
|---|---|---|---|---|
| 0 | `Instrument: no sample overwritten before it was read` | `lost === 0`, text `${lost} samples overwritten` | 4 -> NO | 0 ok |
| 1 | `Uplink: all 10 samples transmitted, in order, none missing` | `ids.length === 10 && ids.every((v, i) => v === i)`, text `${ids.length} of 10 delivered` | 6 -> NO | 10 ok |
| 2 | `Queue: no sample dropped because the queue was full` | `K.stats.sendFail === 0`, text `${K.stats.sendFail} dropped` | 0 ok | 0 ok |
| 3 | `Still working from stage 4: mapper frees its frames, at least 3 frames processed and 2 paths planned in 1 s` | `K.heap >= 6144 && mp >= 3 && pl >= 2`, text `${mp} frames, ${pl} paths, ${K.heap} B of heap free` | 4, 3, 8192 ok | 4, 3, 8192 ok |
| 4 | `Still working from stage 3: spectrometer 47 to 53 samples started in 1 s` | `sp >= 47 && sp <= 53`, text `${sp} samples` | 50 ok | 50 ok |
| 5 | `Still working from stage 2: motor never more than 11 ms between steps, telemetry never more than 105 ms between packets, at least 9 sent` | `mg <= 11 && tg <= 105 && tl.length >= 9`, text `motor gap ${mg} ms, telemetry gap ${tg} ms, ${tl.length} packets` | 10, 105, 10 ok | 10, 101, 10 ok |
| 6 | `Still working from stage 1: BEACON every 500 ms and HEART every 200 ms (within 3 ms)` | `steady(b,500,2) && steady(h,200,5)` | ok | ok |

Notes: the start passes 2 to 6 and fails 0 and 1, so the failure is exactly the new one. Objective 2 is mostly a trap for "drop instead of wait" designs (it passes in the start only because nothing sends). Telemetry gap in the start is 105, exactly at the limit (passes); do not tighten it.

## 6. Bonus
`B(92, 17100)`.
- Solution: CPU 90%, RAM 16928 B: 3 stars.
- RAM: len 2 = 16800, len 3 = 16928, len 4 = 17056 (3 stars), len 5 = 17184 (misses Lean), len 20 = 19104. Keeping the stack 2048 on `science` = 17696 (misses Lean).
- CPU: a radio that polls with `rc('samples', 0)` instead of blocking runs at CPU 95% (spectrometer drops to 48, still passes), misses Efficient: 2 stars. All blocking designs measure 89 to 90%.

## 6b. Chart
- Start: AUTO zoom **4x**, densest row `spectro` 54.6 changes per 100 px, 250 ms visible at once. Solution: AUTO zoom 4x, 55.1, 250 ms visible. T = 1000 is the reason: at T = 1500 the zoom is 8x and 2500 ms gives 16x. The first burst (t = 0 to about 240 ms) fits one window.
- `evidence(K)`:
```js
evidence: K => {
  const lost = K.w.lost || 0, marks = K.ev.filter(e => e.k === 'mark' && e.row === '!').map(e => e.t);
  if (!marks.length) return [];
  const tb = marks[0], before = E_(K, 'readSample').filter(t => t <= tb), from = before.length ? before[before.length - 1] : 0;
  if (lost) return [{ unit: 'science', from, to: tb, label: `${lost} sample${lost > 1 ? 's' : ''} overwritten in the instrument: science was not at readSample() in time (first at ${tb} ms)` }];
  const tx = S_(K, 'transmit');
  return [{ unit: 'radio', from: tx.length ? tx[0] : 0, to: tb, label: `transmit() sent an empty packet at ${tb} ms: x holds no sample` }];
}
```
Measured brackets: start `science` 4 to 55 ms (task stuck inside `transmit()` since 5 ms, wait state in the row, 4 lost in total); queue length 1: `science` 63 to 87; sampler at priority 1: `science` 0 to 22 (camera running); radio without `recv`: `radio` 24 to 83. For failures with no mark (dropped by `sendFail`) it returns `[]` (objective 2 text still tells the number). Optional `chartGrid`: none (the 20 ms grid exists only inside bursts).

## 7. Wrong answers
Mutations apply to the solution (units 8 = science, 9 = radio). Valid for `fails`, `says` as given.

| name | mutation | result | says |
|---|---|---|---|
| one task does both (the original bug) | `p.units.pop(); p.units[8].code = [c('readSample'), c('transmit')]; p.units[8].stack = 2048` | fails 0, 1 (lost 4, 6 of 10) | `oneTask` |
| queue length 1 | `p.objs.samples.len = 1` | fails 0, 1 (lost 1, 9 of 10, first at 87 ms) | `shortQueue` |
| reader at default priority | `p.units[8].prio = 1` | fails 0, 1 (lost 1, 9 of 10, at 22 ms, camera ties and hogs the CPU) | `lowPrio` |
| radio throttled | `p.units[9].code.push(d(100))` | fails 0, 1 (lost 1, 6 of 10, first at 672 ms; queue fills, reader blocks in `send`) | `backlog` |
| drop when full | `p.units[8].code[1] = sn('samples', 0)` | fails 1, 2 (9 of 10, sendFail 1) | `dropped` |
| radio never receives | `p.units[9].code.shift()` | fails 1 (0 of 10, empty packets) | `empty` |
| radio above the motor | `p.units[9].prio = 5` | fails 5 (motor gap 13, telemetry 103) | `hog` |
| radio stack 1536 | `p.units[9].stack = 1536` | crash `stack overflow` in `radio` at 24 ms | (crash) |
| reader stack 1024 | `p.units[8].stack = 1024` | crash `stack overflow` in `science` at 3 ms | (crash) |

Alternatives that must pass (`alts`): `len 2` (3 stars: CPU 90, RAM 16800), `len 4` (3 stars: 17056), `len 5` (2 stars: 17184), `len 20` (2 stars: 19104), `science stack 2048` (2 stars: 17696), `polling recv with timeout 0` (2 stars: CPU 95), `reader priority 5` (3 stars), `radio priority 2` (3 stars). All pass objectives 0 to 6 (mg 10 to 10, tg 100 to 102).

## 8. Reactions
Keys: `oneTask`, `lowPrio`, `shortQueue`, `backlog`, `dropped`, `empty`, `hog`, `crash`, `watchdog`, `fail`, `pass`.
```js
diagnose: (K, res) => {
  const sci = K.units.find(u => u.name === 'science'), cam = K.units.find(u => u.name === 'camera'), radio = K.units.find(u => u.name === 'radio');
  if (!res[0][0]) {
    if (sci.code.some(i => i.fn === 'transmit')) return reactions.oneTask;
    if (sci.base <= cam.base) return reactions.lowPrio;
    if (K.objs.samples && K.objs.samples.len < 2) return reactions.shortQueue;
    return reactions.backlog;
  }
  if (!res[2][0]) return reactions.dropped;
  if (!res[1][0]) return (!radio || !radio.code.some(i => i.op === 'recv')) ? reactions.empty : reactions.dropped;
  if (!res[3][0] || !res[4][0] || !res[5][0] || !res[6][0]) return reactions.hog;
  return reactions.fail;
}
```
Conditions: `oneTask` the reader task itself transmits; `lowPrio` reader not above camera; `shortQueue` queue shorter than 2; `backlog` lost samples with a long enough queue (the radio is too slow or throttled); `dropped` full queue discards (`sendFail`); `empty` radio has no `xQueueReceive`; `hog` earlier-stage regression broke.

## 9. Theory outline
1. **The problem: a slow consumer** (diagram: timeline of instrument samples at 20 ms vs `transmit()` bars of 48 ms, overwritten samples marked; widget: "producer/consumer timeline" with sliders for producer period and consumer time showing lost samples; question: how many samples are lost for a 20 ms producer and 48 ms consumer). Facts: this is the same bug class as a UART FIFO overrun.
2. **What a queue is** (diagram: FIFO ring buffer with head, tail, count; widget: queue playground with send and receive buttons and a length slider; question: what does `xQueueReceive` return when the queue is empty and timeout is 0). Facts: copy by value, `xQueueCreate(length, itemSize)`, `uxQueueMessagesWaiting`, FIFO, `xQueueSendToFront`, `xQueueOverwrite` for length 1.
3. **Blocking on a queue** (diagram: task states Running/Blocked with queue events; widget: sender/receiver tasks with timeout field, `portMAX_DELAY` vs 0 vs 100 ms; question: what happens to a sender at `portMAX_DELAY` when the queue is full). Facts: blocked tasks wake in priority order; `pdTRUE`/`errQUEUE_FULL` return values; blocking is not polling (CPU cost).
4. **Sizing the queue** (diagram: backlog curve over a burst of 5 samples; widget: length slider against the burst simulation with RAM readout; question: minimal length for 5 samples 20 ms apart and 48 ms service time). Facts: backlog during a burst = arrivals - departures (answer 2 with the game numbers, 3 with margin); RAM = length x item size + control block; copy cost grows with item size, so large items go by pointer (and ownership rules).
5. **Priorities around a queue** (diagram: reader above camera vs below, with the 60 ms frame stealing the CPU; widget: priority sliders on the stage timeline; question: why must the reader outrank `camera`). Facts: the reader must meet the instrument's deadline, the radio is slow but not urgent.
6. **Queues and ISRs, mailboxes, what else** (diagram: ISR -> queue -> task, `xQueueSendFromISR` with `pxHigherPriorityTaskWoken`; widget: matching card game of 4 patterns (pass data, event, mailbox, command queue); question: which API sends from an ISR). Facts: `xQueueSendFromISR`, `portYIELD_FROM_ISR`, queue sets, stream/message buffers, `xQueueOverwrite` mailbox; semaphores come in stage 7.

Facts to verify against the ESP-IDF FreeRTOS documentation: `xQueueCreate`, `xQueueSend`/`xQueueReceive` signatures and return values; queues copy items; the `StaticQueue_t` size (about 80 bytes on 32-bit ESP32); `xQueueSendFromISR` and `pxHigherPriorityTaskWoken`; `xQueueOverwrite` allowed only for length 1; wake-up order of blocked tasks (highest priority, then longest waiting); that ESP-IDF's default `CONFIG_FREERTOS_HZ` is 100 (this game uses 1000, as in earlier stages) so `pdMS_TO_TICKS()` should appear in realCode.

## 10. Open risks
- **Editor task cap** (section 3) must be raised or the stage is unsolvable; the verifier will not catch this because it builds programs directly.
- The CPU star only separates polling (95%) from blocking (89 to 90%); no other natural lazy design moves CPU. The RAM star separates queue length 5 or more and unreduced stacks.
- `sendFail` drops leave no chart mark and no timestamp, so objective 2 failures have no `evidence` bracket. An additive kernel change (record the time in `K.w.dropped`) would fix this; not required.
- Startup is fragile at the telemetry limit: the start measures exactly 105 ms (limit 105); a change to the start priority or to `science` code pushes it over. If the builder changes the start priority from 2, re-measure objective 5.
- The lesson uses T = 1000, so the spectrometer window is 47 to 53 and the mapper has only 4 frames; if the builder changes T the numbers in section 5 must be re-measured.
- Wrong answer "radio throttled" loses its first sample only in the second burst (672 ms); with `d(100)` the radio also falls to 6 of 10. Not an issue for the verifier, but the reaction text should mention a queue that fills.
