# Stage 8 spec: Direct Line

All numbers were measured with `runSim` (scratch scripts, deleted). The stage 7 lesson file did not exist, so the base is the stage 7 reference solution from section 4 of `specs/stage-07.md`, built on `science-pipeline.js` `solution()` (stage 5) plus the stage 6 additions from `specs/stage-06.md`: `i2c_lock`, `imu`, `thermo`, `bump_sem`, ISR `onBump` (`stopMotors`, `giveISR bump_sem`), task `bumper` prio 1 (`take bump_sem`, `checkThermals`), stack 1280.
L = `{ T: 1000, cores: 1, heap: 8192, pins: ['BEACON','HEART'], irqs: { onBump: [150, 152, 500, 502] } }`.
Unit order (unchanged from stage 7): beacon 0, heart 1, motor 2, camera 3, telemetry 4, spectro 5, nav 6, mapper 7, science 8, radio 9, imu 10, thermo 11, **onBump 12 (isr)**, **bumper 13 (task)**. Priorities in force: beacon/heart 4, motor 3, telemetry/science/imu/thermo 2, camera/spectro/nav/mapper/radio/bumper 1.

## 1. Identity
- id: 8
- slug: `direct-line`
- title: Direct Line
- topic: Task notifications (xTaskNotifyGive, vTaskNotifyGiveFromISR, ulTaskNotifyTake, counting with pdFALSE vs clearing with pdTRUE, no kernel object)
- file: `main/rover_main.c`
- T: **1000**, cores: 1, `heap: 8192`, pins: `['BEACON', 'HEART']`
- irqs: `{ onBump: [150, 152, 500, 502] }` (two double impacts, 2 ms apart: the new strip sensor reports every impact)
- ops: `['gpio', 'call', 'delay', 'until', 'busy', 'send', 'recv', 'take', 'give', 'giveISR', 'notifyGive', 'notifyGiveISR', 'notifyTake']`
- fns: `['stopMotors', 'checkThermals']` (already in `F`)
- `chartGrid: { unit: 'motor', period: 10 }`

## 2. Story
The safety team swapped the bumper switch for a strip sensor that raises one interrupt per impact, and a rock slide hits the rover with two impacts only 2 ms apart (twice in the test). Each impact must get its own thermal check, but `bump_sem` is a binary semaphore: it holds at most one give, so when the second impact arrives before `bumper` has run, the give is merged and lost. The chart and results show 4 impacts and only 2 thermal checks (the second impact of each pair never gets one), and mission control points out that the semaphore also costs 96 B of RAM for something the task could count itself. The fix is to give the work straight to the `bumper` task as a task notification: a counter inside the task, no kernel object.

## 3. Kernel additions
None in `src/kernel.js`. Everything exists: ops `notifyGive` (`ng`), `notifyGiveISR` (`ngi`), `notifyTake` (`nt(timeout, clear)`), `K.w.notes`, the crash text "xTaskNotifyGive() was called inside an ISR. An ISR can never block: only the ...FromISR() functions are allowed there." (measured at 150 ms), the binary-semaphore merge counter `K.w.merged` (2 in the start).
Editor and lesson plumbing for the builders:
- **Object type choice**: `bump_sem` in `start()` carries `types: ['binary', 'counting'], max: 8` so the editor draws the `<select>` (editor already supports `o.types`; the counting line shows `xSemaphoreCreateCounting(8, 0)`). This makes the counting-semaphore design reachable.
- **Delete an unused object**: the player cannot remove a kernel object today (`src/editor.js` has `delunit` for tasks only). Add a `delete` button (click twice to confirm, like `delunit`) to each object line in `appMain` that calls `delete P.objs[k]`. The kernel skips ops on a missing object (`if(!o){r.pc++;continue;}`), so leftover `take`/`give` ops of the deleted object are harmless. Without this the Lean star is unreachable.
- Notification ops: `ngi` is offered with the target task as a `<select>` of task names (editor already does this); `nt(to, clear)` needs a `clear` select (`pdFALSE` / `pdTRUE`) in the editor line `ulTaskNotifyTake(<pdFALSE|pdTRUE>, <timeout>)`. Check that editor.js renders and edits `clear` (default is 1 = pdTRUE); if not, add it. The solution depends on `clear = 0`.
- Task cap: the start already has 13 tasks and the solution adds none; no change beyond the cap raised in stage 7.
- Game-time note: the 8 ms thermal check and 2 ms spacing are chosen for readability; the real ESP32 notification path is a few hundred ns shorter than a semaphore give, which the simulator does not model (state this honestly in the theory; see open risks).

