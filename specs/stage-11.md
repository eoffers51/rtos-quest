# Stage 11 spec: Deadly Embrace

All numbers were measured with `runSim` (scratch scripts `specs/tmp-11*.js`, deleted). The stage 10 lesson file did not exist, so the base is the stage 10 reference solution from section 4 of `specs/stage-10.md`: `stage9.solution()` + `objs.sys_ev` (events `LINK_UP`, `TIME_OK`, `FIX_OK`) + tasks `radio_link` (stack 1536), `time_sync` (1792), `gps_fix` (1664), `uplink` (2048), all priority 1, with the codes given there. That base measures CPU 99%, RAM 30112, idle ticks 395-399 and 795-797. If the real stage 10 file differs in unit order, stacks or timing, re-measure (open risk 1).
L = `{ T: 1000, cores: 1, heap: 8192, pins: ['BEACON','HEART'], irqs: { onBump: [150, 152], onPacket: [100, 420, 500, 580] } }` (identical to stages 9 and 10, so every older regression is the same run).
Unit order: stage 10 units 0 to 20 (unchanged: beacon 0, heart 1, motor 2, camera 3, telemetry 4, spectro 5, nav 6, mapper 7, science 8, radio 9, imu 10, thermo 11, onBump 12, bumper 13, onPacket 14, antenna 15, onStow 16, radio_link 17, time_sync 18, gps_fix 19, uplink 20), then **arm 21, focus 22** (tasks, priority 2).

## 1. Identity
- id: 11
- slug: `deadly-embrace`
- title: Deadly Embrace
- topic: Deadlock, lock ordering and starvation (four conditions for deadlock, lock ordering, hold-and-wait, try-lock with timeout, one coarse lock, starvation by busy-polling)
- file: `main/rover_main.c`
- T: **1000**, cores: 1, `heap: 8192`, pins: `['BEACON', 'HEART']`
- irqs: `{ onBump: [150, 152], onPacket: [100, 420, 500, 580] }`
- ops: stage 10 list plus nothing new: `['gpio', 'call', 'delay', 'until', 'busy', 'send', 'recv', 'take', 'give', 'giveISR', 'sendISR', 'notifyGive', 'notifyGiveISR', 'notifyTake', 'tReset', 'tStop', 'evSet', 'evWait']`
- fns: `['stopMotors', 'checkThermals', 'deployAntenna', 'stowAntenna', 'handlePacket', 'acquireLink', 'syncTime', 'acquireFix', 'sendUplink', 'positionArm', 'photograph', 'calibrateCamera', 'checkFocus']` (the last four already exist in `F`)
- no `chartGrid`, no `power`, no `wdtTimeout`.

## 2. Story
The arm team and the camera team each wrote a task for the new photo session, and each did it correctly on its own: `arm` moves the arm into place (`positionArm`, needs `arm_mtx`) and then takes the picture (`photograph`, needs `arm_mtx` and `cam_mtx`); `focus` calibrates the camera (`calibrateCamera`, needs `cam_mtx`) and then checks the focus with the arm in view (`checkFocus`, needs both). Both tasks need both locks, but `arm` takes `arm_mtx` first and `focus` takes `cam_mtx` first. The first session works (a photo at 690 ms, a focus check at 763 ms), the second session starts at about 830 ms with the two tasks 6 ms apart, each grabs its first lock, and at 846 ms they wait for each other for ever: the log says "Deadlock: arm waits for cam_mtx, held by focus; focus waits for arm_mtx, held by arm." Everything else keeps running, which is why it is easy to miss. The fix is a single lock order (or releasing before acquiring), not a bigger stack or a different priority.

## 3. Kernel additions
**None.** The four functions exist in `src/kernel.js` and must not be changed:
| Function | CPU | Blocked wait | Stack | Needs locks | `sig` |
|---|---|---|---|---|---|
| `positionArm` | 1 ms | 12 ms | 500 B | `arm_mtx` | none (shown as `positionArm()`) |
| `photograph` | 2 ms | 30 ms | 900 B | `arm_mtx`, `cam_mtx` | none |
| `calibrateCamera` | 1 ms | 20 ms | 500 B | `cam_mtx` | none |
| `checkFocus` | 1 ms | 15 ms | 600 B | `arm_mtx`, `cam_mtx` | none |

