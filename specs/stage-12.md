# Stage 12 spec: Pathfinder

All numbers were measured with `runSim` (scratch scripts `specs/tmp-12*.js`, deleted). Neither the stage 10 nor the stage 11 lesson file exists, so the base is rebuilt from the specs: stage 10 reference solution (`specs/stage-10.md` section 4) plus stage 11 reference solution (`specs/stage-11.md` section 4: `arm` and `focus`, both taking `arm_mtx` then `cam_mtx`). That base measures CPU 99, RAM 33632, photographs at 690 and 908, focus checks at 763 and 860, exactly as stage 11 reports. If the real stage 10 or 11 file differs in unit order, stacks, priorities or timing, **re-measure everything** (open risk 1).
L = `{ T: 1000, cores: 1, heap: 8192, pins: ['BEACON','HEART'], irqs: { onBump: [150, 152], onPacket: [100, 420, 500, 580] } }` (identical to stages 9 to 11).
Unit order: stage 11 units 0 to 22 (beacon 0, heart 1, motor 2, **camera 3**, telemetry 4, spectro 5, nav 6, mapper 7, science 8, radio 9, imu 10, thermo 11, onBump 12, bumper 13, onPacket 14, antenna 15, onStow 16, radio_link 17, time_sync 18, gps_fix 19, uplink 20, arm 21, focus 22), then **bus_mgr 23, weather 24**. (Look units up by name, not index, in the lesson file.)

## 1. Identity
- id: 12
- slug: `pathfinder`
- title: Pathfinder
- topic: Priority inversion and priority inheritance (a binary semaphore used as a lock has no owner and no inheritance; a mutex lifts its holder to the priority of the highest waiter; why a high-priority task can wait for unrelated work; keep critical sections short; never sleep while holding a lock)
- file: `main/rover_main.c`
- T: **1000**, cores: 1, `heap: 8192`, pins: `['BEACON', 'HEART']`
- irqs: `{ onBump: [150, 152], onPacket: [100, 420, 500, 580] }`
- ops: the stage 11 list, nothing new: `['gpio', 'call', 'delay', 'until', 'busy', 'send', 'recv', 'take', 'give', 'giveISR', 'sendISR', 'notifyGive', 'notifyGiveISR', 'notifyTake', 'tReset', 'tStop', 'evSet', 'evWait']`
- fns: stage 11 list plus the four bus functions: `['stopMotors', 'checkThermals', 'deployAntenna', 'stowAntenna', 'handlePacket', 'acquireLink', 'syncTime', 'acquireFix', 'sendUplink', 'positionArm', 'photograph', 'calibrateCamera', 'checkFocus', 'exchangeData', 'publishWeather', 'formatWeather', 'copyToBus']` (all already in `F`; `relayImages` exists but is NOT offered and not used, see risk 2)
- no `chartGrid`, no `power`, no `wdtTimeout`.

## 2. Story
The data-bus team bolted two tasks onto the rover, both sharing one lock called `bus_lock`: `bus_mgr` (priority 2) must exchange data with the instrument bus every 100 ms, and `weather` (priority 1) publishes a weather report on the same bus every 190 ms, holding the lock for the 9 ms the publish takes. `bus_lock` was created as a binary semaphore (`xSemaphoreCreateBinary()` and one `xSemaphoreGive()` to open it), because "a semaphore is a lock". Most cycles are fine, but when `bus_mgr` wakes while `weather` holds the lock, `weather`, the lowest-priority task in the rover, is starved by camera, spectrometer, navigation and the rest, so `bus_mgr` waits for them all: at 400 ms the exchange finishes 53 ms late (nominal 4 to 6 ms). A binary semaphore has no owner, so the kernel does not know whom to boost; a mutex has one and lifts `weather` to priority 2 while `bus_mgr` waits. This is the Mars Pathfinder bug of 1997.
**Fiction for the lowered load (important, see risk 1):** to make room for the new tasks, the camera team "moved the first frame to 240 ms after boot and one frame every 240 ms", which changes the `camera` task of the previous firmware (same unit name, new code). It is applied in both the start and the solution.