## 4. Programs
Start (`start(prev)`):
```js
const p = clone(prev || stage7.solution());
p.objs.bump_sem = { type: 'binary', types: ['binary', 'counting'], max: 8 };  // same semaphore, now editable
// no new units: ISR onBump (stopMotors, gi('bump_sem')) and bumper (tk('bump_sem'), checkThermals) come from stage 7
```
The "new part delivered by another team" is the strip sensor itself (the new `irqs` times). Reaching this stage's start by running stage 7's passing firmware is the point: it was correct for one bump at a time.
Reference solution:
```js
const p = stage7.solution();
delete p.objs.bump_sem;
p.units[12].code = [c('stopMotors'), ngi('bumper')];     // vTaskNotifyGiveFromISR(bumper_handle, &woken)
p.units[13].code = [nt(-1, 0), c('checkThermals')];      // ulTaskNotifyTake(pdFALSE, portMAX_DELAY)
```
ESP-IDF form: ISR `stop_motors(); BaseType_t woken = pdFALSE; vTaskNotifyGiveFromISR(bumper_handle, &woken); portYIELD_FROM_ISR(woken);`. Task: `ulTaskNotifyTake(pdFALSE, portMAX_DELAY); check_thermals();`. `pdFALSE` decrements the count by one per call, so every give is handled; `pdTRUE` resets it to zero, so a burst is one wake-up.
Reachability: the player edits one ISR line, one task line and (for 3 stars) deletes `bump_sem`; the counting alternative needs only the object type `<select>` and no deletion. Note `bumper` priority stays 1 (as in stage 7: the system is at about 98% load).

## 5. Objectives (goals, in order) and checks
Helpers: `irq = K.w.irq.onBump || []`, `st = E_(K,'stopMotors')`, `ck = E_(K,'checkThermals')`, `stopLat = irq.map(t => first x of st with x >= t, minus t, or -1)`, `ckLat = irq.map((t, i) => ck[i] === undefined ? -1 : ck[i] - t)` (the i-th impact is paired with the i-th check), `im = S_(K,'i2cReadIMU')`, `coll`, `ids`, `lost`, `mp`, `pl`, `sp`, `mg`, `tl`, `tg`, `b`, `h`, `steady`, `f` as in stages 5 to 7.

| # | Goal text | Check | Start | Solution |
|---|---|---|---|---|
| 0 | `Interrupt handler: no ISR runs longer than 1 ms` | `K.stats.isrMax <= 1`, text `longest ISR ${K.stats.isrMax} ms` | 0 ok | 0 ok |
| 1 | `Safety: motors stopped within 3 ms of every impact (4 of 4)` | `irq.length === 4 && stopLat.every(x => x >= 0 && x <= 3)`, text `stop delays ${stopLat.join(', ')} ms` | 0, 0, 0, 0 ok | 0, 0, 0, 0 ok |
| 2 | `Follow-up: one thermal check for every impact, each within 150 ms of its impact` | `irq.length === 4 && ck.length >= 4 && ckLat.every(x => x >= 0 && x <= 150)`, text `${ck.length} checks for ${irq.length} impacts, delays ${ckLat.join(', ')} ms` (-1 = never) | 2 checks, 29, 398, -1, -1 -> NO | 4 checks, 29, 81, 50, 88 ok |
| 3 | `Still working from stage 6: no I2C collisions, IMU at least 45 reads, never more than 40 ms apart` | `coll === 0 && im.length >= 45 && maxGap(im) <= 40`, text as stage 7 | 0, 50, 30 ok | 0, 50, 30 ok |
| 4 | `Still working from stage 5: all 10 samples transmitted, in order, none overwritten` | as stage 7 | 10 ok | 10 ok |
| 5 | `Still working from stage 4: mapper frees its frames, at least 3 frames processed and 2 paths planned in 1 s` | `K.heap >= 6144 && mp >= 3 && pl >= 2` | 4, 3, 8192 ok | same |
| 6 | `Still working from stage 3: spectrometer 47 to 53 samples started in 1 s` | `sp >= 47 && sp <= 53` | 50 ok | 50 ok |
| 7 | `Still working from stage 2: motor never more than 11 ms between steps, telemetry never more than 105 ms between packets, at least 9 sent` | `mg <= 11 && tg <= 105 && tl.length >= 9` | 10, 101, 10 ok | 10, 101, 10 ok |
| 8 | `Still working from stage 1: BEACON every 500 ms and HEART every 200 ms (within 3 ms)` | `steady(b,500,2) && steady(h,200,5)` | 2 / 5 ok | 2 / 5 ok |

