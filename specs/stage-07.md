# Stage 7 spec: Bump in the Night

All numbers were measured with `runSim` (scratch script, deleted) on the stage 6 reference solution taken from section 4 of `specs/stage-06.md` (the stage 6 lesson file did not exist yet): `stage5.solution()` + `i2c_lock` mutex + `imu` and `thermo` tasks with take/give. L = `{ T: 1000, cores: 1, heap: 8192, pins: ['BEACON','HEART'], irqs: { onBump: [150, 420, 700] } }`.
Unit order: beacon 0, heart 1, motor 2, camera 3, telemetry 4, spectro 5, nav 6, mapper 7, science 8, radio 9, imu 10, thermo 11, **onBump 12 (isr)**, **bumper 13 (task, solution only)**. Priorities in force: beacon/heart 4, motor 3, telemetry/science/imu/thermo 2, camera/spectro/nav/mapper/radio 1.

## 1. Identity
- id: 7
- slug: `bump-in-the-night`
- title: Bump in the Night
- topic: Interrupts, binary semaphores and deferred work (IRAM_ATTR handlers, xSemaphoreGiveFromISR, short ISRs, handler task)
- file: `main/rover_main.c`
- T: **1000**, cores: 1, `heap: 8192`, pins: `['BEACON', 'HEART']`
- irqs: `{ onBump: [150, 420, 700] }` (three bumper hits, well apart; no contact bounce, to keep one idea)
- ops: `['gpio', 'call', 'delay', 'until', 'busy', 'send', 'recv', 'take', 'give', 'giveISR']`
- fns: `['stopMotors', 'checkThermals']` (both already in `F`)
- `chartGrid: { unit: 'motor', period: 10 }` (ticks 32 px apart at 4x: readable; a late motor step is a missing tick)

## 2. Story
The safety team bolted a bumper switch onto the front of the rover and wrote its handler the obvious way: an interrupt service routine (`onBump`) that stops the motors and then runs the thermal check on the motor drivers (8 ms of work) right there, inside the interrupt. While the ISR runs nothing else can: at every bump the motor task misses a step (18 ms between steps instead of 10) and telemetry slips to 109 ms between packets, so two stage 2 promises break, and the serial monitor shows the motor and telemetry gaps. The rover must stop at once but do the slow part later, in a task, woken by a semaphore from the ISR.

## 3. Kernel additions
None in `src/kernel.js`. Everything exists: ISR units (`kind: 'isr'`, run at top priority, trigger from `L.irqs`), `giveISR` (`gi`), `F.stopMotors` (cost 0, instant, fx `stop`), `F.checkThermals` (cost 8, stack 400), `K.stats.isrMax` (longest ISR run in ms), the crash text "xSemaphoreGive() was called inside an ISR..." for blocking calls in an ISR, and the `logToFlash` ISR crash ("Cache disabled but cached memory region accessed").
Editor/lesson plumbing to specify for the builders (not the kernel):
- **Task cap**: the editor refuses a new task at 12 (`filter(kind==='task').length >= 12`, `src/editor.js` line 123). The start has 12 tasks and the solution has 13. The builder must raise the cap to 14 (stages 8 to 14 need it).
- `bump_sem` (binary) must be offered by `take` and `giveISR` (editor already lists binary/counting for `giveISR` and binary/counting/mutex for `take`). The ISR unit `onBump` is editable (not `locked`), shown as `static void IRAM_ATTR onBump(void *arg)`.
- Game-time note for the theory: the 8 ms thermal check is long for an ISR on purpose; real code would never run that long, and a real bumper input is wired with `gpio_isr_handler_add`. The lesson shows that call in `realCode` and states that the simulator fires the ISR at fixed times.

## 4. Programs
Start (`start(prev)`):
```js
const p = clone(prev || stage6.solution());
p.objs.bump_sem = { type: 'binary' };       // "delivered by the safety team", never given or taken (keeps i2c_lock and samples)
p.units.push({ kind: 'isr', name: 'onBump', code: [c('stopMotors'), c('checkThermals')] });
```
Reference solution:
```js
const p = stage6.solution();
p.objs.bump_sem = { type: 'binary' };
p.units.push({ kind: 'isr', name: 'onBump', code: [c('stopMotors'), gi('bump_sem')] });
p.units.push(task('bumper', 1, [tk('bump_sem'), c('checkThermals')], { stack: 1280 }));
```
ESP-IDF form: `static void IRAM_ATTR onBump(void *arg) { BaseType_t woken = pdFALSE; stop_motors(); xSemaphoreGiveFromISR(bump_sem, &woken); portYIELD_FROM_ISR(woken); }` and `bumper`: `xSemaphoreTake(bump_sem, portMAX_DELAY); check_thermals();`.
Stack need of `bumper` = 768 + 400 = 1168; 1280 leaves 112 B.
**Priority 1 is the only plain-priority choice that keeps stage 2**: the system is 98% loaded. Prio 2 shares with telemetry (round robin, telemetry gap 110 > 105); prio 3 and above preempt the motor (gap 12 and 18 > 11). This is the lesson's second half: deferred work belongs low, because the urgent part already happened in the ISR.
Reachability: `bump_sem` and the ISR are in `start()`; the player adds one task (`bumper`) with `take`, a `call` and edits the ISR to use `giveISR`.

