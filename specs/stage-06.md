# Stage 6 spec: One Bus, Two Masters

All numbers were measured with `runSim` on `stage5.solution()` (the lesson file exists) plus the new parts, with L = `{ T: 1000, cores: 1, heap: 8192, pins: ['BEACON','HEART'] }`. Unit order: beacon 0, heart 1, motor 2, camera 3, telemetry 4, spectro 5, nav 6, mapper 7, science 8, radio 9, **imu 10**, **thermo 11** (both in the start and in the solution).

## 1. Identity
- id: 6
- slug: `one-bus-two-masters`
- title: One Bus, Two Masters
- topic: Race conditions and mutexes (xSemaphoreCreateMutex, xSemaphoreTake, xSemaphoreGive, critical sections, shared I2C bus)
- file: `main/rover_main.c`
- T: **1000**, cores: 1, `heap: 8192` (as stage 5), pins: `['BEACON', 'HEART']`
- ops: `['gpio', 'call', 'delay', 'until', 'busy', 'send', 'recv', 'take', 'give']`
- fns: `['i2cReadIMU', 'i2cReadThermo']` (both already in `F`)
- `chartGrid: { unit: 'imu', period: 20 }` (3.2 px per ms at 4x, so ticks are 64 px apart: readable)

## 2. Story
The navigation team bolted an IMU (attitude, read every 20 ms, one transaction = 4 ms wait + 1 ms CPU) and the thermal team a thermometer (read every 100 ms, 7 ms wait + 1 ms CPU) onto the same I2C bus, each from its own task, and both drivers assume they own the bus. The I2C peripheral can run only one transaction at a time, so when the thermometer read starts while the IMU read is still on the wire (or the other way round) the bus is corrupted: the serial monitor prints "I2C collision: two transactions on the bus at the same time" and the `faults` row fills with red marks (5 in one second, the first at 4 ms). The thermal team did send a mutex, `i2c_lock`, but nobody takes it; you make the two tasks share the bus by holding it for exactly one transaction.

## 3. Kernel additions
None in `src/kernel.js`. Everything exists: `F.i2cReadIMU` (wait 4, cost 1, stack 400, fx `mast`) and `F.i2cReadThermo` (wait 7, cost 1, stack 400, fx `chip`) both increment `K.w.bus` in `start` and decrement it in `end`; a start while `K.w.bus > 0` counts `K.w.coll`, logs the collision text and drops a `!` mark. The `mutex` object (RAM 96 B, no `len`), the `take` and `give` ops, mutex owner and priority inheritance exist.

Editor: the task cap is already 12 (`>= 12`, raised in stage 5). The start has exactly 12 tasks, the reference solution adds none, so nothing to change. Check only that `take`/`give` offer `i2c_lock` (editor.js lists `binary`, `counting`, `mutex` objects) and that `i2cReadIMU` / `i2cReadThermo` appear in the function list through `fns`. Game-time note for the theory: the transaction lengths are 5 and 8 ms for readability; a real 400 kHz transfer of a few bytes takes well under 1 ms, but the lock logic is identical.

## 4. Programs
Start (`start(prev)`):
```js
const p = clone(prev || stage5.solution());
p.objs.i2c_lock = { type: 'mutex' };    // "delivered by the thermal team", never taken (adds to the stage 5 objs; keeps `samples`)
p.units.push(task('imu', 2, [c('i2cReadIMU'), un(20)], { stack: 1280 }));
p.units.push(task('thermo', 2, [c('i2cReadThermo'), d(100)], { stack: 1280 }));
```
Priority 2 for both is deliberate (same as telemetry and science, below motor): the start meets every earlier objective, so only the bus objective fails. Stack need is 768 + 400 = 1168; 1280 leaves 112 B.