## 3. Kernel additions
**None** in `src/kernel.js`. Everything exists and must not change: `F.exchangeData` (cost 2, stack 500, needs `bus_lock`, fx `chip`), `F.publishWeather` (cost 9, stack 700, needs `bus_lock`, fx `mast`), `F.formatWeather` (cost 7, stack 700, no lock), `F.copyToBus` (cost 2, stack 300, needs `bus_lock`, fx `chip`). Facts the builders must respect (all measured):
- `needs` is satisfied by `q.owner || q.holder`, so it works for both a mutex (owner) and a binary semaphore (holder, set by the take). A call without the lock logs "exchangeData() ran without holding bus_lock" (a fault, `K.stats.viol`).
- Mutex inheritance exists in the kernel (`block()` raises the owner's priority to the waiter's; `give` restores `base`). Binary semaphores have no inheritance.
- Binary object: `{ type: 'binary', init: 1, types: ['binary', 'mutex'] }`. `init: 1` makes it start open (kernel reads `o.init`). `types` makes the editor show a select (the stage 8 pattern); changing it to `mutex` is the whole fix. RAM is 96 B either way.
- **Editor display tweak (not kernel):** `src/editor.js` line 69-70 prints a binary as `xSemaphoreCreateBinary()`. For a binary with `init`, print `xSemaphoreCreateBinary(); xSemaphoreGive(bus_lock);` (a real binary semaphore is created empty, so without the give nobody could ever take it). A mutex line stays `xSemaphoreCreateMutex()`.
- Timeout caveat as in stage 11: a timed-out `tk(m, ms)` restarts the task from its first line; use it only as a wrong answer.
- Game-time note for the theory: 1 ms ticks; a real exchange takes far less than 2 ms and a real publish is not 9 ms of CPU, scaled for the 1 s test. Real ESP-IDF defaults to 100 Hz ticks.

## 4. Programs
Start (`start(prev)`, `prev` = stage 11 solution):
```js
const p = clone(prev || stage11.solution());
const cam = p.units.find(u => u.name === 'camera');
cam.code = [d(240), c('compressFrame'), d(240)];                 // was [c('compressFrame'), d(120)]
p.objs.bus_lock = { type: 'binary', init: 1, types: ['binary', 'mutex'] };
p.units.push(task('bus_mgr', 2, [un(100), tk('bus_lock'), c('exchangeData'), gv('bus_lock')], { stack: 1344 }));   // unit 23
p.units.push(task('weather', 1, [un(190), tk('bus_lock'), c('publishWeather'), gv('bus_lock')], { stack: 1536 })); // unit 24
return p;
```
Stack need: `bus_mgr` 768 + 500 = 1268 (1344 leaves 76 B), `weather` 768 + 700 = 1468 (1536 leaves 68 B). RAM 36608 = stage 11 33632 + 1344 + 1536 + 96.
`un(100)` is `vTaskDelayUntil`: slots at 100, 200, ..., 900 (9 exchanges in 1 s); `weather` publishes at about 190, 380, 570, 760, 950 (5 reports). Exchange slots are the nominal times `100 * (i + 1)`.
Reference solution:
```js
const p = stage11.solution();
/* same camera change, same bus_mgr and weather tasks as the start */
p.objs.bus_lock = { type: 'mutex' };
```
ESP-IDF form: `bus_lock = xSemaphoreCreateMutex();` (instead of `xSemaphoreCreateBinary(); xSemaphoreGive(bus_lock);`); tasks unchanged: `xSemaphoreTake(bus_lock, portMAX_DELAY); ...; xSemaphoreGive(bus_lock);`. Player edit: one select in the editor. Reachability: the object is in `start()` with `types` offering `mutex`; nothing is added.
Measured: in the start `weather` takes the lock at 382, runs only in small slices (382, 387, 393, 397, 403, then 425 to 449, preempted by motor, telemetry, spectro, camera, nav and friends) and finishes publishing at 445 (its report ends at 445); `bus_mgr` wakes at 400, gets the lock only at 449 and its exchange ends at 453: 53 ms late. In the solution `weather` is lifted to priority 2 at 400, finishes at about 411 and the exchange ends at 413 (13 ms late). The inherited priority 2 is above all prio-1 tasks but equal to telemetry, imu, thermo, science, so it still shares CPU with those.

