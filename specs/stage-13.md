# Stage 13 spec: Two Brains

All numbers were measured with `runSim` (scratch scripts `specs/tmp-13*.js` and `specs/base13.js`, deleted). The stage 12 lesson file does not exist yet, so the base is rebuilt from `specs/stage-12.md` section 4: the stage 11 solution (`src/lessons/deadly-embrace.js`, exists) plus the stage 12 camera rule `camera.code = [d(240), c('compressFrame'), d(240)]`, `objs.bus_lock = { type: 'mutex' }`, task `bus_mgr` (prio 2, `[un(100), tk('bus_lock'), c('exchangeData'), gv('bus_lock')]`, stack 1344) and task `weather` (prio 1, `[un(190), tk('bus_lock'), c('publishWeather'), gv('bus_lock')]`, stack 1536). That base measures, on **two cores with every task on core 1**: CPU 47% overall (core 0: 0%, core 1: 95%), RAM 36608, exchanges at 105, 209, 304, 413, 505, 604, 704, 805, 905, and every older objective passes exactly as in stage 12. If the real stage 12 file differs (unit order, stacks, priorities, camera rule), **re-measure everything** (open risk 1).
L = `{ T: 1000, cores: 2, heap: 8192, pins: ['BEACON','HEART'], irqs: { onBump: [150, 152], onPacket: [100, 420, 500, 580] } }` (stage 9 to 12 values, except `cores: 2`).
Unit order: stage 12 units 0 to 24 unchanged (beacon 0, heart 1, motor 2, camera 3, telemetry 4, spectro 5, nav 6, mapper 7, science 8, radio 9, imu 10, thermo 11, onBump 12, bumper 13, onPacket 14, antenna 15, onStow 16, radio_link 17, time_sync 18, gps_fix 19, uplink 20, arm 21, focus 22, bus_mgr 23, weather 24), then **vision 25, fusion 26**. Look units up by name in the lesson file. Every earlier task keeps the `core: 1` that `task()` gives by default (so "everything is pinned to core 1" is literally true); ISRs run on core 0 and the timer service floats (kernel rule: `core = isr ? 0 : task ? u.core : -1`).

## 1. Identity
- id: 13
- slug: `two-brains`
- title: Two Brains
- topic: Dual-core scheduling, pinning and critical sections (one scheduler and one idle task per core; `xTaskCreate` = no affinity vs `xTaskCreatePinnedToCore`; why a full core resets the chip; tasks really run in parallel across cores and time-slice on one core; shared data needs a lock; a short critical section; a delay is not a lock; priorities are not locks)
- file: `main/rover_main.c`
- T: **1000**, **cores: 2**, `heap: 8192`, pins: `['BEACON', 'HEART']`
- irqs: `{ onBump: [150, 152], onPacket: [100, 420, 500, 580] }`
- ops: the stage 12 list, nothing new: `['gpio', 'call', 'delay', 'until', 'busy', 'send', 'recv', 'take', 'give', 'giveISR', 'sendISR', 'notifyGive', 'notifyGiveISR', 'notifyTake', 'tReset', 'tStop', 'evSet', 'evWait']`
- fns: the stage 12 list plus the two new ones, and the two vision functions that already existed: `[..., 'exchangeData', 'publishWeather', 'formatWeather', 'copyToBus', 'visionStep', 'publishHazard', 'readHazard', 'fusionStep']`
- no `power`, no `wdtTimeout`. `chartGrid: { unit: 'vision', period: 50 }`.
- The editor already prints `xTaskCreatePinnedToCore(..., core)` with a select (0, 1, tskNO_AFFINITY) when `cores === 2`; the player's fix is on those lines plus take/give lines.

## 2. Story
The vision team added the hazard-avoidance pipeline: `vision` (priority 2) analyses a camera frame every 50 ms (`visionStep`, 10 ms of CPU) and publishes the result into a shared hazard record (`publishHazard`, 4 ms: distance, bearing and frame number), and `fusion` (priority 2) waits 8 ms into the cycle ("the frame will be ready by then"), reads the record (`readHazard`, 3 ms) and merges it with the rest of the sensors (`fusionStep`, 5 ms). They copied the template of every other task and pinned both tasks to core 1, where the whole rover already runs at 95%: the 14 ms of work every 50 ms cannot fit, the idle task of core 1 never runs, and at 599 ms the task watchdog resets the chip ("IDLE1 (CPU 1)"), while core 0, which the datasheet sells as the second brain, sits empty with 0% load. Move the two tasks to core 0 and the rover runs, but now the two tasks really overlap: fusion starts reading at 59 ms, vision starts publishing at 62 ms, and on every one of the 19 cycles the hazard record is read while it is being written ("distance from frame N, bearing from frame N-1"). A `hz_lock` mutex was created "for later" and nobody takes it.