## 5. Objectives (goals, in order) and checks
Helpers: `irq = K.w.irq.onBump || []`, `st = E_(K,'stopMotors')`, `ck = E_(K,'checkThermals')`, `stopLat = irq.map(t => first x of st with x >= t, minus t, or -1)`, `ckLat = irq.map(t => first x of ck with x > t, minus t, or -1)`, `im = S_(K,'i2cReadIMU')`, `coll = K.w.coll || 0`, `ids`, `lost`, `mp`, `pl`, `sp`, `mg`, `tl`, `tg`, `b`, `h`, `steady`, `f` as in stages 5 and 6.

| # | Goal text | Check | Start | Solution |
|---|---|---|---|---|
| 0 | `Interrupt handler: no ISR runs longer than 1 ms` | `K.stats.isrMax <= 1`, text `longest ISR ${K.stats.isrMax} ms` | 8 -> NO | 0 ok |
| 1 | `Safety: motors stopped within 3 ms of every bump (3 of 3)` | `irq.length === 3 && stopLat.every(x => x >= 0 && x <= 3)`, text `stop delays ${stopLat.join(', ')} ms` (-1 = never) | 0, 0, 0 ok | 0, 0, 0 ok |
| 2 | `Follow-up: thermals checked within 100 ms of every bump` | `irq.length === 3 && ckLat.every(x => x >= 0 && x <= 100)`, text `thermal check ${ckLat.join(', ')} ms after the bumps` | 8, 8, 8 ok | 29, 39, 37 ok |
| 3 | `Still working from stage 6: no I2C collisions, IMU at least 45 reads, never more than 40 ms apart` | `coll === 0 && im.length >= 45 && maxGap(im) <= 40`, text `${coll} collisions, ${im.length} IMU reads, longest gap ${f(maxGap(im))} ms` | 0, 50, 30 ok | 0, 50, 30 ok |
| 4 | `Still working from stage 5: all 10 samples transmitted, in order, none overwritten` | `lost === 0 && ids.length === 10 && ids.every((v, i) => v === i)`, text `${ids.length} of 10 delivered` | 10 ok | 10 ok |
| 5 | `Still working from stage 4: mapper frees its frames, at least 3 frames processed and 2 paths planned in 1 s` | `K.heap >= 6144 && mp >= 3 && pl >= 2`, text `${mp} frames, ${pl} paths, ${K.heap} B of heap free` | 4, 3, 8192 ok | same |
| 6 | `Still working from stage 3: spectrometer 47 to 53 samples started in 1 s` | `sp >= 47 && sp <= 53`, text `${sp} samples` | 50 ok | 50 ok |
| 7 | `Still working from stage 2: motor never more than 11 ms between steps, telemetry never more than 105 ms between packets, at least 9 sent` | `mg <= 11 && tg <= 105 && tl.length >= 9`, text `motor gap ${f(mg)} ms, telemetry gap ${f(tg)} ms, ${tl.length} packets` | 18, 109, 10 -> NO | 10, 101, 10 ok |
| 8 | `Still working from stage 1: BEACON every 500 ms and HEART every 200 ms (within 3 ms)` | `steady(b,500,2) && steady(h,200,5)`, text `BEACON ${b.length} toggles, HEART ${h.length} toggles` | 2 / 5 ok | 2 / 5 ok |

The start fails exactly objectives 0 and 7 (one cause: the long ISR). Margins: motor gap 10 vs 11 and telemetry gap 101 vs 105 are inherited from stage 2 and unchanged; thermal check delay 39 vs 100 (2.5x); stop delay 0 vs 3.