Kernel facts the builders must respect (all measured):
- `needs` is checked when the function starts: a call without the lock logs "positionArm() ran without holding arm_mtx" (a fault, `K.stats.viol`, red `!` mark) and continues.
- Deadlock is reported in `K.diag` at the end of the run as "<task> waits for <obj>, held by <task>" (or "which it already holds itself"). A task blocked for ever on a mutex whose owner is *sleeping* (not blocked) is not in `K.diag`; use the `stuck` helper in section 5.
- **Timeout behaviour of the simulator:** when `tk(m, ms)` times out, the task restarts its code from the first line (it does not fall through) and keeps every lock it holds. Real FreeRTOS returns `pdFALSE` and the code continues. Do not use a timeout in the reference or in any `alt`; it appears only as a wrong answer ("gives up but keeps the lock"), and the theory must say that real code can release and retry, which this simulator cannot express.
- A task that gives a mutex it does not hold crashes: "assert failed: focus gave cam_mtx but does not hold it." (real FreeRTOS does not always assert here: verify, section 9).
- Task cap: the start has 22 tasks. The editor cap of 14 only blocks adding tasks; the player adds none.
- `objs.arm_mtx = { type: 'mutex' }`, `objs.cam_mtx = { type: 'mutex' }` exist in `start()` (reachability), each costs 96 B of RAM.
- Game-time note: 1 ms ticks; real arm moves and exposures take longer, scaled down for the 1 s test. Say so in the theory.

## 4. Programs
Start (`start(prev)`, `prev` = stage 10 solution; new objects and tasks after unit 20):
```js
const p = clone(prev || stage10.solution());
p.objs.arm_mtx = { type: 'mutex' };
p.objs.cam_mtx = { type: 'mutex' };
p.units.push(task('arm', 2, [
  d(640),
  tk('arm_mtx'), c('positionArm'), tk('cam_mtx'), c('photograph'), gv('cam_mtx'), gv('arm_mtx'), d(140),
  tk('arm_mtx'), c('positionArm'), tk('cam_mtx'), c('photograph'), gv('cam_mtx'), gv('arm_mtx'),
  d(10000)], { stack: 1792 }));                                                                               // unit 21
p.units.push(task('focus', 2, [
  d(720),
  tk('cam_mtx'), c('calibrateCamera'), tk('arm_mtx'), c('checkFocus'), gv('arm_mtx'), gv('cam_mtx'), d(60),
  tk('cam_mtx'), c('calibrateCamera'), tk('arm_mtx'), c('checkFocus'), gv('arm_mtx'), gv('cam_mtx'),
  d(10000)], { stack: 1536 }));                                                                               // unit 22
return p;
```
Story of the code: each task makes two sessions; the leading `d(...)` is "start up", the trailing `d(10000)` is "done, sleep" (real code would loop or `vTaskDelete(NULL)`; there is no delete op). `arm` takes arm then cam, `focus` takes cam then arm. Stack need: arm 768 + 900 = 1668 (stack 1792 leaves 124 B), focus 768 + 600 = 1368 (stack 1536 leaves 168 B).

Reference solution: the same programs with `focus` taking the locks in the same order as `arm` (arm_mtx, then cam_mtx), holding both for both calls:
```js
const p = stage10.solution();
p.objs.arm_mtx = { type: 'mutex' }; p.objs.cam_mtx = { type: 'mutex' };
p.units.push(task('arm', 2, [ /* identical to the start */ ], { stack: 1792 }));
p.units.push(task('focus', 2, [
  d(720),
  tk('arm_mtx'), tk('cam_mtx'), c('calibrateCamera'), c('checkFocus'), gv('cam_mtx'), gv('arm_mtx'), d(60),
  tk('arm_mtx'), tk('cam_mtx'), c('calibrateCamera'), c('checkFocus'), gv('cam_mtx'), gv('arm_mtx'),
  d(10000)], { stack: 1536 }));
```
ESP-IDF form: every task that needs both takes `arm_mtx` then `cam_mtx` and gives them in the reverse order (`xSemaphoreTake(arm_mtx, portMAX_DELAY); xSemaphoreTake(cam_mtx, portMAX_DELAY); ...; xSemaphoreGive(cam_mtx); xSemaphoreGive(arm_mtx);`). Player edits: move one `xSemaphoreTake` line in `focus` (two places, two lines each session). Reachability: both mutexes are in `start()`; nothing is added.
Measured timeline of the solution (ms): arm: positionArm ends 657 and 875, photograph ends 690 and 908; focus: calibrateCamera ends 745 and 844, checkFocus ends 763 and 860; uplink packets accepted at 693 and 875 (stage 10 regression, unchanged). In the start the second sessions overlap: arm takes `arm_mtx` at about 832 and focus takes `cam_mtx` at about 826, and at 846 both are blocked.