## 3. Kernel additions
Two entries added to `F` in `src/kernel.js` **by the designer, already in the file** (one Edit each, after `wifiStack`). Builders must not add or change them:
```js
 publishHazard:{cost:4,stack:400,fx:'cam',sig:'publish_hazard()',start:K=>{const h=K.w.hz=K.w.hz||{w:0,r:0,torn:0};if(h.r>0){h.torn++;K.bad('publish_hazard() wrote the hazard record while read_hazard() was reading it: distance and bearing come from different frames');}h.w++;},end:K=>{K.w.hz.w--;}},
 readHazard:{cost:3,stack:300,fx:'mast',sig:'read_hazard()',start:K=>{const h=K.w.hz=K.w.hz||{w:0,r:0,torn:0};if(h.w>0){h.torn++;K.bad('read_hazard() read the hazard record while it was being written: distance from frame N, bearing from frame N-1');}h.r++;},end:K=>{K.w.hz.r--;}},
```
Meaning: a call "occupies" the record from its start to its end (cost ms of CPU, slices included). If a read starts while a write is in progress, or a write starts while a read is in progress, `K.w.hz.torn` is incremented and `K.bad(...)` logs a fault (so `K.stats.viol` also counts them; the first 12 are written to the serial monitor, each with a red `!` mark). Neither function has `needs`: the game does not check whether the lock is held, it checks whether the two calls overlap in time, so a different design that never overlaps them is also correct. Existing, unchanged: `visionStep` (10 ms CPU, stack 2000, fx cam), `fusionStep` (5 ms, stack 800, fx mast). Stack need: `vision` 768 + 2000 = 2768; `fusion` 768 + 800 = 1568.
Other kernel facts the builders must respect (all measured):
- `cores: 2` is used by no earlier lesson. `runSim` supports it (per core idle task, `K.coreTr[core]`, `K.m.core[i]`, task watchdog per core with the message naming `IDLE0 (CPU 0)` or `IDLE1 (CPU 1)`). `K.m.cpu` is the **average of both cores** (68 for the solution), `K.m.core` is `[42, 95]`.
- Equal-priority ready tasks on one core alternate every 1 ms (round robin). That is what makes the unprotected race deterministic: both tasks run in alternating milliseconds.
- A task with `core: -1` (tskNO_AFFINITY) is picked by core 0 first, but runs on core 1 whenever core 0 already has something to run. That is how a floating `vision` ends up on the full core (wrong answer "vision on any core", crash at 857 ms).
- Mutex rules as in stage 12 (inheritance exists, give by a non-owner crashes with "assert failed: <task> gave hz_lock but does not hold it.").
- A timed-out `tk(m, ms)` restarts the task from its first line (simulator limitation, as in stages 11 and 12): do not use timeouts in any correct program.
- **Needed outside the kernel (builder work, not mine):** (a) the CPU gauge in `src/main.js` (`setClock`) reads `K.coreTr[0]` only and would show 0% to 40% for this stage; it must show the busiest core (or one bar per core). (b) The 3D world needs no change (`fx` values are existing ones). (c) `src/editor.js` needs no change.
- Game-time note for the theory: a real 16-byte record copy takes microseconds, not 4 ms; the stage scales it up so that two cores and a time slice can collide inside a 1 s test. Say so, and say that for a copy this short ESP-IDF code uses a spinlock critical section (`portENTER_CRITICAL(&mux)`), which the game does not model (open risk 3). Ticks are 1 ms as everywhere (real default 100 Hz).