Solution:
```js
const p = stage5.solution();
p.objs.i2c_lock = { type: 'mutex' };
p.units.push(task('imu', 2, [tk('i2c_lock'), c('i2cReadIMU'), gv('i2c_lock'), un(20)], { stack: 1280 }));
p.units.push(task('thermo', 2, [tk('i2c_lock'), c('i2cReadThermo'), gv('i2c_lock'), d(100)], { stack: 1280 }));
```
`tk('i2c_lock')` is `xSemaphoreTake(i2c_lock, portMAX_DELAY)`, `gv` is `xSemaphoreGive`. ESP-IDF form: `i2c_lock = xSemaphoreCreateMutex(); xSemaphoreTake(i2c_lock, portMAX_DELAY); /* i2c_master_transmit_receive(...) */ xSemaphoreGive(i2c_lock);`. Note for the theory: in ESP-IDF the new `i2c_master` driver serialises bus users itself (it has a bus lock); the lesson is about the pattern, so state this honestly and show a shared-bus case (two devices on one bus handle driven by hand, or a shared sensor-data structure).

Reachability: the mutex is in `start()`; the player only adds `take`/`give` ops to two existing tasks.

## 5. Objectives (goals, in order) and checks
Helpers: `coll = K.w.coll || 0`, `im = S_(K,'i2cReadIMU')`, `th = S_(K,'i2cReadThermo')`, `ids = K.w.sent || []`, `lost = K.w.lost || 0`, `sp`, `mg`, `tl`, `tg`, `b`, `h`, `mp`, `pl`, `steady` as in stage 5, `f = x => x === Infinity ? '-' : x`.

| # | Goal text | Check | Start | Solution |
|---|---|---|---|---|
| 0 | `I2C bus: never two transactions on the bus at the same time` | `coll === 0`, text `${coll} collisions` | 5 -> NO | 0 ok |
| 1 | `IMU: at least 45 reads in 1 s, never more than 40 ms between reads` | `im.length >= 45 && maxGap(im) <= 40`, text `${im.length} reads, longest gap ${f(maxGap(im))} ms` | 50, 21 ok | 50, 30 ok |
| 2 | `Thermometer: at least 8 reads in 1 s, never more than 150 ms between reads` | `th.length >= 8 && maxGap(th) <= 150`, text `${th.length} reads, longest gap ${f(maxGap(th))} ms` | 10, 111 ok | 9, 115 ok |
| 3 | `Still working from stage 5: all 10 samples transmitted, in order, none overwritten` | `lost === 0 && ids.length === 10 && ids.every((v, i) => v === i)`, text `${ids.length} of 10 delivered` | 10 ok | 10 ok |
| 4 | `Still working from stage 4: mapper frees its frames, at least 3 frames processed and 2 paths planned in 1 s` | `K.heap >= 6144 && mp >= 3 && pl >= 2`, text `${mp} frames, ${pl} paths, ${K.heap} B of heap free` | 4, 3, 8192 ok | same |
| 5 | `Still working from stage 3: spectrometer 47 to 53 samples started in 1 s` | `sp >= 47 && sp <= 53`, text `${sp} samples` | 50 ok | 50 ok |
| 6 | `Still working from stage 2: motor never more than 11 ms between steps, telemetry never more than 105 ms between packets, at least 9 sent` | `mg <= 11 && tg <= 105 && tl.length >= 9`, text `motor gap ${f(mg)} ms, telemetry gap ${f(tg)} ms, ${tl.length} packets` | 10, 102, 10 ok | 10, 101, 10 ok |
| 7 | `Still working from stage 1: BEACON every 500 ms and HEART every 200 ms (within 3 ms)` | `steady(b,500,2) && steady(h,200,5)`, text `BEACON ${b.length} toggles, HEART ${h.length} toggles` | ok (2 / 5) | ok |

Notes: the start fails only objective 0. Objectives 1 and 2 are not decoration: they stop "fix" designs that delete a task, starve it, or hold the lock too long (see wrong answers). The IMU gap limit 40 has 10 ms of margin over the solution (30); IMU 45 reads has 5 below 50. Thermometer reads are 9 or 10 depending on timing; 8 leaves one read of margin. Telemetry gap in the start is 102, the stage 2 limit of 105 is not touched by the solution (101).

## 6. Bonus
`B(97, 19700)`.
- Solution: CPU 96%, RAM 19584 B (12 stacks and objects: stage 5 solution 16928 + 2 x 1280 + 96): 3 stars.
- RAM: stacks 1200/1200 = 19424 (3 stars); one stack at 1536 = 19840 (misses Lean, 2 stars); both 1536 = 20096 (2 stars); both left at 4096 = 25216 (2 stars). Minimum is 1168 per task.
- CPU: one task reading both devices every 20 ms (no mutex) is 98% (2 stars, RAM 18304 so Lean is met); thermo every 50 ms is 97% (still 3 stars). The CPU margin is only 1 point because the new tasks cost 1 ms each; see risks.