## 6. Bonus
`B(99, 21300)`.
- Solution: CPU 98%, RAM 20960 B (stage 6 solution 19584 + 96 for `bump_sem` + 1280 for `bumper`): 3 stars.
- RAM: `bumper` stack 1200 = 20880, 1280 = 20960, 1536 = 21216 (still 3 stars), 2048 = 21728 and 4096 = 23776 (2 stars). Minimum is 1168.
- CPU: every correct design measured 98% (counting semaphore, polling with `tk(0)` and `delay`, deferred stop, any stack size), because the extra work is only 24 ms in 1000. Start is also 98%. The CPU star therefore does not separate designs here (a busy-polling design crashes with `task_wdt` at 100% instead). Set at 99 so a one-point wobble from builder changes does not lose it; the Lean star is the discriminating one.

## 6b. Chart
- Start: AUTO zoom **4x**, densest row `spectro` 54.3 changes per 100 px, **250 ms visible at once**. Solution: 4x, 54.9, 250 ms. (T = 1000 as in stages 5 and 6; 3.2 px per ms.) The first ISR run (150 to 158 ms, 26 px wide) and the late motor step (140 to 158) are inside the first window. The other two bumps are at 420 and 700 ms.
- `chartGrid: { unit: 'motor', period: 10 }`.
- `evidence(K)` (verified on start, solution and the wrong answers below):
```js
evidence: K => {
  const irq = K.w.irq.onBump || [], t0 = irq[0] === undefined ? 0 : irq[0];
  const late = (a, lim) => { for (let i = 1; i < a.length; i++) if (a[i] - a[i - 1] > lim) return [a[i - 1], a[i]]; return null; };
  if (K.crash) return /ISR/.test(K.crash.msg) ? [{ unit: 'onBump', from: t0, to: K.crash.t, label: K.crash.msg.split('.')[0] }] : [];
  const mg = late(S_(K, 'motorStep'), 11), tg = late(S_(K, 'sendTelemetry'), 105);
  if (K.stats.isrMax > 1) { const g = mg || [t0, t0 + K.stats.isrMax];
    return [{ unit: 'onBump', from: t0, to: t0 + K.stats.isrMax, label: `onBump ran ${K.stats.isrMax} ms inside the interrupt at ${t0} ms: no task could run (motor steps ${g[0]} to ${g[1]} ms, ${g[1] - g[0]} ms apart)` }]; }
  if (mg) return [{ unit: 'motor', from: mg[0], to: mg[1], label: `${mg[1] - mg[0]} ms between motor steps: the bump follow-up ran above the motor task` }];
  if (tg) return [{ unit: 'telemetry', from: tg[0], to: tg[1], label: `${tg[1] - tg[0]} ms between telemetry packets: the bump follow-up shared priority 2 with telemetry` }];
  const st = E_(K, 'stopMotors'), miss = irq.find(t => !st.some(x => x >= t && x <= t + 3));
  if (miss !== undefined) return [{ unit: 'onBump', from: miss, to: miss + 3, label: `bump at ${miss} ms: stopMotors() did not run within 3 ms` }];
  const ck = E_(K, 'checkThermals'), m2 = irq.find(t => !ck.some(x => x > t && x <= t + 100));
  if (m2 !== undefined) return [{ unit: 'bumper', from: m2, to: Math.min(m2 + 100, K.end - 1), label: `bump at ${m2} ms: no thermal check within 100 ms` }];
  return [];
}
```
Measured: start -> onBump 150 to 158, "18 ms apart"; prio 3 -> motor 151 to 163; prio 2 -> telemetry 703 to 813; prio 4 -> motor 140 to 158; never gives -> bumper 150 to 250; no stop -> onBump 150 to 153; crashes -> onBump 150 to 150 with the crash text; solution -> `[]`. The `bumper` row exists only if the player adds the task (it does in the solution and in the mutations).

## 7. Wrong answers
Mutations of the solution (indexes: ISR = `p.units[12]`, bumper = `p.units[13]`). Objective indexes as in section 5.