## 4. Programs
Start (`start(prev)`, `prev` = stage 12 solution; new object and tasks after unit 24):
```js
const p = clone(prev || stage12.solution());
p.objs.hz_lock = { type: 'mutex' };                                                                      // created, never taken
p.units.push(task('vision', 2, [un(50), c('visionStep'), c('publishHazard')], { stack: 2816, core: 1 }));          // unit 25
p.units.push(task('fusion', 2, [un(50), d(8), c('readHazard'), c('fusionStep')], { stack: 1600, core: 1 }));      // unit 26
return p;
```
Stack: `vision` 2816 (need 2768, leaves 48 B), `fusion` 1600 (need 1568, leaves 32 B). RAM 41120 = stage 12 36608 + 2816 + 1600 + 96 (`hz_lock`).
Reference solution:
```js
const p = stage12.solution();
p.objs.hz_lock = { type: 'mutex' };
p.units.push(task('vision', 2, [un(50), c('visionStep'), tk('hz_lock'), c('publishHazard'), gv('hz_lock')], { stack: 2816, core: 0 }));
p.units.push(task('fusion', 2, [un(50), d(8), tk('hz_lock'), c('readHazard'), gv('hz_lock'), c('fusionStep')], { stack: 1600, core: 0 }));
return p;
```
ESP-IDF form: `xTaskCreatePinnedToCore(vision, "vision", 2816, NULL, 2, NULL, 0)` and the same for `fusion` (core argument 0 instead of 1); inside the tasks `xSemaphoreTake(hz_lock, portMAX_DELAY); publish_hazard(); xSemaphoreGive(hz_lock);` and `xSemaphoreTake(...); read_hazard(); xSemaphoreGive(...); fusion_step();` (process outside the lock). Player edits: two `core` selects (1 to 0) and four lines (two takes, two gives) in two tasks. Reachability: `hz_lock` is in `start()` as a mutex and `types` is not needed; nothing is added. The two-step discovery is intended: the first flash resets the chip (move the tasks), the second shows 19 torn reads (add the lock).
Measured timeline (ms) in the solution: cycle at slot 100: `vision` runs `visionStep` from 100, ends about 111; `fusion` wakes at 108/109 and reads from 109 to 113 (the lock is free); `vision` takes the lock at about 112 after the read gives it, publishes 113 to 120; `fusion` runs `fusionStep` to 122. Without the lock: read 59 to 64, publish starts at 62 (first cycle), overlap every cycle.

## 5. Objectives (goals, in order) and checks
Helpers (inside `check`): `pub = E_(K,'publishHazard')`, `pl = pub.map((t, i) => t - 50 * (i + 1))`, `rd = E_(K,'readHazard')`, `rl = rd.map((t, i) => t - 50 * (i + 1))`, `fu = E_(K,'fusionStep')`, `torn = (K.w.hz || {}).torn || 0`, `stuckHz = K.units.filter(u => ['vision','fusion'].includes(u.name) && u.state === 'wait' && u.obj && u.obj.name === 'hz_lock')`, `ex = E_(K,'exchangeData')`, `el = ex.map((t, i) => t - 100 * (i + 1))`, `pw = [...E_(K,'publishWeather'), ...E_(K,'copyToBus')]`, `ph = E_(K,'photograph')`, `cf = E_(K,'checkFocus')`, `stuck = K.units.filter(u => ['arm','focus'].includes(u.name) && u.state === 'wait')`, `up`, `dn`, `okU`, `rej`, `rounds`, `upLat` as in stage 11 section 5, `r9 = stage9.check(K)`, `mx = a => a.length ? Math.max(...a) : -1`.

| # | Goal text | Check | Start | Solution |
|---|---|---|---|---|
| 0 | `Vision: at least 18 hazard frames published in 1 s, each within 25 ms of its 50 ms slot` | `pub.length >= 18 && pl.every(x => x >= 0 && x <= 25)`, text `${pub.length} hazard frames published, worst delay ${mx(pl)} ms` | crash at 599 ms (11 frames before it) | 19 frames, worst 20 ms ok |
| 1 | `Fusion: at least 18 hazard reads, each done within 15 ms of its 50 ms slot` | `rd.length >= 18 && fu.length >= 18 && rl.every(x => x >= 0 && x <= 15)`, text `${rd.length} hazard reads, ${fu.length} fusion steps, worst read delay ${mx(rl)} ms` | crash | 19 reads, 19 steps, worst 13 ms ok |
| 2 | `Hazard record: never read while it is being written, and no task waits for ever for hz_lock` | `torn === 0 && stuckHz.length === 0`, text `${torn} torn reads, ${stuckHz.length} task(s) stuck on hz_lock` | crash (pinned to core 0 without a lock: 19 torn reads) | 0, 0 ok |
| 3 | `Still working from stage 12: all 9 bus exchanges within 30 ms of their 100 ms slot, at least 4 weather reports, no bus, arm or camera call without its lock` | `ex.length === 9 && el.every(x => x >= 0 && x <= 30) && pw.length >= 4 && K.stats.viol - torn === 0`, text `${ex.length} exchanges, delays ${el.join(', ')} ms, ${pw.length} weather reports, ${K.stats.viol - torn} unprotected calls` | crash | delays 5, 9, 4, 13, 5, 4, 4, 5, 5; 5 reports; 0 ok |
| 4 | `Still working from stage 11: both photographs and both focus checks done, arm and focus not stuck on a lock` | `ph.length >= 2 && cf.length >= 2 && !K.diag.some(s => /^(arm\|focus) /.test(s)) && stuck.length === 0`, text `${ph.length} photographs, ${cf.length} focus checks, ${stuck.length} task(s) stuck` | crash | 2, 2, 0 ok |
| 5 | `Still working from stage 10: the ground station rejects no packet, exactly one per window within 60 ms of the last bring-up (2 packets)` | `rej === 0 && okU.length === 2 && up.length === 2 && upLat.every(x => x >= 0 && x <= 60)`, text as stage 11 objective 4 | crash | accepted at 692, 869, delays 27, 22 ok |
| 6 | `Still working from stage 9: every packet handled within 60 ms, mast stowed once per pass 180 to 250 ms after the last packet, unfolded twice` | `r9[0][0] && r9[1][0] && r9[2][0]`, texts joined with ` / ` | crash | delays 26, 18, 33, 13; stows 222, 203; 2 unfolds ok |
| 7 | `Still working from stages 7 and 8: no ISR longer than 1 ms, motors stopped within 3 ms of both impacts, a thermal check for each within 150 ms` | `r9[3]` | crash | 0 ms, 0, 0, 19, 36 ok |
| 8 | `Still working from stage 6: no I2C collisions, IMU at least 45 reads, never more than 40 ms apart` | `r9[4]` | crash | 0, 50, 30 ok |
| 9 | `Still working from stage 5: all 10 samples transmitted, in order, none overwritten` | `r9[5]` | crash | 10 ok |
| 10 | `Still working from stages 3 and 4: mapper frees its frames (at least 3 frames, 2 paths), spectrometer 47 to 53 samples started in 1 s` | `r9[6][0] && r9[7][0]` | crash | 4 frames, 3 paths, 8192 B, 50 samples ok |
| 11 | `Still working from stages 1 and 2: motor never more than 11 ms between steps, telemetry never more than 105 ms between packets, at least 9 sent; BEACON every 500 ms and HEART every 200 ms (within 3 ms)` | `r9[8][0] && r9[9][0]` | crash | motor 10, telemetry 104, 10 packets; 2/5 toggles ok |