## 6b. Chart
- Start: AUTO zoom **4x**, densest row `spectro` 54.3 changes per 100 px, 250 ms visible at once. Solution: 4x, 53.9, 250 ms. Same reason as stage 5: T = 1000. The first collision (4 ms) and the first 12 ms of overlap are inside the first window; collisions then repeat at 223, 443, 664, 883 ms.
- `chartGrid: { unit: 'imu', period: 20 }`.
- `evidence(K)`:
```js
evidence: K => {
  const marks = K.ev.filter(e => e.k === 'mark' && e.row === '!').map(e => e.t);
  if (K.diag.length) { // a lock that is never given back
    const nm = K.diag[0].split(' ')[0], e = E_(K, nm === 'imu' ? 'i2cReadIMU' : 'i2cReadThermo');
    return [{ unit: nm, from: e.length ? e[e.length - 1] : 0, to: K.end - 1, label: K.diag[0] }];
  }
  if (K.w.coll) {
    const tc = marks[0], s = S_(K, 'i2cReadThermo').filter(t => t <= tc), st = s[s.length - 1], en = E_(K, 'i2cReadThermo').find(t => t > st);
    return [{ unit: 'thermo', from: st, to: en, label: `I2C collision at ${tc} ms: imu and thermo were on the bus at the same time (${K.w.coll} in 1 s)` }];
  }
  const im = S_(K, 'i2cReadIMU'); let bi = -1, bg = 0;
  for (let i = 1; i < im.length; i++) if (im[i] - im[i - 1] > bg) { bg = im[i] - im[i - 1]; bi = i; }
  if (bg > 40) return [{ unit: 'imu', from: im[bi - 1], to: im[bi], label: `${bg} ms between IMU reads: imu waited for the bus lock` }];
  return [];
}
```
Guard: `S_` lists may be empty when thermo was removed (`s[s.length-1]` undefined); the collision branch only runs when `K.w.coll > 0`, which needs both tasks, so it is safe; for a removed task `evidence` returns `[]`.
Measured brackets: start `thermo` 4 to 13 (label "... at 4 ms ... (5 in 1 s)"); thermo never gives the lock: `imu` 9 to 999, label "imu waits for i2c_lock, held by thermo"; imu never gives: `imu` 9 to 999, "imu waits for i2c_lock, which it already holds itself"; lock held across `vTaskDelay` in thermo: `imu` 4 to 123, "119 ms between IMU reads: imu waited for the bus lock".

## 7. Wrong answers
Mutations apply to the solution (units 10 = imu, 11 = thermo).

| name | mutation | result | says |
|---|---|---|---|
| no locking (the original bug) | `p.units[10].code = [c('i2cReadIMU'), un(20)]; p.units[11].code = [c('i2cReadThermo'), d(100)]` | fails 0 (5 collisions, first at 4 ms) | `race` |
| only the IMU task locks | `p.units[11].code = [c('i2cReadThermo'), d(100)]` | fails 0 (5 collisions) | `oneSided` |
| only the thermometer task locks | `p.units[10].code = [c('i2cReadIMU'), un(20)]` | fails 0 (5 collisions) | `oneSided` |
| thermometer never gives the lock back | `p.units[11].code = [tk('i2c_lock'), c('i2cReadThermo'), d(100)]` | fails 1, 2 (1 read each); `K.diag` has 2 lines (deadlock: thermo waits for a lock it holds) | `neverReleased` |
| IMU never gives the lock back | `p.units[10].code = [tk('i2c_lock'), c('i2cReadIMU'), un(20)]` | fails 1, 2 (1 and 0 reads); `K.diag` has 2 lines | `neverReleased` |
| lock held across the delay | `p.units[11].code = [tk('i2c_lock'), c('i2cReadThermo'), d(100), gv('i2c_lock')]` | fails 1 only (IMU 9 reads, gap 119 ms); thermometer passes (9 reads, gap 116) | `heldTooLong` |
| both tasks spin on the lock | `p.units[10].code[0] = tk('i2c_lock', 0); p.units[11].code[0] = tk('i2c_lock', 0)` | fails 6 only (telemetry gap 110 ms > 105; CPU 98%) | `hog` |
| thermometer task deleted | `p.units.pop()` | fails 2 only (0 reads); no collision | `missing` |
| IMU stack 1024 | `p.units[10].stack = 1024` | crash `stack overflow` in `imu` at 4 ms | (crash) |
| thermo stack 1024 | `p.units[11].stack = 1024` | crash `stack overflow` in `thermo` at 12 ms | (crash) |