The start fails exactly objective 2 (one cause: lost gives). Stage 7's "ISR no longer than 1 ms" is objective 0 here as a regression (the start and solution measure 0). Margins: delay 88 vs 150 (1.7x), stop delay 0 vs 3, motor gap 10 vs 11 and telemetry 101 vs 105 are inherited and unchanged.

## 6. Bonus
`B(99, 20900)`.
- Solution: CPU **99%**, RAM **20864 B** (stage 7 solution 20960 minus the 96 B semaphore): 3 stars. Start: CPU 97%, RAM 20960 (misses Lean).
- RAM: bumper stack 1200 = 20784 (3 stars), 1280 = 20864 (3 stars), 1536 = 21120 (2 stars). Any design that keeps `bump_sem` is 20960 (2 stars, whatever the stack), so only the notification design with the object deleted earns Lean. Margin on the Lean limit is 36 B, deterministic.
- CPU: the solution handles 4 checks (32 ms) instead of 3, so it measures 99, only at the limit (a lazier handler such as `d(10)` after each check also measures 99). The CPU star does not separate designs (every correct design is 98 or 99). Risk: if stage 6/7 builders change anything, the CPU target must be re-measured; 99 leaves zero margin. The discriminating star is Lean.

## 6b. Chart
- Start: AUTO zoom **4x**, densest row `spectro` 54.8 changes per 100 px, **250 ms visible at once**. Solution: 4x, 55.5, 250 ms. (T = 1000 as in stages 5 to 7.) Both impact pairs fit: the first pair (150, 152 ms) and its checks (179 to 187, 233 to 241 ms in the solution; only 179 to 187 in the start) are inside the first 250 ms window; the second pair is at 500 and 502 ms.
- `chartGrid: { unit: 'motor', period: 10 }`.
- `evidence(K)` (verified on start, solution and the wrong answers below):
```js
evidence: K => {
  const irq = K.w.irq.onBump || [], t0 = irq[0] === undefined ? 0 : irq[0];
  if (K.crash) return /ISR/.test(K.crash.msg) ? [{ unit: 'onBump', from: t0, to: K.crash.t, label: K.crash.msg.split('.')[0] }] : [];
  if (K.stats.isrMax > 1) return [{ unit: 'onBump', from: t0, to: t0 + K.stats.isrMax, label: `onBump ran ${K.stats.isrMax} ms inside the interrupt at ${t0} ms: no task could run` }];
  const st = E_(K, 'stopMotors'), miss = irq.find(t => !st.some(x => x >= t && x <= t + 3));
  if (miss !== undefined) return [{ unit: 'onBump', from: miss, to: miss + 3, label: `impact at ${miss} ms: stopMotors() did not run within 3 ms` }];
  const ck = E_(K, 'checkThermals'), bad = irq.findIndex((t, i) => ck[i] === undefined || ck[i] - t > 150);
  if (bad >= 0) {
    const g = irq.filter(t => Math.abs(t - irq[bad]) <= 10), a = g[0], z = g[g.length - 1], n = ck.filter(x => x > a && x <= z + 150).length;
    return [{ unit: 'bumper', from: a, to: Math.min(z + 150, K.end - 1), label: `${g.length} impacts within ${z - a} ms at ${a} ms but only ${n} thermal check${n === 1 ? '' : 's'} followed: ${n ? 'the extra wake-ups were lost' : 'bumper was never woken'}` }];
  }
  return [];
}
```
Measured: start and `clearsCount` -> `bumper` 150 to 302, "2 impacts within 2 ms at 150 ms but only 1 thermal check followed: the extra wake-ups were lost"; never notified -> same bracket, "only 0 thermal checks ... bumper was never woken"; slow ISR -> `onBump` 150 to 158; no stop -> `onBump` 150 to 153; `ng` in ISR -> `onBump` 150 to 150 with the crash text; solution -> `[]`. The 302 end sits just past the first window; the chart scrolls to the bracket start. The `bumper` row exists in the start and all mutations.