The start never reaches `check` (`K.crash`): "E (599) task_wdt: Task watchdog got triggered. The following tasks did not reset the watchdog in time: - IDLE1 (CPU 1) ... The idle task on this core has not run for 600 ms ...", run ends at 599 ms (`K.end` 600), IDLE1 never ran, IDLE0 ran every ms, no fault logged before the crash, 11 frames published. Margins: objective 1's 15 ms limit against 13 (solution) and 17 (vision holds the lock across `visionStep`) is the thin spot (2 ms each side, deterministic); objective 0's 25 against 20; telemetry gap 104 vs 105 and motor gap 10 vs 11 are the old stage 2 margins and are unchanged from stage 12 because core 1 is untouched when the new tasks live on core 0 (risk 1). Do not change `T`, the periods, the `d(8)` or the priorities.

## 6. Bonus
`B(70, 41168)`.
- Solution: CPU **68%**, RAM **41120 B** (3 stars). Start: CPU 50%, RAM 41120 (it crashes).
- Lean limit is 48 B above the solution. Variants (all pass every objective): stacks 2768 / 1568 = 41040 (3 stars); fusion stack 2048 = 41568 and both 4096 = 44896 pass but miss Lean (2 stars).
- CPU: every correct design measures 68 (limit 70); as in stages 8 to 12 the CPU star does not discriminate, only Lean does. (`K.m.cpu` averages two cores: core 0 42%, core 1 95%.)