## 5. Objectives (goals, in order) and checks
Helpers: `ex = E_(K,'exchangeData')`, `lat = ex.map((t, i) => t - 100 * (i + 1))`, `pw = [...E_(K,'publishWeather'), ...E_(K,'copyToBus')]` (so a shorter critical section counts as a report), `ph = E_(K,'photograph')`, `cf = E_(K,'checkFocus')`, `stuck = K.units.filter(u => ['arm','focus'].includes(u.name) && u.state === 'wait')`, `up`, `dn`, `okU`, `rej`, `rounds`, `upLat` as in stage 11 section 5, and `r9 = stage9.check(K)`.

| # | Goal text | Check | Start | Solution |
|---|---|---|---|---|
| 0 | `Bus: all 9 exchanges finish within 30 ms of their 100 ms slot (no stall behind another task)` | `ex.length === 9 && lat.every(x => x >= 0 && x <= 30)`, text `${ex.length} exchanges, delays ${lat.join(', ')} ms` | delays 5, 26, 4, 53, 6, 8, 4, 6, 5 -> NO | 5, 9, 4, 13, 5, 4, 4, 5, 5 ok |
| 1 | `Weather: at least 4 reports published in 1 s` | `pw.length >= 4`, text `${pw.length} weather reports` | 5 ok | 5 ok |
| 2 | `Locks: no bus, arm or camera call runs without the lock it needs` | `K.stats.viol === 0`, text `${K.stats.viol} unprotected calls` | 0 ok | 0 ok |
| 3 | `Still working from stage 11: both photographs and both focus checks done, arm and camera tasks not stuck on a lock` | `ph.length >= 2 && cf.length >= 2 && !K.diag.some(s => /^(arm\|focus) /.test(s)) && stuck.length === 0`, text `${ph.length} photographs, ${cf.length} focus checks, ${stuck.length} task(s) stuck` | 2, 2, 0 ok | 2, 2, 0 ok |
| 4 | `Still working from stage 10: the ground station rejects no packet, exactly one per window within 60 ms of the last bring-up (2 packets)` | `rej === 0 && okU.length === 2 && up.length === 2 && upLat.every(x => x >= 0 && x <= 60)`, text as stage 11 objective 4 | 692, 869, delays 27, 22 ok | 692, 869, delays 27, 22 ok |
| 5 | `Still working from stage 9: every packet handled within 60 ms, mast stowed once per pass 180 to 250 ms after the last packet, unfolded twice` | `r9[0][0] && r9[1][0] && r9[2][0]`, texts joined with ` / ` | delays 26, 16, 33, 13; stows 219, 203; 2 ok | 26, 18, 33, 13; 224, 203; 2 ok |
| 6 | `Still working from stages 7 and 8: no ISR longer than 1 ms, motors stopped within 3 ms of both impacts, a thermal check for each within 150 ms` | `r9[3][0]` | 0 ms, 0, 0, 19, 36 ok | 0, 0, 0, 19, 36 ok |
| 7 | `Still working from stage 6: no I2C collisions, IMU at least 45 reads, never more than 40 ms apart` | `r9[4][0]` | 0, 50, 30 ok | 0, 50, 30 ok |
| 8 | `Still working from stage 5: all 10 samples transmitted, in order, none overwritten` | `r9[5][0]` | 10 ok | 10 ok |
| 9 | `Still working from stages 3 and 4: mapper frees its frames (at least 3 frames, 2 paths), spectrometer 47 to 53 samples started in 1 s` | `r9[6][0] && r9[7][0]` | 4 frames, 3 paths, 8192 B, 50 samples ok | same ok |
| 10 | `Still working from stages 1 and 2: motor never more than 11 ms between steps, telemetry never more than 105 ms between packets, at least 9 sent; BEACON every 500 ms and HEART every 200 ms (within 3 ms)` | `r9[8][0] && r9[9][0]` | 10, 104, 10; 2/5 toggles ok | 10, 104 (103 in one run), 10; ok |