## 7. Wrong answers
Mutations of the solution (ISR = `p.units[12]`, bumper = `p.units[13]`). Objective indexes as in section 5.

| Name | Mutation | Fails | Measured | `says` |
|---|---|---|---|---|
| the original binary semaphore (start) | do not apply the fix (`bump_sem` given and taken) | 2 | 2 checks, delays 29, 398, -1, -1; `K.w.merged` 2 | `lostImpacts` |
| take clears the count (`pdTRUE`) | `p.units[13].code[0] = nt(-1, 1)` | 2 | 2 checks, same as the start (a burst is one wake-up) | `clearsCount` |
| notify the wrong task | `p.units[12].code[1] = ngi('telemetry')` | 2 | 0 checks (-1 x 4); telemetry unaffected | `neverWakes` |
| ISR never notifies | `p.units[12].code = [c('stopMotors')]` | 2 | 0 checks | `neverWakes` |
| ISR gives the semaphore, task waits for a notification | `p.objs.bump_sem = { type: 'binary' }; p.units[12].code = [c('stopMotors'), gi('bump_sem')]` | 2 | 0 checks, `merged` 3 | `neverWakes` |
| plain `xTaskNotifyGive` in the ISR | `p.units[12].code[1] = ng('bumper')` | crash | "xTaskNotifyGive() was called inside an ISR. An ISR can never block: only the ...FromISR() functions are allowed there." at 150 ms | crash: `isrBlock` |
| thermal check back in the ISR | `p.units[12].code = [c('stopMotors'), c('checkThermals')]` | 0, 1, 7, 8 | isrMax 8, stop delays 0, 6, 0, 6, motor gap 26, telemetry 111, BEACON/HEART 2/5 off | `slowIsr` |
| flash write in the ISR | `p.units[12].code = [c('stopMotors'), c('logToFlash')]` | crash | "Guru Meditation Error: Core 0 panic'ed (Cache disabled but cached memory region accessed)..." at 150 ms | crash: `isrFlash` |
| motors stopped late (stop moved into the task) | `p.units[12].code = [ngi('bumper')]; p.units[13].code = [nt(-1, 0), c('stopMotors'), c('checkThermals')]` | 1 | stop delays 2, 0, 18, 16 | `lateStop` |
| forgot to stop the motors | `p.units[12].code = [ngi('bumper')]` | 1 | stop delays -1 x 4; checks fine (29, 81, 50, 88) | `noStop` |
| bumper above the motor | `p.units[13].prio = 4` | 7 | motor gap 26, telemetry 111 | `hog` |
| bumper at priority 3 | `p.units[13].prio = 3` | 3, 7 | motor gap 12, telemetry 114, IMU gap 42 | `hog` |
| bumper shares priority 2 with telemetry | `p.units[13].prio = 2` | 7 | telemetry gap 118, motor 10 | `hog` |
| bumper polls the notification with no timeout | `p.units[13].code[0] = nt(0, 0)` | crash | `task_wdt` at 599 ms (CPU 100%) | crash: `busyLoop` |
| bumper stack 1024 | `p.units[13].stack = 1024` | crash | "A stack overflow in task bumper has been detected" at 152 ms | crash: `stack` |