## 6b. Chart
- Start: AUTO zoom **2x**, densest row `vision` 30.4 state changes per 100 px, **500 ms visible at once** (the run ends at 599 ms). Solution: **4x**, densest row `spectro` 50.2, **250 ms visible at once**.
- What the learner sees in the start: both idle rows, `IDLE0` solid grey for the whole run and `IDLE1` empty with the red text "never ran: nothing fed the watchdog", `vision` and `fusion` rows showing only thin slices in the crowd of core 1, then the "watchdog reset at 599 ms" line (the game scrolls to the crash). After the pin without a lock: the `vision` and `fusion` rows alternate every millisecond around 59 to 70 ms (and every 50 ms after), the faults row shows a red `!` in every cycle.
- `chartGrid: { unit: 'vision', period: 50 }` (an amber tick where each vision cycle should start; readable at 1x because 0.8 px/ms x 50 ms = 40 px).
- `evidence(K)` (returns `[]` on a crash: the game scrolls to the crash line by itself; checked on the solution, the alts and every non-crash wrong answer):
```js
evidence: K => {
  if (K.crash) return [];
  const lk = K.units.filter(u => ['vision', 'fusion'].includes(u.name) && u.state === 'wait' && u.obj && u.obj.name === 'hz_lock');
  if (lk.length) {                                                       // a lock nobody gives back
    const u = lk[0]; let t = K.end - 1; while (t > 0 && u.tr[t] === 3) t--;
    const o = u.obj, h = o.owner ? o.owner.name : 'nobody';
    return [{ unit: u.name, from: t + 1, to: K.end - 1, label: `${u.name} has waited ${K.end - 1 - t} ms for hz_lock, held by ${h}` }];
  }
  const bad = K.ev.filter(e => e.k === 'log' && /hazard record/.test(e.text));
  if (bad.length) { const n = (K.w.hz || {}).torn || bad.length;
    return [{ unit: 'fusion', from: Math.max(0, bad[0].t - 4), to: Math.min(bad[0].t + 8, K.end - 1), label: `hazard record torn ${n} times: fusion read it while vision was writing it` }]; }
  const rd = E_(K, 'readHazard'); let w = -1, wl = 15;
  rd.forEach((t, i) => { const l = t - 50 * (i + 1); if (l > wl) { wl = l; w = i; } });
  if (w >= 0) return [{ unit: 'fusion', from: 50 * (w + 1), to: rd[w], label: `hazard read ${wl} ms after its slot: fusion waited for hz_lock or for the CPU` }];
  const pb = E_(K, 'publishHazard'); let pw = -1, pl = 25;
  pb.forEach((t, i) => { const l = t - 50 * (i + 1); if (l > pl) { pl = l; pw = i; } });
  if (pw >= 0) return [{ unit: 'vision', from: 50 * (pw + 1), to: pb[pw], label: `hazard frame published ${pl} ms after its slot` }];
  if (pb.length < 18) return [{ unit: 'vision', from: 0, to: K.end - 1, label: `only ${pb.length} hazard frames published` }];
  if (rd.length < 18) return [{ unit: 'fusion', from: 0, to: K.end - 1, label: `only ${rd.length} hazard reads` }];
  const ex = E_(K, 'exchangeData'); let bw = -1, bl = 30;
  ex.forEach((t, i) => { const l = t - 100 * (i + 1); if (l > bl) { bl = l; bw = i; } });
  if (bw >= 0) return [{ unit: 'bus_mgr', from: 100 * (bw + 1), to: ex[bw], label: `bus exchange ${bl} ms late` }];
  const ms = S_(K, 'motorStep'); let mg = 11, mi = -1;
  for (let i = 1; i < ms.length; i++) if (ms[i] - ms[i - 1] > mg) { mg = ms[i] - ms[i - 1]; mi = i; }
  if (mi >= 0) return [{ unit: 'motor', from: ms[mi - 1], to: ms[mi], label: `${mg} ms between motor steps` }];
  return [];
}
```
Measured: pinned without a lock -> `fusion` 58 to 70 "hazard record torn 19 times"; lock held across `visionStep` -> `fusion` 50 to 67 "hazard read 17 ms after its slot"; delay instead of lock -> `fusion` 50 to 74 (24 ms); vision above fusion -> `fusion` 50 to 75 (25 ms); vision never gives -> `vision` 111 to 999 "vision has waited 889 ms for hz_lock, held by vision"; vision does nothing -> `vision` 0 to 999 "only 0 hazard frames published"; solution and alts -> `[]`.