The start fails exactly objective 0 (one cause: no priority inheritance). Margins: the solution's worst exchange is 13 ms vs 30 (17 ms of room); the start's worst is 53 (23 ms over); telemetry gap 104 vs 105 and motor gap 10 vs 11 are the older stage 2 margins and are the thin spot (risk 3). Do not shorten or lengthen `T`.
Note on the camera rule: objectives 0 to 10 do not check the camera, so its slower rate is not a regression objective.

## 6. Bonus
`B(96, 36656)`.
- Solution: CPU **95%**, RAM **36608 B** (3 stars). Start: CPU 95%, RAM 36608.
- Lean limit sits 48 B above the solution. RAM variants (all pass every objective): stacks 1268 / 1468 = 36464 passes Lean; both stacks 2048 = 37824 and both 4096 = 41920 pass the objectives but miss Lean (2 stars).
- CPU: every correct design measures 95 (limit 96); the CPU star does not discriminate (as in stages 8 to 11), only Lean does.

## 6b. Chart
- Start: AUTO zoom **4x**, densest row `spectro` 50.4 state changes per 100 px, **250 ms visible at once**. Solution: 4x, 50.2, 250 ms.
- The failure fits in one window: slot 400 to 453 (53 ms) on the `bus_mgr` row, shown as a stretch of "blocked" while the `weather` row shows only thin slices of running between camera, spectro, nav and telemetry. The learner can also scroll to the second late exchange at slot 200 (26 ms, within the limit).
- No `chartGrid`, no `powerMarks`.
- `evidence(K)` (checked on the start, the solution and every wrong answer):
```js
evidence: K => {
  if (K.crash) return [];
  const bm = K.units.find(u => u.name === 'bus_mgr');
  if (bm.state === 'wait' && bm.obj && bm.obj.name === 'bus_lock') {          // never released
    let t = K.end - 1; while (t > 0 && bm.tr[t] === 3) t--;
    const o = bm.obj, holder = o.owner ? o.owner.name : o.holder ? o.holder.name : 'nobody';
    return [{ unit: 'bus_mgr', from: t + 1, to: K.end - 1, label: `bus_mgr has waited ${K.end - 1 - t} ms for bus_lock, held by ${holder}` }];
  }
  const ex = E_(K, 'exchangeData'); let w = -1, lat = 30;
  ex.forEach((t, i) => { const l = t - 100 * (i + 1); if (l > lat) { lat = l; w = i; } });
  if (w >= 0) return [{ unit: 'bus_mgr', from: 100 * (w + 1), to: ex[w], label: `bus exchange ${lat} ms late: bus_mgr waited for bus_lock` }];
  const v = K.ev.find(e => e.k === 'log' && /ran without holding/.test(e.text));
  if (v) return [{ unit: v.text.startsWith('exchangeData') ? 'bus_mgr' : 'weather', from: v.t, to: Math.min(v.t + 12, K.end - 1), label: v.text }];
  const ms = S_(K, 'motorStep'); let mg = 11, mi = -1;
  for (let i = 1; i < ms.length; i++) if (ms[i] - ms[i - 1] > mg) { mg = ms[i] - ms[i - 1]; mi = i; }
  if (mi >= 0) return [{ unit: 'motor', from: ms[mi - 1], to: ms[mi], label: `${mg} ms between motor steps` }];
  const pw = E_(K, 'publishWeather').length + E_(K, 'copyToBus').length;
  if (pw < 4) return [{ unit: 'weather', from: 0, to: K.end - 1, label: `only ${pw} weather reports published` }];
  return [];
}
```
Measured: start -> `bus_mgr` 400 to 453 "bus exchange 53 ms late: bus_mgr waited for bus_lock"; weather never gives -> `bus_mgr` 203 to 999 "bus_mgr has waited 797 ms for bus_lock, held by weather"; sleeps holding the lock -> `bus_mgr` 400 to 476 (76 ms late); no locks -> `bus_mgr` 102 to 114 "exchangeData() ran without holding bus_lock"; weather priority 5 -> `motor` 180 to 199 "19 ms between motor steps"; bus_mgr priority 5 -> `motor` 394 to 407 (13 ms); weather never publishes -> `weather` 0 to 999; solution, alts and crashes -> `[]`.