Alternatives that must pass (`alts`, stars measured with `B(97, 19700)`):
- `stacks 1200` : 3 stars (CPU 96, RAM 19424)
- `stacks 1536` : 2 stars (RAM 20096)
- `one stack 1536` : 2 stars (RAM 19840)
- `stacks 4096` : 2 stars (RAM 25216)
- `thermo priority 1` : 3 stars (thermo gap 129, IMU gap 25)
- `thermometer every 50 ms` (`p.units[11].code[3] = d(50)`) : 3 stars (CPU 97, 17 reads, gap 63)
- `take with a 50 ms timeout` (both `tk('i2c_lock', 50)`) : 3 stars (identical to the solution, the lock is never held more than 8 ms)
- `one task reads both devices` (`p.units.pop(); p.units[10].code = [c('i2cReadIMU'), c('i2cReadThermo'), un(20)]`) : 2 stars (CPU 98, RAM 18304; the two never overlap because one task issues them in sequence; 50 thermometer reads, spectrometer 49 samples)
Do not list `imu priority 3` as an alt: it passes only at the limit (motor gap 11).

## 8. Reactions
Keys: `race`, `oneSided`, `neverReleased`, `heldTooLong`, `missing`, `hog`, `crash`, `watchdog`, `fail`, `pass`.
```js
diagnose: (K, res) => {
  const imu = K.units.find(u => u.name === 'imu'), th = K.units.find(u => u.name === 'thermo');
  const uses = u => !!u && u.code.some(i => i.op === 'take');
  const across = u => { if (!u) return false; const a = u.code.findIndex(i => i.op === 'take'), z = u.code.findIndex(i => i.op === 'give');
    return a >= 0 && z > a && u.code.slice(a, z).some(i => i.op === 'delay' || i.op === 'until'); };
  if (!res[0][0]) return uses(imu) || uses(th) ? reactions.oneSided : reactions.race;
  if (K.diag.length) return reactions.neverReleased;
  if (!res[1][0] || !res[2][0]) return across(imu) || across(th) ? reactions.heldTooLong : reactions.missing;
  if (!res[3][0] || !res[4][0] || !res[5][0] || !res[6][0] || !res[7][0]) return reactions.hog;
  return reactions.fail;
}
```
Conditions: `race` no task takes the lock and the bus collides; `oneSided` only one of the two tasks takes it (a lock only works if everybody uses it); `neverReleased` the run ended with a deadlock line (a task waits for a lock it holds itself or that the other never returned); `heldTooLong` a `vTaskDelay` or `vTaskDelayUntil` sits between take and give, so the other task's reads are delayed past the limit; `missing` a read rate objective fails without a lock fault (a task removed or too slow); `hog` an earlier-stage objective broke (spinning on a timeout-0 take, or priorities raised too far). `crash` and `watchdog` are the generic crash replies; a stack overflow in `imu` or `thermo` needs no special key (the message names the task).