## 7. Wrong answers
Mutations of the solution (`v` = unit `vision`, `f` = unit `fusion`, found by name; `unlock(u)` removes every `take`/`give` of `hz_lock` from `u.code`). Objective indexes as in section 5. All measured, T = 1000.
| Name | Mutation | Fails / crash | Measured | `says` |
|---|---|---|---|---|
| both tasks left on core 1 (the start) | `v.core = 1; f.core = 1` | crash `task_wdt` | IDLE1 at 599 ms | (crash) |
| only vision moved | `f.core = 1` | crash `task_wdt` | IDLE1 at 599 ms (fusion's 8 ms per 50 ms is enough) | (crash) |
| only fusion moved | `v.core = 1` | crash `task_wdt` | IDLE1 at 599 ms | (crash) |
| vision on any core | `v.core = -1` | crash `task_wdt` | IDLE1 at 857 ms (it floats onto core 1 when core 0 is busy) | (crash) |
| no lock | `unlock(v); unlock(f)` | 2 | 19 torn reads; frames 19 (worst 19 ms), reads 19 (worst 14 ms) | `race` |
| lock in vision only | `unlock(f)` | 2 | 19 torn reads | `halfLocked` |
| lock in fusion only | `unlock(v)` | 2 | 19 torn reads | `halfLocked` |
| lock held across the whole analysis | `v.code = [un(50), tk('hz_lock'), c('visionStep'), c('publishHazard'), gv('hz_lock')]` | 1 | 0 torn, worst read delay 17 ms (limit 15) | `longSection` |
| a delay instead of a lock | `unlock(v); f.code = [un(50), d(20), c('readHazard'), c('fusionStep')]` | 1 | 0 torn (the windows no longer overlap) but worst read delay 24 ms | `delayNotLock` |
| vision above fusion | `v.prio = 3` | 1 | 0 torn, worst read delay 25 ms (fusion waits behind the analysis) | `readerStarved` |
| vision never gives the lock | `v.code = [un(50), c('visionStep'), tk('hz_lock'), c('publishHazard')]` | 0, 1, 2 | 1 frame, 1 read, vision waits 889 ms for hz_lock held by itself | `forgotGive` |
| vision does nothing | `v.code = [un(50)]` | 0 | 0 frames, reads 19 | `noVision` |
| vision spins | `v.code = [bz(700), ...v.code]` | crash `task_wdt` | IDLE0 at 599 ms | (crash) |
| vision stack 1024 | `v.stack = 1024` | crash `stack overflow` | task vision at 50 ms | (crash) |
| fusion stack 1024 | `f.stack = 1024` | crash `stack overflow` | task fusion at 59 ms | (crash) |
| fusion gives twice | `f.code = [...f.code, gv('hz_lock')]` | crash `does not hold` | "assert failed: fusion gave hz_lock but does not hold it." at 72 ms | (crash) |

Crash rows need no reaction key: the game answers every `task_wdt` crash with `reactions.watchdog` (first time lines 0 and 1, later only line 1) and every other crash with the serial message, and the verifier does not look at `says` for `crash:` rows. So the `watchdog` copy must cover both cores: IDLE1 = core 1 is full (move work to core 0), IDLE0 = a task on core 0 never blocks, and a task with no affinity can land on the full core.

Accepted correct designs for `alts` (all pass every objective, measured):
| Name | Mutation | Stars | Measured |
|---|---|---|---|
| tight stacks | `v.stack = 2768; f.stack = 1568` | 3 | RAM 41040, CPU 68 |
| fusion above vision, lock kept | `f.prio = 3` | 3 | worst read delay 11 ms |
| fusion above vision, no lock (race hidden by priority) | `unlock(v); unlock(f); f.prio = 3` | 3 | 0 torn, fragile (risk 4) |
| vision below fusion, lock kept | `v.prio = 1` | 3 | frames worst 22 ms |
| fusion keeps the lock through fusionStep | `f.code = [un(50), d(8), tk('hz_lock'), c('readHazard'), c('fusionStep'), gv('hz_lock')]` | 3 | works here (frames worst 22 ms), but is the longer critical section the theory warns about |
| fusion stack 2048 | `f.stack = 2048` | 2 | RAM 41568 |
| both stacks 4096 | `v.stack = 4096; f.stack = 4096` | 2 | RAM 44896 |

## 8. Reactions (keys and `diagnose` logic)
Keys: `race`, `halfLocked`, `longSection`, `delayNotLock`, `readerStarved`, `forgotGive`, `noVision`, `regress`, `fail`, plus the four the verifier demands (`watchdog`, `crash`, `fail`, `pass`). Code (tested against every non-crash row of section 7):
```js
diagnose: (K, res) => {
  if (K.crash) return reactions.fail;
  const v = K.units.find(u => u.name === 'vision'), f = K.units.find(u => u.name === 'fusion');
  const takes = u => u.code.some(i => i.op === 'take' && i.s === 'hz_lock');
  if (!res[2][0]) {
    if ([v, f].some(u => u.state === 'wait' && u.obj && u.obj.name === 'hz_lock')) return reactions.forgotGive;
    if (takes(v) && takes(f)) return reactions.fail;
    return takes(v) || takes(f) ? reactions.halfLocked : reactions.race;
  }
  if (!res[1][0]) {
    if (!takes(f)) return reactions.delayNotLock;
    return v.base > f.base ? reactions.readerStarved : reactions.longSection;
  }
  if (!res[0][0]) return reactions.noVision;
  return res.slice(3).some(r => !r[0]) ? reactions.regress : reactions.fail;
}
```
Meaning: `race` (both tasks are on core 0 and nobody takes `hz_lock`; the chart shows the read and the write overlapping; name the two calls and the missing lock, not the stack), `halfLocked` (a lock only helps if both sides take it), `longSection` (the lock is held across the 10 ms analysis, so the reader waits; take it around the 4 ms publish only), `delayNotLock` (the race went away because of a longer delay, the read now misses its deadline, and a delay is timing luck, not synchronisation), `readerStarved` (a higher priority for the writer makes the reader wait behind the whole analysis, priority is not a lock), `forgotGive`, `noVision`, `regress` (an older stage broke), `fail`. `reactions.watchdog` as described in section 7.

## 9. Theory outline (6 sections, one check question each)
1. **Two brains, one rover**: the ESP32 has two cores (PRO_CPU = core 0, APP_CPU = core 1) and ESP-IDF FreeRTOS runs one scheduler over both (SMP), each core with its own idle task; a task runs on one core at a time; ISRs and system tasks (Wi-Fi, `esp_timer`) live mostly on core 0 by default; single-core chips exist (ESP32-S2, C3). SVG: two lanes with the rover's tasks stacked on core 1 and an empty core 0. Widget: "task board": drag the rover's tasks between core 0 and core 1 and watch two load bars and the two IDLE rows. Check: "Two tasks of the same priority, each on its own core: how many run at the same time?" (two).
2. **Why the rover reset**: 95% on core 1 plus 14 ms of vision every 50 ms is over 100%; the idle task of core 1 starves; the task watchdog checks both idle tasks and names the core (`IDLE1 (CPU 1)`). SVG: the stage 13 start chart with the watchdog line. Widget: per-core load meter where a slider adds vision work to a core and the idle share of that core reaches 0. Check: "Which line of the reset message names the full core?" (the IDLE line with its CPU number).
3. **Pinning and affinity**: `xTaskCreatePinnedToCore(..., core)` with 0 or 1, versus `xTaskCreate` / `tskNO_AFFINITY`: the scheduler may run the task on either core, so it can land on the full one (the 857 ms crash); when to pin (keep Wi-Fi-sensitive or cache-hot work apart, balance load) and when to float. SVG: three tasks with pinned and floating arrows. Widget: pin / float toggle per task with the resulting placement for a busy and a quiet core 0. Check: "What does `tskNO_AFFINITY` guarantee?" (nothing about which core).
4. **Now it really overlaps**: two cores run in parallel, and even on one core equal-priority tasks alternate every tick; a 16-byte record written by one task and read by another can be seen half old, half new (torn read). SVG: the read window and the write window overlapping (59 to 64 and 62 to 70) with the bad record. Widget: sliders for the reader's offset and the writer's length with the overlap highlighted and the torn-read counter. Check: "Why does a vTaskDelay(20) in the reader not fix the race?" (it only moves the windows apart today; slower tasks, another core or a changed period bring it back, and here it makes the read late).
5. **Locks and critical sections**: a mutex (blocking, owner, inheritance, for sections of any length that may block) versus a critical section (`portENTER_CRITICAL(&mux)` / `taskENTER_CRITICAL(&mux)` with a `portMUX_TYPE` spinlock: busy-waits the other core, disables interrupts on this core, only for a few microseconds, never call blocking APIs inside, ISR-safe variants `..._ISR`); on a single core `portDISABLE_INTERRUPTS` is not enough on two cores. Priorities are not locks (the "vision above fusion" and "fusion above vision" results). SVG: decision table section length x who touches it (task, ISR, other core). Widget: pick the protection for four sections (record copy, 10 ms analysis, counter bump in an ISR, SPI transaction) and see the verdict. Check: "Which protection is right for a 16-byte copy shared with an ISR?" (critical section / spinlock).
6. **Short sections and finding it in the field**: take the lock around the 4 ms publish only, process outside it (the `longSection` and "keep through fusionStep" cases), never sleep or block while holding it, lock order from stage 11 still applies; real tools: `vTaskList` / `uxTaskGetSystemState` (shows the core with `xTaskGetCoreID`), `vTaskGetRunTimeStats` per task and per core, task watchdog options for IDLE0/IDLE1 (`CONFIG_ESP_TASK_WDT_CHECK_IDLE_TASK_CPU0/1`), SystemView. SVG: the solution's chart with the lock around the publish. Widget: hold-time slider (lock held 4, 10, 14 ms) with the reader's delay and the 15 ms limit. Check: "What should happen inside a critical section?" (only the copy; no processing, no waiting).

Facts to verify against ESP-IDF / FreeRTOS documentation (mark `VERIFY:` in the draft):
- ESP-IDF FreeRTOS is SMP: one ready list, `xTaskCreate` creates a task with `tskNO_AFFINITY`, `xTaskCreatePinnedToCore` takes `0`, `1` or `tskNO_AFFINITY`; whether an unpinned task keeps running on the core it last used; which core runs `app_main` (core 0 by default, `CONFIG_ESP_MAIN_TASK_AFFINITY`), where Wi-Fi/BT and `esp_timer` tasks live, and that the Kconfig name for single core builds is `CONFIG_FREERTOS_UNICORE`.
- Each core has its own idle task (`IDLE0`, `IDLE1`); the task watchdog can watch both (`CONFIG_ESP_TASK_WDT_CHECK_IDLE_TASK_CPU0`/`CPU1`), the default timeout is 5 s (the game uses 600 ms, scaled); the message format "IDLE1 (CPU 1)".
- Time slicing of equal-priority tasks (`configUSE_TIME_SLICING`, per core), the real tick rate (default 100 Hz) versus the game's 1 kHz.
- `portMUX_TYPE`, `portENTER_CRITICAL(&mux)`, `portEXIT_CRITICAL`, `portENTER_CRITICAL_ISR`, `taskENTER_CRITICAL(&mux)` in IDF 5.x (spinlock argument required; behaviour on single core builds), that interrupts are disabled only on the calling core, and the guidance to keep sections to microseconds.
- Mutex priority inheritance across cores (works through the shared ready lists; check wording) and that a mutex cannot be taken from an ISR.
- `xTaskGetCoreID`, `vTaskList` columns (the core column needs `configTASKLIST_INCLUDE_COREID`), `vTaskGetRunTimeStats` on IDF 5.x.
- Torn reads of multi-word data are real on the ESP32 (32-bit words are atomic, a 16-byte record is not).

## 10. Open risks
1. **Stage 12 is not built, the base is rebuilt.** The rover's core 1 is saturated (95%, idle only 5%): any extra work on it crashes the run with a watchdog (measured: the vision task alone at 100 ms period, a 2 ms reader at 50 ms, any task on core 1). That is the start's crash and also the reason `fusion` must move too. If the real stage 10, 11 or 12 changes a stack, priority, period or the camera rule, **re-measure all of section 5**. Core 1 is untouched by the solution (vision and fusion are on core 0, ISRs also on core 0), so the old thin margins (telemetry 104 vs 105, motor 10 vs 11) are exactly stage 12's.
2. **First `cores: 2` lesson.** Verified on the kernel only. Not checked in the browser: the CPU gauge in `main.js` uses core 0 only (section 3); the editor's core select and the `IDLE0`/`IDLE1` rows were read from the code, not run; the 3D world has no core notion. The verifier does not treat `cores` specially; `grade()` is unchanged.
3. **Critical sections are only in the theory.** The game offers only a mutex (the `hz_lock` object); there is no spinlock object and no `taskENTER_CRITICAL` op, so the stage cannot show an interrupt-latency penalty for a critical section that is too long. Adding such an op was out of scope (kernel changes beyond `F` entries); a later stage 14 or a side mission could add it.
4. **The race is deterministic only because of timing, and priority hides it.** Equal priority gives alternating milliseconds, so the 19 overlaps are reproducible; with `fusion` at 3 or `vision` at 1 the windows no longer overlap and the unlocked program passes (alts, "race hidden by priority"); `vision` above `fusion` fails objective 1 instead (25 ms). The `d(8)` offset was chosen from a grid (`d(8)` and `d(9)` give a clean start and 19 torn reads; `d(10)` already logs 1 torn read in the start before the crash; `d(11)` to `d(12)` log 4 to 6; `d(13)` or more gives no overlap). Do not retune.
5. **The start is a crash, so objectives 0 to 11 have no start values**, and `evidence` is empty for it (the game scrolls to the crash line). The second failure (torn reads) appears only after the first fix; the serial monitor of the start has no fault lines before the reset (measured: 0 torn reads before 599 ms).
6. **`K.stats.viol` includes the torn reads** (the new functions call `K.bad`), so objective 3 subtracts `torn`. Any other objective that uses `K.stats.viol` in this stage must do the same. The serial monitor shows only the first 12 faults.
7. **Floating tasks are timing-dependent**: "vision on any core" crashes at 857 ms because vision lands on core 1 when core 0 is busy; "both" and "fusion only on any core" crash at 599 ms. The accepted designs pin both tasks to core 0; a `tskNO_AFFINITY` solution is not offered (not proven to pass).
8. **Earlier tasks are not locked**, so the player may also move old tasks to core 0 (for example the camera); that is not measured and not offered by the story. If the builder wants to prevent it, set `locked: true` on units 0 to 24 in `start()` (the verifier only checks names).
9. **CPU star does not discriminate** (every correct design measures 68%); only Lean does. The `fusion keeps the lock through fusionStep` alt passes with 3 stars although the theory calls it worse: no objective punishes it (frames worst 22 ms vs the 25 ms limit).
10. **Realism**: 4 ms to write a record and 8 ms "wait for the frame" are scaled for the 1 s test; the theory must say so.