## 5. Objectives (goals, in order) and checks
Helpers (inside `check`): `ph = E_(K,'photograph')`, `cf = E_(K,'checkFocus')`, `stuck = K.units.filter(u => u.kind === 'task' && u.state === 'wait' && u.obj && u.obj.type === 'mutex')`, `viol = K.stats.viol`, then for stage 10: `up = K.w.up || []`, `dn = K.w.done || {}`, `okU = up.filter(u => u.ok).map(u => u.t)`, `rej = up.filter(u => !u.ok).length`, `rounds = [0, 1].map(i => Math.max(...['link','time','fix'].map(k => (dn[k] || [])[i] ?? -1)))`, `upLat = rounds.map((r, i) => okU[i] === undefined || r < 0 ? -1 : okU[i] - r)`, and `r9 = stage9.check(K)` (its first 10 results are the stage 9 objectives, reused unchanged: indexes 0-2 antenna and uplink delay, 3 ISR/impacts, 4 I2C, 5 samples, 6 heap, 7 spectrometer, 8 motor/telemetry, 9 beacon/heart).

| # | Goal text | Check | Start | Solution |
|---|---|---|---|---|
| 0 | `Photo session: no task waits for ever for a lock (no deadlock, no crash)` | `!K.crash && K.diag.length === 0 && stuck.length === 0`, text `${K.diag.length} deadlocked pair(s), ${stuck.length} task(s) stuck on a lock` | deadlock: arm and focus stuck from 846 -> NO | 0, 0 ok |
| 1 | `Arm: at least 2 photographs taken in 1 s` | `ph.length >= 2`, text `${ph.length} photographs (finished at ${ph.join(', ')} ms)` | 1 (690) -> NO | 2 (690, 908) ok |
| 2 | `Camera: at least 2 focus checks done in 1 s` | `cf.length >= 2`, text `${cf.length} focus checks (finished at ${cf.join(', ')} ms)` | 1 (763) -> NO | 2 (763, 860) ok |
| 3 | `Locks: no arm or camera call runs without the locks it needs` | `viol === 0`, text `${viol} call(s) without their lock` | 0 ok | 0 ok |
| 4 | `Still working from stage 10: the ground station rejects no packet, exactly one per window within 60 ms of the last bring-up (2 packets)` | `rej === 0 && okU.length === 2 && up.length === 2 && upLat.every(x => x >= 0 && x <= 60)`, text `${up.length} packets, ${rej} rejected, accepted at ${okU.join(', ')} ms, delays ${upLat.join(', ')} ms (-1 = never)` | 2 packets, 693, 874, delays 26, 25 ok | 693, 875, delays 26, 26 ok |
| 5 | `Still working from stage 9: every packet handled within 60 ms, mast stowed once per pass 180 to 250 ms after the last packet, unfolded twice` | `r9[0][0] && r9[1][0] && r9[2][0]`, text = the three texts of `r9[0..2]` joined with ` / ` | delays 29, 10, 29, 13; stows 202, 203; 2 unfolds ok | same ok |
| 6 | `Still working from stages 7 and 8: no ISR longer than 1 ms, motors stopped within 3 ms of both impacts, a thermal check for each within 150 ms` | `r9[3][0]` | 0 ms, 0, 0, 29, 81 ok | same ok |
| 7 | `Still working from stage 6: no I2C collisions, IMU at least 45 reads, never more than 40 ms apart` | `r9[4][0]` | 0, 50, 30 ok | same ok |
| 8 | `Still working from stage 5: all 10 samples transmitted, in order, none overwritten` | `r9[5][0]` | 10 ok | 10 ok |
| 9 | `Still working from stages 3 and 4: mapper frees its frames (at least 3 frames, 2 paths), spectrometer 47 to 53 samples started in 1 s` | `r9[6][0] && r9[7][0]` | 4 frames, 3 paths, 8192 B, 50 samples ok | same ok |
| 10 | `Still working from stages 1 and 2: motor never more than 11 ms between steps, telemetry never more than 105 ms between packets, at least 9 sent; BEACON every 500 ms and HEART every 200 ms (within 3 ms)` | `r9[8][0] && r9[9][0]` | 10, 101, 10; 2/5 toggles ok | same ok |