| Name | Mutation | Fails | Measured | `says` |
|---|---|---|---|---|
| work still in the ISR (the original bug) | `p.units[12].code = [c('stopMotors'), c('checkThermals')]` | 0, 7 | isrMax 8, motor gap 18, telemetry gap 109 | `slowIsr` |
| bumper above the motor | `p.units[13].prio = 4` | 7 | motor gap 18, telemetry 109, ISR 0 | `hog` |
| bumper at priority 3 (just above) | `p.units[13].prio = 3` | 7 | motor gap 12, telemetry 112 | `hog` |
| bumper shares priority with telemetry | `p.units[13].prio = 2` | 7 | telemetry gap 110, motor 10 | `hog` |
| semaphore never given | `p.units[12].code = [c('stopMotors')]` | 2 | no thermal check at all (-1) | `neverWakes` |
| forgot to stop the motors | `p.units[12].code = [gi('bump_sem')]`, `p.units[13].code = [tk('bump_sem'), c('checkThermals')]` | 1 | stop delays -1, -1, -1 (check 29/39/37 ok) | `noStop` |
| `xSemaphoreGive` instead of the FromISR version | `p.units[12].code[1] = { op: 'give', s: 'bump_sem' }` | crash | "xSemaphoreGive() was called inside an ISR. An ISR can never block: only the ...FromISR() functions are allowed there." at 150 ms | crash: `isrBlock` |
| flash write in the ISR | `p.units[12].code = [c('stopMotors'), c('logToFlash')]` | crash | "Guru Meditation Error: Core 0 panic'ed (Cache disabled but cached memory region accessed)..." at 150 ms | crash: `isrFlash` |
| bumper stack 1024 | `p.units[13].stack = 1024` | crash | "A stack overflow in task bumper has been detected" | crash: `stack` |
| bumper polls with no timeout | `p.units[13].code = [tk('bump_sem', 0), c('checkThermals')]` | crash | `task_wdt` at 599 ms (tight loop at CPU 100%) | crash: `busyLoop` |

Failing indexes for the crashes depend on the truncated run; the verifier only needs the crash text. The `isrBlock` crash text starts with "xSemaphoreGive()"; for the `take` variant (an ISR calling `xSemaphoreTake`) it is "xSemaphoreTake() ...", same reaction.
Accepted correct designs for `alts` (all measured, 0 failed objectives):
| Name | Mutation | Stars | Measured |
|---|---|---|---|
| counting semaphore | `p.objs.bump_sem = { type: 'counting', max: 8 }` | 3 | RAM 20960, CPU 98 |
| bumper stack 1536 | `p.units[13].stack = 1536` | 3 | RAM 21216 |
| bumper stack 2048 | `p.units[13].stack = 2048` | 2 | RAM 21728 |
| bumper stack 4096 | `p.units[13].stack = 4096` | 2 | RAM 23776 |
| stop moved into the task (ISR only gives) | `p.units[12].code = [gi('bump_sem')]`, `p.units[13].code = [tk('bump_sem'), c('stopMotors'), c('checkThermals')]` | 3 | stop delay 2/2/2 ms (limit 3: only 1 ms of margin, deterministic), check 29/39/37 |
| take with a 50 ms timeout | `p.units[13].code[0] = tk('bump_sem', 50)` | 3 | same as solution |
| bumper delays 10 ms after each check | `p.units[13].code.push(d(10))` | 3 | same as solution |
| polling `[d(5), tk('bump_sem', 0), c('checkThermals')]` | replace code | 3 | check 30/40/39 ms, CPU 98, zoom 4 |

## 8. Reactions
Keys and the `diagnose(K, res)` logic (check in this order; `bumper = K.units.find(u => u.name === 'bumper')`, `isr = K.units.find(u => u.name === 'onBump')`):
- `isrBlock`: `K.crash && /called inside an ISR/.test(K.crash.msg)` (mission control explains: an ISR cannot block, use the FromISR function).
- `isrFlash`: `K.crash && /Cache disabled/.test(K.crash.msg)`.
- `stack`: `K.crash && /stack overflow/.test(K.crash.msg)`.
- `busyLoop`: `K.crash && /task_wdt/.test(K.crash.msg)`.
- `slowIsr`: `!res[0][0]` (the ISR still does the slow work).
- `noStop`: `!res[1][0]`.
- `neverWakes`: `!res[2][0]` (nobody gives the semaphore, or nobody takes it).
- `hog`: `!res[7][0]` and ISR is short; (priority mistake, mention the 98% load and priority 1).
- `regress`: any other of `res[3..8]` failed (generic: the bump work broke an earlier stage).
- `fail`: fallback.