## 7. Wrong answers
Mutations of the solution (`bm` = unit `bus_mgr`, `w` = unit `weather`, found by name). Objective indexes as in section 5. All measured, T = 1000.

| Name | Mutation | Fails | Measured | `says` |
|---|---|---|---|---|
| binary semaphore left as it is (the start) | none | 0 | delays 5, 26, 4, 53, ... | `inversion` |
| bus_mgr raised to 3, still binary | start with `bm.prio = 3` | 0 | delays 3, 27, 2, 51, 2, 4, 2, 22, 2 | `inversion` |
| mutex but bus_mgr no higher than weather | solution with `bm.prio = 1` | 0 | delays 24, 28, 24, 57, 27, 25, 20, 26, 26 (every exchange waits for the prio-1 crowd) | `bmTooLow` |
| fix by a huge priority on weather | start with `w.prio = 5` | 10 | motor gap 19 ms (stage 2 objective), exchanges fine | `hog` |
| fix by a huge priority on bus_mgr | solution with `bm.prio = 5` | 10 | motor gap 13 ms | `hog` |
| no locking at all | remove every `tk`/`gv` of `bus_lock` from both tasks | 2 | 14 unprotected calls, first "exchangeData() ran without holding bus_lock" at 102 | `noLock` |
| weather never gives the lock | remove the `gv` from `weather` (mutex or binary) | 0, 1 | 1 exchange, 1 weather report; bus_mgr waits for bus_lock, held by weather, from 203 | `forgotGive` |
| weather sleeps holding the lock | solution with `w.code = [un(190), tk('bus_lock'), c('publishWeather'), d(60), gv('bus_lock')]` | 0 | delays 5, 68, 4, 76, 5, 64, 4, 65, 5 (inheritance cannot help: the holder is asleep, not starved) | `sleepsHolding` |
| weather publishes nothing | `w.code = [un(190)]` | 1 | 0 reports | `starved` |
| bus_mgr gives twice | solution with `gv('bus_lock')` appended to `bm.code` | crash | "assert failed: bus_mgr gave bus_lock but does not hold it." at 106 ms | crash: `giveNotHeld` |
| weather spins before locking | solution with `w.code = [bz(700), ...]` | crash | `task_wdt` at 599 ms | crash: `busyLoop` |
| weather stack 1024 | `w.stack = 1024` | crash | stack overflow in task weather at 192 ms | crash: `stack` |
| bus_mgr stack 1024 | `bm.stack = 1024` | crash | stack overflow in task bus_mgr at 102 ms | crash: `stack` |

Accepted correct designs for `alts` (all pass every objective, measured):
| Name | Mutation | Stars | Measured |
|---|---|---|---|
| fix it by hand: weather at priority 2 | start (binary) with `w.prio = 2` | 3 | all ok; CPU 95, RAM 36608 |
| short critical section | start (binary) with `w.code = [un(190), c('formatWeather'), tk('bus_lock'), c('copyToBus'), gv('bus_lock')]` | 3 | all ok |
| short critical section and mutex | same code, `bus_lock` a mutex | 3 | all ok |
| mutex and weather at priority 2 | solution with `w.prio = 2` | 3 | all ok |
| tight stacks | solution with `bm.stack = 1268`, `w.stack = 1468` | 3 | RAM 36464 |
| both stacks 2048 | solution with `bm.stack = 2048`, `w.stack = 2048` | 2 | RAM 37824 |
| both stacks 4096 | solution with `bm.stack = 4096`, `w.stack = 4096` | 2 | RAM 41920 |

(The accepted "raise weather to 2" and "short section" alts are real designs but fragile with the saturated rover; the verifier proves them as measured here. Weather at 3 fails objective 10: motor gap 12.)