The start fails exactly objectives 0, 1 and 2 (one cause: opposite lock order, and it only bites in the second session). Margins: the second photograph and focus check finish at 908 and 860 (the objective is a count, so a wrong answer must lose a whole photograph); stage 10 delays 26 and 26 vs 60; everything inherited is unchanged from stage 9 (delays 29, 10, 29, 13 identical; motor gap 10 vs 11 and telemetry gap 101 vs 105 are the stage 2 margins). The longest run without an idle tick is **438 ms** (task watchdog limit 600) for the start and the solution, see risk 2. Do not shorten or lengthen `T`: the stage 3 objective reads 50 samples only at 1000 ms.

## 6. Bonus
`B(99, 33680)`.
- Solution: CPU **99%**, RAM **33632 B** (3 stars). Start: CPU 99%, RAM 33632. RAM = stage 10 solution 30112 + arm 1792 + focus 1536 + two mutexes 2 x 96.
- Lean limit sits 48 B above the solution. RAM variants (all pass every objective): arm stack 1668 = 33508; focus stack 1368 = 33464 (both together 33340) pass Lean; arm stack 4096 = 35936 and focus stack 4096 = 36192 miss it; both stacks at 2048 = 34400 misses it.
- CPU: every correct design measures 99 (zero margin, as in stages 8 to 10); the CPU star does not discriminate. A task that spins crashes instead. Re-measure if an earlier builder changes stacks, priorities or the `bumper`/`antenna`/stage 10 code.

## 6b. Chart
- Start: AUTO zoom **4x**, densest row `spectro` 55.0 state changes per 100 px, **250 ms visible at once** (3.2 px per ms). Solution: 4x, 54.6, 250 ms.
- The failure fits one window: the deadlock starts at 846 ms and runs to the end of the test (153 ms of flat "blocked" on both the `arm` and `focus` rows), preceded by the first successful session (arm 640 to 690, focus 720 to 763) which shows what a healthy session looks like. For a failing run the chart scrolls to the bracket below; the learner compares the two rows with the `uplink` and other rows, which keep working.
- No `chartGrid`, no `powerMarks`.
- `evidence(K)` (checked on start, solution and all wrong answers; unit names `arm` and `focus` exist in all of them):
```js
evidence: K => {
  if (K.crash) return [];
  const out = [];
  for (const u of K.units) {
    if (u.kind !== 'task' || u.state !== 'wait' || !u.obj || u.obj.type !== 'mutex') continue;
    let t = K.end - 1; while (t > 0 && u.tr[t] === 3) t--;
    const from = t + 1, o = u.obj;
    out.push({ unit: u.name, from, to: K.end - 1, label: `${u.name} has waited ${K.end - from} ms for ${o.name}, held by ${o.owner ? o.owner.name : 'nobody'}` });
  }
  if (out.length) return out;
  const v = K.ev.find(e => e.k === 'log' && /ran without holding/.test(e.text));
  if (v) { const fn = v.text.split('()')[0]; const unit = ['positionArm', 'photograph'].includes(fn) ? 'arm' : 'focus'; return [{ unit, from: v.t, to: Math.min(v.t + 30, K.end - 1), label: v.text }]; }
  return [];
}
```
Measured: start -> `arm` 846 to 999 "arm has waited 154 ms for cam_mtx, held by focus" and `focus` 846 to 999 "focus has waited 154 ms for arm_mtx, held by arm" (the label counts `K.end - from`); gives swapped only -> same two brackets; keeps the lock after a timeout -> `arm` 846 to 999 only; forgets to give arm_mtx -> `arm` 833 to 999 "held by arm" and `focus` 725 to 999; no locks -> `arm` 644 to 674 "positionArm() ran without holding arm_mtx"; one lock only -> `arm` 657 to 687 "photograph() ran without holding cam_mtx"; releases cam early -> `focus` 745 to 775 "checkFocus() ran without holding cam_mtx"; solution, crashes and the priority case -> `[]`.