Crash cases truncate the run, so failing indexes depend on where it stops; the verifier needs only the crash text.
Accepted correct designs for `alts` (all measured, 0 failed objectives):
| Name | Mutation | Stars | Measured |
|---|---|---|---|
| counting semaphore (editor type select) | `p.objs.bump_sem.type = 'counting'` on the start, ISR `[stopMotors, gi('bump_sem')]`, bumper `[tk('bump_sem'), checkThermals]` | 2 | 4 checks, delays 29, 81, 50, 88; RAM 20960, CPU 99 |
| notification, `bump_sem` left unused | solution without `delete p.objs.bump_sem` | 2 | RAM 20960 |
| bumper stack 1536 | `p.units[13].stack = 1536` | 2 | RAM 21120 |
| bumper stack 1200 | `p.units[13].stack = 1200` | 3 | RAM 20784 |
| take with a 50 ms timeout | `p.units[13].code[0] = nt(50, 0)` | 3 | same as solution |
| polling `[d(5), nt(0, 0), checkThermals]` | replace code | 3 | delays 30, 86, 50, 95 (limit 150), CPU 99 |
| bumper delays 10 ms after each check | `p.units[13].code.push(d(10))` | 3 | delays 29, 88, 50, 97 |

Do not list `bumper priority 2` as an alt (telemetry gap 118).

## 8. Reactions
Keys and `diagnose(K, res)` logic, checked in this order (`bumper = K.units.find(u => u.name === 'bumper')`, `isr = K.units.find(u => u.name === 'onBump')`):
- `isrBlock`: `K.crash && /called inside an ISR/.test(K.crash.msg)` (a plain `xTaskNotifyGive` in the ISR; use the FromISR version).
- `isrFlash`: `K.crash && /Cache disabled/.test(K.crash.msg)`.
- `stack`: `K.crash && /stack overflow/.test(K.crash.msg)`.
- `busyLoop`: `K.crash && /task_wdt/.test(K.crash.msg)`.
- `slowIsr`: `!res[0][0]`.
- `noStop`: `!res[1][0]` and `K.w.e.stopMotors` absent or empty (or all stop delays -1).
- `lateStop`: `!res[1][0]` otherwise (stop delay above 3 ms: the stop must stay in the ISR).
- `neverWakes`: `!res[2][0]` and `(E_(K,'checkThermals').length === 0)`.
- `clearsCount`: `!res[2][0]` and `bumper.code.some(i => i.op === 'notifyTake' && String(i.clear) !== '0')` and the ISR contains `notifyGiveISR`.
- `lostImpacts`: `!res[2][0]` otherwise (several impacts, fewer checks: the binary semaphore merges gives).
- `hog`: `!res[7][0]` or `!res[3][0]` (priority mistake, mention the 98% load and priority 1).
- `regress`: any other of `res[4..8]` failed.
- `fail`: fallback.