## 9. Theory outline
1. **A button that cannot wait** (interrupts vs polling). Diagram: timeline of a task polling the bumper every 10 ms vs an interrupt reacting in microseconds. Widget: "poll or interrupt" slider for poll period vs worst-case reaction time. Check: a bump lasts 3 ms and the task polls every 10 ms; can it miss it? Verify: `gpio_install_isr_service`, `gpio_set_intr_type`, `gpio_isr_handler_add`.
2. **What happens inside an interrupt** (ISR runs above every task, tasks are frozen, `IRAM_ATTR`, no blocking calls, `...FromISR` API). Diagram: stack of priorities with the ISR on top of the tasks. Widget: the chart of the start code with a slider for ISR length that shows the motor gap growing. Check: which of these may an ISR call? Verify: ISR safe API list, `IRAM_ATTR` need, flash cache disabled during flash writes, interrupt watchdog (`CONFIG_ESP_INT_WDT`, default 300 ms) and its message.
3. **Keep it short: defer the work.** Diagram: ISR -> semaphore -> handler task. Widget: drag work between "ISR" and "task" and see motor and telemetry gaps. Check: where does the 8 ms thermal check belong? Verify: the deferred-processing pattern wording in the FreeRTOS docs.
4. **Binary semaphores** (`xSemaphoreCreateBinary`, starts empty, give/take, difference from a mutex: no owner, no priority inheritance, used for signalling). Diagram: a flag that one side raises and the other lowers. Widget: give/take stepper with a binary and a counting semaphore showing what happens to two quick gives. Check: three gives before the task runs on a binary semaphore: how many wake-ups? Verify: binary semaphore holds at most one, counting semaphore semantics, `xSemaphoreCreateCounting(max, initial)`.
5. **`xSemaphoreGiveFromISR` and the yield** (`BaseType_t woken`, `portYIELD_FROM_ISR(woken)`, why the handler runs the moment the ISR returns). Diagram: the sequence ISR -> give -> wake -> yield on exit. Widget: toggle the yield on or off and see the delay before the handler runs. Check: what is `woken` for? Verify: ESP-IDF `portYIELD_FROM_ISR` signature (takes the woken flag in v5), and that on ESP32 the yield is requested and happens at ISR exit.
6. **Priority of the handler task** (urgent part in the ISR, the rest at low priority; the 98% load). Diagram: priority ladder with motor 3, telemetry 2, bumper 1 and bumps. Widget: priority picker for the bumper with live motor and telemetry gaps. Check: why does priority 2 break telemetry? Verify: round-robin between equal priorities with `configUSE_TIME_SLICING` (ESP-IDF default 1).
7. (optional) **Contact bounce** (real switches chatter; binary semaphore merges quick gives; hardware filter in `gpio_set_intr_type` plus `gpio_glitch_filter`; software debounce in the handler task). Diagram: bouncing waveform. Widget: bounce simulator. Check: why can a binary semaphore be a feature here?

Facts to verify in ESP-IDF docs: `portYIELD_FROM_ISR` form in current ESP-IDF; `gpio_isr_handler_add` runs the handler in interrupt context, handlers should be `IRAM_ATTR` when the ISR service is installed with `ESP_INTR_FLAG_IRAM`; printing from an ISR (`ESP_LOGx` is not safe, `ESP_DRAM_LOGx` or `esp_rom_printf` are); the "Cache disabled but cached memory region accessed" panic text; interrupt watchdog default timeout; the game's 1 ms tick vs ESP-IDF default of 10 ms (`CONFIG_FREERTOS_HZ=100`).

## 10. Open risks
- **Priority 1 is the single working priority** (98% CPU, stage 2 limits). This is measured, but a player who picks 2 sees a telemetry gap of 110 vs 105 by 5 ms, so the hint ladder must lead to the load argument. Not provable in other ways without changing earlier stages.
- **Stage 6 lesson file did not exist**: numbers use the stage 6 spec's solution (identical per the stage 6 spec: CPU 96, RAM 19584, motor 10, telemetry 101). If the builder changes stage 6 (priorities, stacks, extra tasks), re-run: the CPU target (98 + margin) and the 1 ms motor-gap margin are sensitive.
- **Task cap**: 13 tasks in the solution requires the editor cap raised to 14; not part of the kernel and not done by this design pass.
- **CPU star is not discriminating** (every correct design is 98%); only the RAM star separates designs.
- `alts` "stop moved into the task" has only 1 ms of margin on the 3 ms stop limit (measured delay 2 ms). It is deterministic but sensitive to any stage 6 change; if it turns out to be unstable, drop that alt rather than loosening objective 1.
- The two-quick-gives (bounce) behaviour is deliberately not in the mission (no bounce in `irqs`); the theory covers it in a widget only. The binary-vs-counting alt proves both work for well-separated bumps.
- `isrMax` counts only CPU busy ticks inside the ISR, so a solution ISR with `gi` measures 0; the objective text says "longer than 1 ms" and 1 is an allowed value.