## 7. Wrong answers
Mutations of the solution (`arm` = `p.units[21]`, `focus` = `p.units[22]`). Focus code indexes: 0 delay, 1 first take, 2 second take, 3 calibrateCamera, 4 checkFocus, 5 and 6 gives, 7 delay, then the same six for session 2 at 8 to 13. Arm code (as in the start): 0 delay, 1 take arm, 2 positionArm, 3 take cam, 4 photograph, 5 give cam, 6 give arm, 7 delay, 8 to 13 the second session. Objective indexes as in section 5. All measured with `runSim`, T = 1000.

| Name | Mutation | Fails | Measured | `says` |
|---|---|---|---|---|
| opposite lock order (the start) | `focus` code from the start (cam then arm) | 0, 1, 2 | deadlock at 846, 1 photo, 1 focus check | `deadlock` |
| only the gives swapped | start's `focus` code with the gives written arm-after-cam instead (`code[5] = gv('cam_mtx'); code[6] = gv('arm_mtx'); code[12], code[13]` likewise) | 0, 1, 2 | identical deadlock (the release order does not matter) | `deadlock` |
| gives up but keeps the lock | start's `focus` code with `code[3] = tk('arm_mtx', 30); code[10] = tk('arm_mtx', 30)` (timeout 30 ms) | 0, 1, 2 | no `K.diag` entry: focus timed out, restarted from its first line while still holding `cam_mtx`, and sleeps; `arm` stuck on `cam_mtx` from 846 | `keepsLock` |
| arm never gives arm_mtx | remove both `gv('arm_mtx')` from `arm` | 0, 1, 2 | 1 photo, 0 focus checks; arm waits for arm_mtx "which it already holds itself" at 833, focus waits from 725 | `forgotGive` |
| no locks at all | remove every `tk` and `gv` from both tasks | 3 | no deadlock, 2 photos, 2 focus checks, first fault at 644 "positionArm() ran without holding arm_mtx" | `noLocks` |
| one lock for everything | remove every `tk`/`gv` of `cam_mtx` from both tasks | 3 | 2 photos, 2 focus checks, "photograph() ran without holding cam_mtx" at 657 | `oneLock` |
| camera lock released too early | `focus` code `[..., tk arm, tk cam, c('calibrateCamera'), gv('cam_mtx'), c('checkFocus'), gv('arm_mtx'), ...]` for both sessions | 3 | "checkFocus() ran without holding cam_mtx" at 745 | `releasedEarly` |
| arm above everything | `p.units[21].prio = 4` | 10 | all of 0 to 9 pass; motor/telemetry/beacon objective fails (arm at priority 4 delays them) | `hog` |
| gives a lock twice | `focus` code, insert `gv('cam_mtx')` at index 6 | crash | "assert failed: focus gave cam_mtx but does not hold it" at 763 ms | crash: `giveNotHeld` |
| focus spins waiting | `focus` code `[d(720), bz(700), ...rest]` | crash | `task_wdt` at 999 ms (cpu 100) | crash: `busyLoop` |
| arm stack 1024 | `p.units[21].stack = 1024` | crash | "A stack overflow in task arm has been detected" at 644 ms | crash: `stack` |
| focus stack 1024 | `p.units[22].stack = 1024` | crash | stack overflow in task focus at 724 ms | crash: `stack` |

(A try-lock with `tk(m, 0)` is deliberately left out: in the simulator a failed zero-timeout take restarts the task at its first line, which here is the start-up delay, so it does not model a polling loop.)

Accepted correct designs for `alts` (all pass every objective):
| Name | Mutation | Stars | Measured |
|---|---|---|---|
| fix the arm instead | `focus` as in the start; `arm` code: `tk('cam_mtx'), tk('arm_mtx'), c('positionArm'), c('photograph'), gv('arm_mtx'), gv('cam_mtx')` for both sessions | 3 | photos 690, 908; RAM 33632 |
| release before acquiring | `focus` code: `tk cam, c('calibrateCamera'), gv cam, tk arm, tk cam, c('checkFocus'), gv cam, gv arm` per session (delays unchanged) | 3 | photos 690, 877; focus 763, 893; RAM 33632 |
| both tasks at priority 1 | `p.units[21].prio = 1; p.units[22].prio = 1` | 3 | same results |
| focus at priority 3 | `p.units[22].prio = 3` | 3 | same results |
| arm at priority 3 | `p.units[21].prio = 3` | 3 | same results |
| arm stack 1668 | `p.units[21].stack = 1668` | 3 | RAM 33508 |
| focus stack 1368 | `p.units[22].stack = 1368` | 3 | RAM 33464 |
| arm stack 4096 | `p.units[21].stack = 4096` | 2 | RAM 35936 |
| focus stack 4096 | `p.units[22].stack = 4096` | 2 | RAM 36192 |