## 9. Theory outline
1. **Two masters, one wire** (diagram: SDA/SCL bus with two tasks as masters and a timeline of two overlapping transactions; widget: "bus collision" timeline with a period slider for each task and a lock toggle showing the collision count; question: with a 20 ms and a 100 ms task and 5 and 8 ms transactions, why do they collide even though each is "only 13 percent busy"?). Facts: ESP32 I2C controller hardware, one transaction at a time per port; what real firmware shows on corruption (timeout, `ESP_ERR_TIMEOUT`, `ESP_ERR_INVALID_STATE`, a garbled reading).
2. **What a race condition is** (diagram: two instruction sequences interleaved around a shared variable, read-modify-write losing an update; widget: step-through interleaver where the learner picks which task runs next and sees the final value; question: what value does a shared counter end with after two tasks each increment it once, in the worst interleaving?). Facts: a race needs shared state, at least one writer and no ordering; `counter++` is three machine instructions; preemption can happen between any two.
3. **Mutual exclusion and the mutex** (diagram: key-and-door picture, a mutex as a token with an owner; widget: two tasks, a mutex, and Take/Give buttons with the blocked task shown waiting; question: what happens to the second `xSemaphoreTake(portMAX_DELAY)` when the mutex is taken?). Facts: `xSemaphoreCreateMutex()`, taken at creation state "available" (unlike a binary semaphore which starts empty), `xSemaphoreTake`/`xSemaphoreGive`, owner semantics, it must not be used in an ISR.
4. **Mutex versus binary semaphore** (diagram: ownership arrow versus signalling arrow; widget: toggle semaphore/mutex and give from the wrong task: a mutex refuses, a semaphore accepts; question: which one for "ISR tells task data is ready", and which for "protect the bus"?). Facts: only the owner gives a mutex (the sim asserts "gave ... but does not hold it"); mutexes carry priority inheritance, which stage 12 treats in depth, so mention it with a forward pointer only; recursive mutexes exist (`xSemaphoreCreateRecursiveMutex`).
5. **Keep the critical section short** (diagram: timeline of a thermometer holding the lock 8 ms against one holding it 100 ms, with the IMU gap measured; widget: "lock budget" with a hold-time slider and the resulting IMU worst-case gap; question: why is `vTaskDelay` between take and give a bug?). Facts: worst-case blocking of a task is the longest hold time of the others; never block on something unrelated while holding a lock; use a timeout in real code (`pdMS_TO_TICKS(50)`) and handle `pdFALSE`.
6. **Forgotten give, double take and spinning** (diagram: deadlock-with-yourself arrow, a task that takes twice; widget: code editor of the two task loops where the learner removes the give and sees the stuck tasks; question: what does a task do when it takes a non-recursive mutex it already holds?). Facts: the sim's deadlock report text; polling with a zero timeout burns CPU and breaks the lower-priority tasks' timing; `xSemaphoreTake` returns `pdTRUE`/`pdFALSE`.
7. **Alternatives to a lock** (diagram: three options: mutex, a single bus-owner task fed by a queue (stage 5 pattern), critical section `taskENTER_CRITICAL`; widget: pick a design and see CPU and latency; question: why can you not hold a spinlock critical section across a 5 ms I2C transfer?). Facts to verify: `taskENTER_CRITICAL` with a spinlock on ESP-IDF (`portMUX_TYPE`), disables interrupts on the calling core; that the ESP-IDF `i2c_master` driver has its own bus locking.

Facts that must be checked against ESP-IDF docs: mutex initial state and ownership, `xSemaphoreTake` return values, the claim that the new I2C master driver locks the bus internally and the legacy `i2c_cmd_link` driver is per-port mutex protected, what error codes a real collision gives (`ESP_ERR_TIMEOUT`, `ESP_ERR_INVALID_STATE`), `portMAX_DELAY` meaning, that mutex cannot be used from an ISR. Do not claim real transactions take 5 to 8 ms.

## 10. Open risks
- CPU bonus margin is thin: solution 96%, target 97%, the 98% "one task" design misses by one point. The tasks cost only 1 ms per read, so there is no larger gap with the existing `F` entries; if the verifier proves it fragile, change IMU to `un(25)` and re-measure (expect 95 to 96%) rather than loosening the objective. Not tried at 25 ms with the 45-read objective (it would need 36).
- `i2cRead*` collision detection counts only starts while the bus is busy, so a lock-free design with a lucky timing and no overlap would pass; none exists at these periods (a single task reading both in sequence is such a design and is declared an alt).
- Wrong answer `both spin` depends on the timeout-0 take restarting the task loop in the simulator; it fails only the telemetry gap (110 vs limit 105, 5 ms of margin). If the kernel's timeout semantics change this needs re-measuring.
- The measured thermometer read count (9 or 10) varies with the design; the limit of 8 has one read of margin.
- `imu priority 3` and `thermo priority 5` sit at the motor-gap limit (11 ms); do not add them as alts.
- Not verified here: the editor's display of `take`/`give` with the `i2c_lock` name and the 3D effects for the two new functions in the browser.