## 8. Reactions (keys and `diagnose` logic)
Keys: `inversion`, `bmTooLow`, `sleepsHolding`, `forgotGive`, `starved`, `noLock`, `hog`, `giveNotHeld`, `stack`, `busyLoop`, `regress`, `fail`. Code (tested against every row of section 7):
```js
diagnose: (K, res) => {
  if (K.crash && /gave .* but does not hold/.test(K.crash.msg)) return reactions.giveNotHeld;
  if (K.crash && /stack overflow/.test(K.crash.msg)) return reactions.stack;
  if (K.crash && /task_wdt/.test(K.crash.msg)) return reactions.busyLoop;
  const bm = K.units.find(u => u.name === 'bus_mgr'), w = K.units.find(u => u.name === 'weather'), lock = K.objs.bus_lock;
  if (!res[2][0]) return reactions.noLock;
  if (!res[0][0] || !res[1][0]) {
    if (bm.state === 'wait' && bm.obj === lock && bm.dl === Infinity && w.state !== 'ready' && w.state !== 'idle' && (w.held.includes(lock) || lock.holder === w)) return reactions.forgotGive;
    const ops = w.code.map(i => i.op), a = ops.indexOf('take'), b = ops.lastIndexOf('give');
    if (a >= 0 && b > a && ops.slice(a, b).some(o => o === 'delay' || o === 'until')) return reactions.sleepsHolding;
    if (!res[0][0]) return lock.type !== 'mutex' ? reactions.inversion : bm.prio <= w.prio ? reactions.bmTooLow : reactions.fail;
    return reactions.starved;
  }
  if (!res[10][0] || !res[7][0]) return reactions.hog;
  if (!res[3][0]) return reactions.regress;
  return reactions.fail;
}
```
Meaning: `inversion` (the lock has no owner: the holder cannot be boosted; steer to the lock type or to the holder's priority, name who waits for whom, do not blame the stack), `bmTooLow` (a mutex lifts the holder only to the waiter's priority: if the waiter is no higher than the crowd, nothing improves), `sleepsHolding` (a holder that sleeps is not starved, it chose to wait; inheritance cannot help), `forgotGive`, `starved` (weather never ran), `noLock`, `hog` (a high priority holds off the motor and I2C work: the cure must be local), `giveNotHeld`, `stack`, `busyLoop` (a spinning task starves idle, task watchdog), `regress`, `fail`.

## 9. Theory outline (6 sections, one check question each)
1. **The bug that reset a rover** (Mars Pathfinder, 1997): SVG timeline of three tasks (high, medium, low) and a lock, the low one holding it while the medium one runs and the high one waits. Widget: slider "medium task length" with the high task's wait growing to match (and a watchdog-reset marker). Check: "Which task is actually delaying the high-priority task?" (the medium one, indirectly). VERIFY the 1997 facts (VxWorks, information-bus task, a meteorological data task, watchdog resets, fixed by enabling inheritance on the mutex) before writing them.
2. **Priority inversion on the rover**: SVG of the stage 12 chart: `bus_mgr` blocked, `weather` starved, camera/spectro/nav running. Widget: the three-row rover timeline with a "give weather a lock" button and the lock type switch. Check: "Why does the stall happen only on some cycles?" (only when the exchange slot falls inside the 9 ms the lock is held).
3. **Binary semaphore or mutex**: SVG comparing a signal (no owner) with a lock (owner, inheritance). Widget: toggle semaphore/mutex and watch the owner's priority change while a higher task waits. Check: "Which of the two knows who to boost?" (the mutex). Facts: `xSemaphoreCreateMutex()` vs `xSemaphoreCreateBinary()` (created empty), inheritance is a mutex feature, not for binary or counting semaphores (stage 6 forward pointer fulfilled).
4. **Priority inheritance step by step**: SVG with the owner's priority rising when a higher task blocks and falling when the lock is given. Widget: step buttons for take, block, boost, give, restore. Check: "At what priority does weather run once bus_mgr blocks?" (2). Facts to verify: ESP-IDF FreeRTOS inherits to the highest waiter, restores on give, and handles several waiters; "disinheritance" with nested mutexes.
5. **Other cures and their costs**: SVG table: mutex with inheritance, short critical section (copy out, publish outside the lock), priority ceiling by hand (weather at 2), disabling interrupts / critical sections. Widget: choose a cure, see exchange delay and motor gap (the `hog` trap: raising priority far above the crowd delays the motor). Check: "Why not simply give weather priority 5?" (it delays motor and I2C work). Also: never sleep while holding a lock (the `sleepsHolding` case) and inheritance does not prevent deadlock (stage 11).
6. **Finding it in the field**: SVG of a chart with the late exchange bracket. Widget: "who holds what" table filled from the log and the chart. Real world: `vTaskList` states, `esp_task_wdt_add`, logging lock wait times with `xSemaphoreTake(.., pdMS_TO_TICKS(..))` plus `ESP_LOGW`, SystemView or `esp_timer` traces; priority inversion also exists across cores (stage 13 pointer). Check: "What does the chart show for the stalled exchange?" (bus_mgr blocked while lower-priority tasks run).