## 8. Reactions (keys and `diagnose` logic)
Keys: `deadlock`, `keepsLock`, `forgotGive`, `noLocks`, `oneLock`, `releasedEarly`, `giveNotHeld`, `stack`, `busyLoop`, `hog`, `regress`, `fail`. Where `stuck` is as in section 5 and `fa = res => res.findIndex(r => !r[0])`:
```js
diagnose: (K, res) => {
  if (K.crash && /gave .* but does not hold/.test(K.crash.msg)) return reactions.giveNotHeld;
  if (K.crash && /stack overflow/.test(K.crash.msg)) return reactions.stack;
  if (K.crash && /task_wdt/.test(K.crash.msg)) return reactions.busyLoop;
  const stuck = K.units.filter(u => u.kind === 'task' && u.state === 'wait' && u.obj && u.obj.type === 'mutex');
  if (!res[0][0]) {
    if (K.diag.some(s => /already holds itself/.test(s))) return reactions.forgotGive;
    if (K.diag.length) return reactions.deadlock;
    if (stuck.length) return reactions.keepsLock;
  }
  if (!res[3][0]) {
    const ops = ['arm', 'focus'].flatMap(n => K.units.find(u => u.name === n).code);
    const takes = ops.filter(i => i.op === 'take');
    if (!takes.length) return reactions.noLocks;
    if (!takes.some(i => i.s === 'cam_mtx') || !takes.some(i => i.s === 'arm_mtx')) return reactions.oneLock;
    return reactions.releasedEarly;
  }
  if (!res[1][0] || !res[2][0]) return reactions.fail;
  if (!res[10][0] || !res[7][0] || !res[6][0]) return reactions.hog;
  if ([4, 5, 8, 9].some(i => !res[i][0])) return reactions.regress;
  return reactions.fail;
}
```
Reaction meaning: `deadlock` (opposite order, or only the gives changed: name the circular wait, steer to a single order, do not hint at stack or priority), `keepsLock` (a timeout path that returns without releasing: the other task is stuck behind a lock held by a sleeper, so no deadlock report), `forgotGive` (a task waits for a mutex it already holds), `noLocks` / `oneLock` / `releasedEarly` (lock discipline: the driver call ran unprotected), `giveNotHeld`, `stack`, `busyLoop` (spinning starves the idle task, task watchdog), `hog` (a high priority arm delays older work), `regress`, `fail`.