## 9. Theory outline
1. **A semaphore is a lot of machinery for one wake-up.** What a kernel object is (96 B here, a control block plus its queue on the heap in real FreeRTOS, a handle to create and share) vs a signal that has exactly one receiver. Diagram: stage 7 chain ISR -> `bump_sem` -> `bumper` with the object highlighted, next to the direct arrow ISR -> `bumper`. Widget: RAM counter where objects are toggled between semaphore and notification. Check: how many bytes does the notification chain cost in RAM compared with the semaphore chain? Verify: each task has a notification value and state built into its TCB (`configTASK_NOTIFICATION_ARRAY_ENTRIES`, default 1 in ESP-IDF v5.x), no allocation.
2. **Notify a task directly** (`xTaskNotifyGive`, `vTaskNotifyGiveFromISR`, the task handle from `xTaskCreate`, `ulTaskNotifyTake`). Diagram: the notification value inside the task as a counter that gives increment and take reads. Widget: give/take stepper on a task counter. Check: which handle does the ISR need? Verify: signatures, `pdTRUE` vs `pdFALSE` semantics, and that `xTaskNotifyGive` is a macro over `xTaskGenericNotify`.
3. **The counting trap: `pdTRUE` vs `pdFALSE`** (clear on exit gives one wake-up per burst; decrement handles every give). Diagram: three gives -> pdTRUE one run, pdFALSE three runs. Widget: burst slider (1 to 5 gives, 0 to 5 ms apart) with the clear flag, shows checks run. Check: three gives before the task runs, `pdTRUE`: how many runs? Verify: `ulTaskNotifyTake` return value is the count before clearing/decrementing.
4. **Why the binary semaphore lost impacts** (give while already full is dropped: the sim's `merged` counter; counting semaphore as the object-based fix and its cost). Diagram: timeline of two gives 2 ms apart landing in the same slot. Widget: replay of the stage chart with a type switch (binary, counting, notification). Check: which three designs would not lose the second impact? Verify: `xSemaphoreGiveFromISR` returns `pdFALSE` when a binary semaphore is already full.
5. **Limits: one receiver, one value, no timeouts on the giver** (cannot notify two tasks, the receiver cannot be an ISR, the giver never blocks, only one wait per task; a queue or event group for data and many waiters). Diagram: decision tree notification vs semaphore vs queue vs event group. Widget: "which tool?" quiz of four scenarios. Check: two tasks must both wake on one event: which tool? Verify: the notification array, `xTaskNotifyWait` as the richer form (mention only).
6. **How much faster?** (the FreeRTOS documentation claims a notification unblocks a task about 45% faster and uses less RAM than a semaphore; our simulator counts only RAM). Diagram: bar of cycles for give+take, semaphore vs notification. Widget: shown honestly with the doc's claim as a labelled figure, not measured here. Check: what must be true to use a notification for the bumper? Verify the exact wording of the speed claim and conditions in the FreeRTOS "RTOS Task Notifications" page before publishing.
7. (optional) **Priority and the 98% load, again** (the bumper still sits at 1; same ladder as stage 7). Reuse the priority-picker widget. Check: why not give the bumper a higher priority now that it is lighter?

Facts to verify in ESP-IDF/FreeRTOS docs: `vTaskNotifyGiveFromISR` and `portYIELD_FROM_ISR` signatures in the ESP-IDF FreeRTOS (v5); `ulTaskNotifyTake` semantics; notification state is part of the TCB (no heap use); the "about 45% faster / less RAM" claim and its conditions; that a binary semaphore given while full is lost (returns `pdFALSE`); game ticks are 1 ms vs ESP-IDF default `CONFIG_FREERTOS_HZ=100`.

## 10. Open risks
- **"Faster" is not proven.** The simulator has no cost for kernel calls, so a notification and a semaphore wake `bumper` at identical times (check delays 29/81/50/88 in both). Only the RAM saving (96 B) is measured and rewarded. The theory must state the speed claim as the FreeRTOS documentation's, not as something measured here, and a reviewer should confirm the claim.
- **Editor changes required**: the object `delete` button and the `clear` (pdTRUE/pdFALSE) select on `ulTaskNotifyTake`, and `types` on `bump_sem`. Without the delete button the Lean star cannot be reached; without the `clear` select the solution cannot be built. Not part of the kernel; not done by this design pass.
- **The CPU star has zero margin** (solution 99, limit 99). It is not discriminating; if stage 6 or 7 builders change priorities or stacks, re-run. A very small change can make CPU 100 and trigger `task_wdt`: the system is saturated (a burst of 3 hits with 8 ms checks already crashes the correct solution at 599 ms; this is why the test uses two double impacts and 4 checks).
- **Chaotic timing**: the check times (179, 233, 550, 590) depend on round-robin among the priority-1 tasks. Other impact times were measured and some fail (for example impacts at 150, 152, 300, 302 crash the solution with `task_wdt`). Keep `irqs` exactly as specified. The 150 ms limit leaves 62 ms of margin.
- **Stage 7 lesson file did not exist**: numbers use the stage 7 spec's reference solution. If the builder changes it (bumper stack, priority 1, ISR code), re-run before trusting any value here.
- The stage 7 start used `gi('bump_sem')` only with the semaphore; the stage 7 theory teaches "binary merges two quick gives" as a bounce widget only. Stage 8 turns it into a real failure; the stage 8 theory should refer back to that widget.
- The 2 ms spacing of the impacts is a simulation choice; a real rock slide would produce more and closer edges (bounce), and a real handler would debounce.