Facts to verify against ESP-IDF / FreeRTOS documentation (mark `VERIFY:` in the draft):
- `xSemaphoreCreateBinary()` creates an empty semaphore (a take blocks until a give); `xSemaphoreCreateMutex()` is created available; only mutexes have priority inheritance.
- Inheritance raises the holder to the priority of the highest-priority waiting task and restores it when the last mutex is returned (and the exact behaviour with several held mutexes).
- ESP-IDF idle task and priority 0, tick rate default 100 Hz vs the game's 1 kHz, `configMAX_PRIORITIES` (25 on ESP-IDF).
- A mutex cannot be given from an ISR; giving a mutex you do not hold: real FreeRTOS behaviour vs the simulator's assert.
- The Pathfinder timeline: VxWorks, `select()` on a mutex-protected pipe, bus management task, meteorological task, communications task at medium priority, the watchdog, the "priority inheritance" flag fixed via a patch (JPL account by Glenn Reeves).

## 10. Open risks
1. **Stage 10 and 11 are not built, and the camera task is modified.** The rover was saturated (stage 11 had only 7 idle ticks and a 439 ms streak without idle); any extra work before 840 ms crashed the run with `task_wdt` at 599 ms (measured with the bus tasks alone). The only free CPU was the camera, so the start and the solution change `camera` to `[d(240), compressFrame, d(240)]` (first frame at 240 ms instead of 0, then every 300 ms). The longest idle-free stretch is 419 to 437 ms (limit 600) for the start, the solution and the alts. If an earlier builder changes any stack, priority or delay, or does not apply the same camera rule in stage 13, re-measure all of section 5. The verifier checks only names of prev units, so changing `camera`'s code is allowed, but the text of stage 13 should know about it.
2. **No `relay` task (the textbook "medium" task).** Adding `relayImages` (30 ms) at priority 2 crashed every variant with the watchdog (measured), so the medium priority here is the whole prio-1 crowd plus prio-2 peers rather than one named task; the theory's three-task picture is an idealisation, say so.
3. **Chaotic timing.** Changing `weather`'s period (190) or `bus_mgr`'s priority (2) flips outcomes: periods 150, 170, 200 to 225 produce no stall at all (start passes), 145, 165, 195, 240 fail the motor or telemetry regressions in the solution; bus_mgr at 3 makes the mutex solution fail the motor gap (12 ms). The values given were picked from a grid of periods 130 to 260 in steps of 5. Do not retune. Telemetry gap 104/103 vs 105 and motor gap 10 vs 11 are thin.
4. **One stall in the start passes silently**: the slot at 200 shows 26 ms, below the 30 ms limit, so only the slot at 400 (53 ms) fails; objective 0 will read as one bad exchange, which is what the evidence bracket points to.
5. **Editor display tweak** for binary-with-init (section 3) is required for honesty; without it the player would see a binary that nobody gives.
6. **Priority 2 for `bus_mgr`** is not "the highest" priority of the rover (motor is 3, beacon and heart 4): the story calls it the highest of the new subsystem and the lesson explains that inheritance only lifts the holder to the waiter's level.
7. **CPU star does not discriminate**; only Lean does.
8. **Accepted alts are timing-dependent** ("weather at priority 2", "short critical section" on a binary): they pass on this exact timing and may fail if the base changes.