## 9. Theory outline (6 sections, one check question each)
1. **Two keys, two doors** (the deadlock): SVG wait-for graph, two tasks and two mutexes, arrows "holds" and "waits for", with the circular arrow highlighted. Widget: step-through of the stage's own code, a slider "second task starts N ms after the first" (0 to 40 ms, windows from the simulator: overlap deadlocks, a gap of 40 ms or more does not) so the learner sees it only breaks when timing lines up. Check: "The first session worked. Why did the second one deadlock?" (timing overlap, not a code change).
2. **Four conditions** (mutual exclusion, hold and wait, no preemption, circular wait): SVG with four tiles. Widget: four toggles, each removes one condition from a small scenario and shows which designs stop deadlocking. Check: "Which condition does a consistent lock order remove?" (circular wait).
3. **One lock order** (the fix): SVG ladder of locks ordered top to bottom, every task climbs down only. Widget: drag the two lock names into an order for each task and run it against the same timing; shows green/red per order. Check: "arm takes A then B, focus takes B then A, a third task takes A then B: how many tasks must change?" (one: any single task, as long as all agree; the answer is the learner's choice of rule).
4. **Other ways out** (release before acquire, try-lock with timeout, one coarse lock, hierarchy of locks): SVG comparison table of cost/risk. Widget: pick a strategy and see what the rover chart shows (including the simulator's "gives up but keeps the lock" caveat and the "one lock" fault that the driver check catches). Check: "A timeout alone, with no release of the first lock: what happens?" (the other task stays blocked).
5. **Starvation and livelock**: SVG of a high-priority task polling a lock in a loop while a low-priority task, which holds it, never runs. Widget: priority and poll-delay sliders, the idle task share and the task watchdog countdown. Check: "Why does a polling task at priority 2 crash the rover with `task_wdt`?" (it starves the idle task). Mention that priority inheritance (stage 12) is the cure for the priority variant.
6. **Finding it** (on the chart, in the log, in the field): SVG of the chart with two flat "blocked" rows labelled; real-world: FreeRTOS does not detect deadlocks, use the task watchdog (`esp_task_wdt_add`), `vTaskList`/`vTaskGetInfo` states, a timeout in `xSemaphoreTake` plus `ESP_LOGE`, core dumps and GDB `info threads`. Widget: "who holds what" table the learner fills in from the log line. Check: "Which line of the log tells you which task holds the lock the other waits for?".

Facts to verify against ESP-IDF / FreeRTOS documentation (mark `VERIFY:` in the draft):
- `xSemaphoreTake` returns `pdFALSE` on timeout and the caller keeps any other lock it holds (the simulator restarts the task code instead, say so).
- FreeRTOS has no deadlock detection; mutexes are not recursive unless `xSemaphoreCreateRecursiveMutex`; taking a non-recursive mutex twice in one task deadlocks it.
- Giving a mutex from a task that does not hold it: what real FreeRTOS does (the simulator crashes with an assert; real behaviour depends on `configASSERT` and kernel version).
- Task watchdog in ESP-IDF: `esp_task_wdt_add`, `esp_task_wdt_reset`, `CONFIG_ESP_TASK_WDT_TIMEOUT_S` (5 s default), `CONFIG_ESP_TASK_WDT_PANIC`; the idle-task monitoring message used in `busyLoop`.
- `vTaskList` needs `configUSE_TRACE_FACILITY` and `configUSE_STATS_FORMATTING_FUNCTIONS` (in ESP-IDF `CONFIG_FREERTOS_USE_TRACE_FACILITY`), and what its state letters mean ('B' blocked).
- Default tick rate on ESP-IDF is 100 Hz (`CONFIG_FREERTOS_HZ`), the game uses 1000 Hz: say so wherever times appear.
- Priority inheritance of mutexes (teaser for stage 12) and that it does not prevent deadlock.

## 10. Open risks
1. **Stage 10 is not built.** All numbers rest on the stage 10 reference solution from `specs/stage-10.md`, rebuilt in a scratch script (CPU 99, RAM 30112, idle 395-399 and 795-797 reproduced). If the real stage 10 lesson changes a stack, a priority, the order of units or the bring-up code, re-measure: the second-session overlap at about 830 ms depends on how long the lower-priority work delays `arm` and `focus`.
2. **Task watchdog margin.** The system is saturated, so there are only 8 idle ticks in 1 s and the 600 ms watchdog is the limit: the longest streak without an idle tick is 438 ms. `d(640)` for `arm` and `d(720)` for `focus` keep all new CPU (about 10 ms) after 600 ms; moving them earlier eats the idle ticks at 395-399 and crashes at 599 or 999 (measured with starts at 100 to 300 ms, and with the second sessions earlier than 560 ms). Keep these numbers.
3. **Chaotic scheduling.** Changing `arm` or `focus` delays by a few ms flips whether the second sessions overlap and whether the solution crashes at 999 (several of the grid points tried did). The reference was chosen from a grid where start, solution, all alts and all wrong answers except the intended crashes finish without a watchdog crash. Do not retune.
4. **`busyLoop` crash lands at 999 ms**, the last tick of the test, because the idle slot at 797 is the last one (streak 600 exactly). It is deterministic here; if a later change moves the last idle tick, it may stop crashing within `T` (the wrong-answer case would then show a different failure and the verifier would flag it).
5. **Timeout model differs from real FreeRTOS** (restart from the first line); hence no timeout in the reference or alts and the explicit caveat in the theory. No conditional ops exist, so "try, then release and retry" cannot be written by the player.
6. **CPU star does not discriminate** (every correct design measures 99%); only the Lean star does.
7. Starvation (the topic's second half) is taught in the theory and checked only through the `busyLoop` crash; there is no objective for it.
