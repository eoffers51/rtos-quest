# Lesson contract

A stage is three files in `src/lessons/`, registered in `index.js`. `tools/verify.js` enforces everything below.

| File | Written by | Exports |
|---|---|---|
| `<slug>.js` | stage-builder | `lesson` |
| `<slug>.content.js` | theory-author | `manual`, `quiz`, `realCode`, `widgets` (the stage's own interactive widgets; the lesson object carries them as `widgets`) |
| `<slug>.copy.js` | copy-writer | `briefing`, `reactions`, `hints`, `solutionNote` |

(Stages 1 and 2 keep their copy inline; new stages use the three-file split.)

## The `lesson` object
```js
export const lesson = {
  id: 3, title: 'Steady Pulse', topic: 'Ticks, drift and vTaskDelayUntil',
  file: 'main/rover_main.c',          // file name shown in the editor
  T: 3000, cores: 1,                  // test length in ms; 1 or 2 cores
  pins: ['BEACON', 'HEART'],          // GPIOs with a chart row and a 3D LED
  ops: ['gpio', 'call', 'delay', 'until', 'busy'],   // instructions the player may add
  fns: ['sampleSpectrometer'],        // rover functions offered, keys of F in kernel.js
  irqs: { onBump: [150, 420] },       // optional: interrupt name -> times it fires (ms)
  goals: ['...', 'Still working from stage 1: ...'], // one string per objective
  start: prev => program,             // prev = firmware that passed the previous stage
  solution: () => program,            // reference: passes everything with 3 stars
  check: K => [[ok, 'measured value text'], ...],    // same length and order as goals
  bonus: B(cpuPercent, ramBytes),     // the two extra stars
  diagnose: (K, res) => reactions.someKey,           // which reply fits this failed run
  wrong: [ { name, apply: p => {/* mutate a copy of the solution */}, fails: [0, 2], says: 'reactionKey' },
           { name, apply, crash: 'task_wdt' } ],     // at least 3, at least one crash
  alts: [ { name, stars: 2, apply: p => {/* mutate a copy of the solution */} } ],  // optional: other correct designs and the stars they earn
  briefing, reactions, hints, solutionNote, manual, realCode, quiz,
};
```

## Programs
```js
{ objs: { name: { type: 'queue'|'binary'|'counting'|'mutex'|'timer', ... } },
  units: [ { kind: 'task', name, prio, stack, core, code: [...] },
           { kind: 'isr', name, code: [...] }, { kind: 'timer', name, code: [...] } ] }
```
Build code with the helpers exported by `kernel.js`: `task(name, prio, code, {stack})`, `g(pin)` gpio, `d(ms)` vTaskDelay, `un(ms)` vTaskDelayUntil, `bz(ms)` busy-wait, `c(fn)` call, `tk(sem, timeout)`, `gv(sem)`, `gi(sem)` FromISR, `sn(q, timeout)`, `rc(q, timeout)`, `si(q)`, `trs(timer)`, `tst(timer)`. Timeout `-1` is `portMAX_DELAY`.

`start(prev)` must **keep every unit of `prev`** and add to it. `solution()` builds on the previous stage's `solution()`.

## Rover functions (`F` in kernel.js)
`name: { cost, wait, stack, fx, needs, noIsr, start, end }`: `cost` = CPU ms (number or function), `wait` = ms blocked inside the driver, `stack` = bytes of stack depth, `fx` = `'wheel' | 'cam' | 'radio' | 'mast' | 'chip' | 'arm' | 'stop'` for the 3D effect, `needs` = locks that must be held, `noIsr` = crash text if called from an ISR. A task's stack need is 768 + the deepest function it calls.

## Measuring in `check(K)`
`S_(K, fn)` start times and `E_(K, fn)` end times of a rover function, `maxGap(times)`, `late(K, fn, period)`, `pinT(K, pin)` edge times, `gapsOf(times)`, `K.m.cpu`, `K.m.ram`, `K.m.core[i]`, `K.stats.{viol, sendFail, isrMax, timeouts}`, `K.diag` (deadlocks), `K.w` (driver state such as `lost`, `sent`, `coll`).

## Theory
- `manual`: 5 to 7 `[title, html]` sections; at least one `<svg` diagram and one `<div data-w="widget"></div>`.
- `quiz`: one entry per section, `{ q, opts, a, why, wrong }` or `null`; at least 3 real questions. `wrong` is required: one entry per option, `null` for the right one, and for each other option one or two sentences on why that option is wrong.
- `realCode`: complete ESP-IDF file with `#include "freertos/FreeRTOS.h"` and `app_main`.

## Done means
`gjs -m tools/verify.js` prints `All green.`, no `VERIFY:` markers remain, the fact-checker reports no blocking issue, and the stage has been opened once in the browser.

## Side missions (other topics, stand-alone)
A side mission is a lesson outside the main journey, for a topic that does not fit the rover's firmware story at that point.
- `id` from 101 upward, `side: true`, and an `adds` string (one line for the build log). Register it in `SIDE` in `src/lessons/index.js`, not in `LESSONS` or `JOURNEY`.
- `start(prev)` is called with `null`: build the whole starting program. `solution()` is self-contained. No regression objective is required.
- Everything else in this contract applies unchanged, and `gjs -m tools/verify.js 101` checks it.

## Power and sleep (lessons with `power: true`)
Setting `power: true` on the lesson adds a current row to the chart and average current to the results.
- **Model, mA per ms**: CPU running 40, idle but awake 25, automatic light sleep 0.8, deep sleep 0.01, plus 80 while Wi-Fi is started and plus 50 while a radio function runs. Constants `PWR` and `BOOT` (30 ms from wake-up to `app_main`) are exported by `kernel.js`. These are rounded ESP32 datasheet figures; say so in the theory.
- **Automatic light sleep**: a `pm` object in the program, `objs: { pm: { type: 'pm', lightSleep: true } }`, shown as `esp_pm_configure(...)`. When enabled, the idle task sleeps whenever nothing is due within 3 ticks. Simplification: it never sleeps while Wi-Fi is started.
- **Deep sleep**: ops `wt(ms)` = `esp_sleep_enable_timer_wakeup(ms * 1000ULL)` and `ds()` = `esp_deep_sleep_start()` (add `'wakeTimer'`, `'deepSleep'` to `ops`). Waking is a full reset: every task restarts from its first line after `BOOT` ms, kernel objects, GPIO levels and Wi-Fi state are lost. With no wake source the chip sleeps for the rest of the test.
- **Rover functions**: `readTemperature` (sets `x`), `wifiConnect` (blocks 120 ms), `wifiSend` (sends `x`, needs Wi-Fi), `wifiStop`.
- **Measuring**: `K.m.avgmA`, `K.cur[t]`, `K.w.reports` (times of delivered readings), `K.w.boots`, `K.w.sleeps`, `K.w.lightMs`.
- Bonus stars for a power lesson are usually two average-current targets instead of `B(cpu, ram)`: `bonus: [{ label, ok: K => K.m.avgmA <= n }, ...]`.

## State machines (lessons with an `fsm` field)
A lesson with `fsm: { states, events, actions, init, queue, script }` gets a table-driven state machine (side mission 102 is the pattern).
- **Instruction**: `fs(rows)` = `{ op: 'fsm', rows }`, with `row(state, event, action, next)`; `action` is a key of `F` or `''`. It dispatches the event last received with `rc(queue)`: the first row matching the current state and the event runs its action as an ordinary call, and the state changes when the action returns. No matching row means the event is ignored. The op is not offered in `ops`: the starting code carries it and the player edits its rows.
- **Editor**: the instruction is drawn as `switch (state)` with one `if (ev == E) { action(); state = N; }` line per row, plus a state diagram of the same table. During playback the current state is lit.
- **Events**: `script: [{ t, ev }]` is posted into `queue` by the kernel (as an ISR or another task would); a rover function may post one with `K.post(ev)`. A full queue drops the event and logs a fault.
- **Chart**: rows `events`, `state`, `wheels`, `drill` are added. `stateAt(K, L, t)` in `timeline.js` gives the state at a time.
- **Measuring**: `K.w.fsm.tr` = one record per dispatched event `{ t, tq, from, ev, to, act, hit }` (`tq` = arrival time, `hit` = a row matched); `K.w.evs` = every event posted; `K.w.rv` = the rover body (`mot`, `dr` on/off logs, `smp` drilled, `rep` reported, `hz` hazard times).
- **Rover functions**: `startMotors`, `stopMotors`, `startDrill` (returns at once, `DRILL_DONE` 400 ms later), `drillSample` (blocks 400 ms), `retractDrill`, `sendReport`.

## Reachability
The player can add tasks and instructions, but cannot add kernel objects. Every object the reference solution or an `alts` entry uses (queue, semaphore, mutex, timer, `pm`) must already be in `start()`, in its naive configuration. If a bonus star is meant to be reachable by a second design, declare that design in `alts` so the verifier proves it.

## The timing chart must be readable
The chart is the learner's main evidence, so the verifier measures whether a person can read it.
- **Measure**: state changes per 100 px in the busiest task row, on an 800 px wide chart (`chartDensity` in `src/timeline.js`). Up to 16 per 100 px reads as separate events.
- **AUTO zoom**: the game opens the chart at the smallest zoom (1x, 2x, 4x, 8x, 16x) that meets the limit, or at which one millisecond is at least 4 px wide. The verifier fails a stage if no zoom level is enough, and prints the zoom and how many milliseconds are visible at once for the starting code and the solution.
- **Design for it**: pick `T` and task periods so that the failure the stage is about fits inside one visible window at the AUTO zoom. As a guide, with a 10 ms task `T` of 3000 ms gives 8x and 375 ms on screen; a test of 10 s or more only works when activity is sparse (as in the sleep mission). If the verifier reports 16x, look for a longer period or a shorter `T` before accepting it.
- **Evidence is required** (main stages): `evidence: K => [{ unit, from, to, label }]` brackets the stretch of a task row that an unmet objective is about, with the measured value in the label (for example "14 ms between motor steps"). After a failed run the chart scrolls to it. Return `[]` when everything passes.
- **Optional aids**: `chartGrid: { unit, period }` draws ticks where a periodic task should start; `powerMarks: [mA, ...]` draws budget lines on the current row.

## Task notifications, event groups, task watchdog
- **Task notifications** (ops `'notifyGive'`, `'notifyGiveISR'`, `'notifyTake'`): `ng(taskName)` = `xTaskNotifyGive(handle)`, `ngi(taskName)` = `vTaskNotifyGiveFromISR(handle, &woken)`, `nt(timeout, clear)` = `ulTaskNotifyTake(clear ? pdTRUE : pdFALSE, timeout)` (`clear` defaults to 1; with 0 the count is decremented, so every give is handled). The count lives in the receiving task; no kernel object and no RAM cost (a semaphore costs 96 bytes here). `pdTRUE` clears the count on exit, so a burst of gives is one wake-up. `K.w.notes` holds the give times. Calling `ng` from an ISR crashes; `ngi` is the ISR version.
- **Event groups** (ops `'evSet'`, `'evWait'`): an object `{ type: 'events', bits: ['LINK_UP', 'TIME_OK'] }` in `objs`. `es(group, bitName)` = `xEventGroupSetBits`, `ew(group, mode, timeout)` = `xEventGroupWaitBits(group, bits, pdTRUE, all, timeout)` where `mode` is `'all'`, `'any'` or `'bit:NAME'`. Bits are cleared on exit. Setting bits wakes every waiter to re-check its own condition. Setting bits from an ISR is not offered (in FreeRTOS it is deferred to the timer task).
- **Task watchdog** (ops `'wdtAdd'`, `'wdtReset'`): `wa()` = `esp_task_wdt_add(NULL)` subscribes the calling task, `wr()` = `esp_task_wdt_reset()`. A subscribed task that goes `wdtTimeout` ms (lesson field, default 1000) without a reset crashes the run with a `task_wdt` message naming that task. This is how a stuck task (deadlock, lost wake-up) becomes a visible, recoverable fault.
- **Stage count**: the journey has 14 stages; `JOURNEY` in `src/lessons/index.js` is the plan. Rover functions for later stages already exist in `F` (sampling and radio, I2C, bumper, antenna, arm and camera, data bus, vision); read `F` before inventing new ones.

## Reusing an earlier stage's measurements
A later stage may call an earlier lesson's `check(K)` or `detail(K)` for its regression objectives. That couples the two files, so:
- If a stage groups several measurements into one displayed objective, it keeps the ungrouped rows in `detail: K => [[ok, text], ...]` and builds `check` from them. Later stages index into `detail`, never into a grouped `check`.
- Rows in `detail` (and results in `check`, when no `detail` exists) are only ever appended. Reordering or removing one breaks every later stage.
- After changing any stage's objectives, run the verifier for **all** stages, not only that one.

## Feedback that fits where the learner is
- `quiz` entries must carry `wrong: [text | null, ...]`, one line per option saying why that option is wrong (`null` for the right one). The verifier fails a question without it.
- **The Lean star does not count stack margins.** `B(cpu, ram)` compares `leanRam(K)` with `ram`: total RAM minus up to 256 B of unused stack per task. Set `ram` to `leanRam` of the reference solution plus a small slack (about 50 to 150 B), so an unused kernel object or an oversized stack still misses the star but a sensible margin never does. Any text or widget that quotes the limit must quote this counted number.
- **Heap misuse stops the run.** `processFrame` on a frame that is not allocated (use after free) and a second `freeFrame` (double free) both crash the simulation; do not design an objective that expects them to keep running.
- `hintFloor: (K, res) => index` (optional) returns the first hint that still makes sense after the latest run, so the ladder does not start with advice about a problem the learner already fixed.
- Sections whose title ends in "(Go deeper)" are shown after the core sections, whatever their position in `manual`. The `chartguide` widget (a small practice chart with a hover read-out) is available to any stage that introduces a new chart state.
