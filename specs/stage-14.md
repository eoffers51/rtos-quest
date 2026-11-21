# Stage 14 spec: Flight Readiness Review

All numbers were measured with `runSim` (scratch scripts `specs/tmp-14*.js`, `specs/base14.js`, `specs/ev14.js`, deleted). Neither the stage 12 nor the stage 13 lesson file exists yet (`two-brains.js` is missing; `pathfinder.js` exists), so the base is rebuilt: `base13` = `pathfinder.js` `solution()` (stage 12) + the stage 13 reference solution from `specs/stage-13.md` section 4 (`hz_lock` mutex, `vision` prio 2 `[un(50), c('visionStep'), tk('hz_lock'), c('publishHazard'), gv('hz_lock')]` stack 2816 core 0, `fusion` prio 2 `[un(50), d(8), tk('hz_lock'), c('readHazard'), gv('hz_lock'), c('fusionStep')]` stack 1600 core 0). It measures CPU 68%, cores 42/95, RAM 41120, stage 13 objectives all ok. If the real stage 13 file differs, **re-measure everything** (open risk 1).
L = `{ T: 1000, cores: 2, heap: 8192, wdtTimeout: 300, pins: ['BEACON','HEART'], irqs: { onBump: [150, 152], onPacket: [100, 420, 500, 580] } }` (stage 13 values plus `wdtTimeout: 300`).
Unit order: stage 13 units 0 to 26 unchanged (beacon 0, heart 1, motor 2, camera 3, telemetry 4, spectro 5, nav 6, mapper 7, science 8, radio 9, imu 10, thermo 11, onBump 12, bumper 13, onPacket 14, antenna 15, onStow 16, radio_link 17, time_sync 18, gps_fix 19, uplink 20, arm 21, focus 22, bus_mgr 23, weather 24, vision 25, fusion 26), then **diag 27**. Look units up by name.

## 1. Identity
- id: 14
- slug: `flight-readiness-review`
- title: Flight Readiness Review
- topic: Production hardening (the task watchdog `esp_task_wdt_add` / `esp_task_wdt_reset`: subscribe the tasks that must run regularly, feed it from the task's own loop, never subscribe a task that legitimately blocks longer than the timeout; stack high-water marks and a safety margin; heap leaks and `heap_caps_get_free_size`; diagnostics that must not disturb the real-time tasks)
- file: `main/rover_main.c`
- T: **1000**, cores: **2**, `heap: 8192`, `wdtTimeout: 300`, pins `['BEACON', 'HEART']`
- irqs: `{ onBump: [150, 152], onPacket: [100, 420, 500, 580] }`
- ops: the stage 13 list plus the two watchdog ops: `[..., 'wdtAdd', 'wdtReset']` (they already exist in the kernel and in `editor.js`)
- fns: the stage 13 list plus the three functions that already exist and diag needs: `[..., 'allocFrame', 'freeFrame', 'logStatus', 'logToFlash']`. (`allocFrame` and `freeFrame` were offered in stage 4 and may already be in the list: de-duplicate.)
- no `power`. `chartGrid: { unit: 'diag', period: 150 }`.
- Task stacks are editable (the player changes four stack sizes); do not lock units 0 to 26.

## 2. Story
The flight-safety team ran its review checklist over the finished rover and "hardened" it in the naive way. They subscribed `motor`, `camera` and `science` to the task watchdog (`wa()` first line, `wr()` last line of each loop; the game's watchdog timeout is 300 ms, the ESP-IDF default is 5 s) and bolted on a `diag` task that every 150 ms allocates a 2 KB buffer, logs the status and writes a snapshot to flash. Three findings follow. (1) The first run resets the chip at 318 ms: `camera` sleeps 240 ms, compresses and sleeps 240 ms again, so its loop is longer than the timeout and the dog bites a healthy task; after that `science` is bitten at 385 ms because it legitimately waits 420 ms for the instrument between bursts. (2) Then `diag` never frees its buffer: the heap is exhausted and `pvPortMalloc` returns NULL at 637 ms. (3) With both fixed the rover flies, but the results table shows tasks with 0 to 20 bytes of unused stack (`beacon`, `heart`, `motor`, `spectro`, `diag`) and the review rule says every task keeps at least 32 bytes. The two-then-three step discovery (wdt, then heap, then margins) is intended: each fix reveals the next finding.

## 3. Kernel additions
**None.** Everything exists: ops `wa()` / `wr()` (`wdtAdd` / `wdtReset`), the lesson field `wdtTimeout`, `allocFrame` (1 ms, stack 200, takes 2048 B of heap), `freeFrame` (1 ms, stack 100, gives 2048 B back), `logStatus` (3 ms, stack 1100), `logToFlash` (blocks 20 ms, 4 ms CPU, stack 1400, crashes in an ISR). Facts the builders must respect (all measured):
- `wa()` re-arms the watchdog every time the line runs (`K.wdt.set(r, K.t)`), `wr()` resets it; a subscribed task trips when `t - seen >= wdtTimeout`. The message names the task and always prints `(CPU 0)`, even for tasks on core 1 (kernel text, not changed). The run ends at the first trip (there is no recovery in the game; in a real build the panic handler would reset the chip or dump the core).
- `wa()` inside the loop re-arms on every pass; in real ESP-IDF `esp_task_wdt_add(NULL)` is called **once before** the `for (;;)` and only `esp_task_wdt_reset()` is in the loop. The editor prints it inside the loop; the theory must say so (open risk 2).
- A task's stack need is 768 + its deepest function. A task that never calls a function (`beacon`, `heart`) shows peak 768 of 768 (0 B spare when its stack is 768). The overflow crash text is `***ERROR*** A stack overflow in task <name> has been detected.`
- The CPU gauge in `src/main.js` must show the busiest core (stage 13 builder work, section 3 of `specs/stage-13.md`); nothing new here.
- `diag` must live on core 0 (core 1 is at 95%: a task there crashes the run at 857 ms with the IDLE1 watchdog).
- Real-world scaling for the theory: 300 ms watchdog and 150 ms snapshots are scaled for the 1 s test; real watchdog timeouts are seconds, real tasks keep hundreds of bytes of margin (the game uses 32 because its stacks are tiny); a 2 KB heap buffer is a realistic leak size.

## 4. Programs
Start (`start(prev)`, `prev` = stage 13 solution; edits to units found by name, then one new task):
```js
const p = clone(prev || stage13.solution());
byName(p, 'motor').code     = [wa(), c('motorStep'), d(8), wr()];
byName(p, 'camera').code    = [wa(), d(240), c('compressFrame'), d(240), wr()];
byName(p, 'science').code   = [wa(), c('readSample'), sn('samples'), wr()];
p.units.push(task('diag', 1, [un(150), c('allocFrame'), c('logStatus'), c('logToFlash')], { stack: 2200, core: 0 }));   // unit 27
return p;
```
(Stage 13's `start` prev is its solution; every other unit is untouched, including `hz_lock`, vision, fusion.) RAM 43320 = stage 13 41120 + diag 2200. The start crashes at 318 ms (camera).
Reference solution (`solution()` builds on `stage13.solution()`, same edits plus the fixes):
```js
const p = stage13.solution();
byName(p, 'motor').code  = [wa(), c('motorStep'), d(8), wr()];              // motor stays watched: it must run every 8 ms
// camera: no watchdog (a 540 ms loop by design); science: no watchdog (it waits for the instrument)
p.units.push(task('diag', 1, [un(150), c('allocFrame'), c('logStatus'), c('logToFlash'), c('freeFrame')], { stack: 2200, core: 0 }));
byName(p, 'beacon').stack = 800; byName(p, 'heart').stack = 800; byName(p, 'motor').stack = 1100; byName(p, 'spectro').stack = 1300;
return p;
```
(camera and science keep their stage 12/13 code `[d(240), c('compressFrame'), d(240)]` and `[c('readSample'), sn('samples')]`.) ESP-IDF form: `esp_task_wdt_add(NULL)` once before the loop of `motor` and `esp_task_wdt_reset()` at its end; `free(frame)` after `esp_flash` write in `diag`; `xTaskCreatePinnedToCore(beacon, "beacon", 800, ...)`. Player edits: delete `wa`/`wr` from `camera` and `science` (4 lines), add `freeFrame` to `diag` (1 line), change four stack sizes. Reachability: no kernel objects needed; `wdtAdd`/`wdtReset` and `freeFrame` must be in `ops`/`fns`. Stack margin needs: `beacon` and `heart` 768 + 32 = 800, `motor` 1068 + 32 = 1100, `spectro` 1268 + 32 = 1300, `diag` 2168 + 32 = 2200 (already in the start).
Measured solution timeline: `diag` wakes at 150, 300, ... 900 (six snapshots), `logToFlash` ends 50 ms after each slot (waits 20 ms on flash, shares core 0 with vision/fusion).

## 5. Objectives (goals, in order) and checks
Helpers inside `check`: `sub = [...K.wdt.keys()]`, `names = sub.map(u => u.name)`, `feeds = sub.every(u => u.code.some(i => i.op === 'wdtReset'))`, `spare = K.units.filter(u => u.kind === 'task').map(u => ({ n: u.name, s: u.stack - u.hw }))`, `thin = spare.filter(x => x.s < 32)`, `lg = E_(K,'logToFlash')`, `ll = lg.map((t, i) => t - 150 * (i + 1))`, stage 13 helpers `pub, pl, rd, rl, fu, torn, stuckHz` exactly as in `specs/stage-13.md` section 5, `r12 = stage12.check(K)` (the pathfinder lesson's own check: 11 entries), `mx = a => a.length ? Math.max(...a) : -1`.
| # | Goal text | Check | Start | Solution |
|---|---|---|---|---|
| 0 | `Watchdog: no task reset by the watchdog, the motor task still watched, and every watched task feeds it` | `names.includes('motor') && feeds`, text `watched: ${names.join(', ') \|\| 'nobody'}` | crash task_wdt at 318 ms (camera) | watched: motor ok |
| 1 | `Heap: all frames given back, never more than the 8192 B that exist` | `K.heap >= 6144 && K.heap <= 8192`, text `${K.heap} B heap free at the end` | crash `pvPortMalloc` at 637 (after fixing 0) | 8192 ok |
| 2 | `Stack margin: every task keeps at least 32 B of unused stack` | `thin.length === 0`, text `thin.length ? thin.map(x => \`${x.n} ${x.s} B\`).join(', ') : \`least spare ${Math.min(...spare.map(x => x.s))} B\`` | not reached (with 0 and 1 fixed: beacon 0 B, heart 0 B, motor 20 B, spectro 12 B) | least spare 32 B ok |
| 3 | `Diagnostics: at least 6 snapshots written to flash, each within 100 ms of its 150 ms slot` | `lg.length >= 6 && ll.every(x => x >= 0 && x <= 100)`, text `${lg.length} snapshots, worst delay ${mx(ll)} ms` | not reached | 6, worst 50 ms ok |
| 4 | `Still working from stage 13: 18 hazard frames within 25 ms and 18 reads within 15 ms of their 50 ms slots, never torn, nobody stuck on hz_lock` | `pub.length >= 18 && pl.every(x => x >= 0 && x <= 25) && rd.length >= 18 && fu.length >= 18 && rl.every(x => x >= 0 && x <= 15) && torn === 0 && stuckHz.length === 0`, text `${pub.length} frames worst ${mx(pl)} ms, ${rd.length} reads worst ${mx(rl)} ms, ${torn} torn` | not reached | 19 frames worst 20, 19 reads worst 13, 0 torn ok |
| 5 | `Still working from stage 12: all 9 bus exchanges within 30 ms of their slot, at least 4 weather reports, no call without its lock` | `r12[0][0] && r12[1][0] && r12[2][0]`, texts joined `; ` | not reached | delays 5, 9, 4, 13, 5, 4, 4, 5, 5; 5 reports; 0 ok |
| 6 | `Still working from stages 10 and 11: both photographs and focus checks done, uplink accepted once per window` | `r12[3][0] && r12[4][0]` | not reached | 2, 2, 0 stuck; accepted at 692, 869 ok |
| 7 | `Still working from stage 9: every packet handled within 60 ms, mast stowed once per pass, unfolded twice` | `r12[5][0]` (text as stage 12) | not reached | ok |
| 8 | `Still working from stages 7 and 8: no ISR longer than 1 ms, motors stopped within 3 ms of both impacts, thermal check within 150 ms` | `r12[6][0]` | not reached | ok |
| 9 | `Still working from stages 5 and 6: no I2C collisions, IMU at least 45 reads never 40 ms apart, all 10 samples transmitted in order` | `r12[7][0] && r12[8][0]` | not reached | 0, 50, 30; 10 ok |
| 10 | `Still working from stages 1 to 4: mapper frees its frames, spectrometer 47 to 53 samples, motor never more than 11 ms between steps, telemetry never more than 105 ms apart, BEACON and HEART on time` | `r12[9][0] && r12[10][0]` | not reached | 4 frames, 3 paths, 8192 B; 50 samples; motor 10, telemetry 104 ok |

Margins (deterministic simulator): objective 0 is structural; objective 1 has 2048 B per leaked frame; objective 3 limit 100 against 50 (the legal variant "free before logging" measures 73); objective 4 inherits stage 13's thin spots (15 against 13, 25 against 20) and is exactly what a diag at priority 2 or 3 breaks (26 ms / 17 ms); the old stage 2 margins (motor gap 10 vs 11, telemetry 104 vs 105) are untouched because core 1 is untouched. Do not change `T`, periods, `d(8)`, priorities or `wdtTimeout`.

## 6. Bonus
`B(74, 43464)`. Solution: CPU **71%**, RAM **43416 B** (3 stars). Lean limit is 48 B above the solution (a 64 B margin on the four tasks gives 43544: 2 stars; every stack at 4096 gives 103776: 2 stars). CPU: every correct design measures 71 (diag adds 3 points to stage 13's 68), so only Lean discriminates, as in stages 8 to 13.

## 6b. Chart
- Start: crash run (319 ms), AUTO zoom **2x** (densest row `spectro` 16.8 changes per 100 px), **500 ms visible** (the whole run). After the first fix (385 ms crash): 2x. Heap crash run (638 ms): 2x, `spectro` 31.5. Solution: **4x**, densest row `spectro` 50.2, **250 ms visible at once**. No zoom problem.
- The learner sees in the start: `camera` blocked-for-time bars with no run at 300 ms and the red watchdog line at 318 ms (the game scrolls to the crash). Later: `diag` runs every 150 ms (amber ticks from `chartGrid: { unit: 'diag', period: 150 }`, readable at 1x: 0.8 px per ms x 150 = 120 px), the faults row is empty; the stack and heap findings are in the serial `[result]` line and the stack table, not in the chart (hence the evidence below marks the first run of the thinnest task).
- `evidence(K)` (returns `[]` on a crash; checked on the solution, all alts and every non-crash wrong answer):
```js
evidence: K => {
  if (K.crash) return [];
  const sub = [...K.wdt.keys()], first = u => { let t = 0; while (t < K.end - 1 && u.tr[t] !== 1 && u.tr[t] !== 4) t++; return t; };
  const unfed = sub.find(u => !u.code.some(i => i.op === 'wdtReset'));
  if (unfed) return [{ unit: unfed.name, from: first(unfed), to: Math.min(first(unfed) + 30, K.end - 1), label: `${unfed.name} called esp_task_wdt_add() but never calls esp_task_wdt_reset()` }];
  if (!sub.some(u => u.name === 'motor')) { const m = K.units.find(u => u.name === 'motor'); return [{ unit: 'motor', from: first(m), to: Math.min(first(m) + 30, K.end - 1), label: 'motor is not watched: a hung motor task would go unnoticed' }]; }
  if (K.heap > 8192) { const dg = K.units.find(u => u.name === 'diag'); return [{ unit: 'diag', from: first(dg), to: K.end - 1, label: `heap grew to ${K.heap} B: more was freed than was allocated (diag frees twice)` }]; }
  if (K.heap < 6144) { const dg = K.units.find(u => u.name === 'diag'); return [{ unit: 'diag', from: first(dg), to: K.end - 1, label: `heap down to ${K.heap} B: ${Math.round((8192 - K.heap) / 2048)} frame(s) taken by diag and never freed` }]; }
  const th = K.units.filter(u => u.kind === 'task').map(u => ({ u, s: u.stack - u.hw })).filter(x => x.s < 32).sort((a, b) => a.s - b.s)[0];
  if (th) return [{ unit: th.u.name, from: first(th.u), to: Math.min(first(th.u) + 12, K.end - 1), label: `${th.u.name}: peak stack use ${th.u.hw} of ${th.u.stack} B, only ${th.s} B spare` }];
  const lg = E_(K, 'logToFlash'); let w = -1, wl = 100;
  lg.forEach((t, i) => { const l = t - 150 * (i + 1); if (l > wl) { wl = l; w = i; } });
  if (w >= 0) return [{ unit: 'diag', from: 150 * (w + 1), to: lg[w], label: `snapshot ${wl} ms after its slot` }];
  if (lg.length < 6) return [{ unit: 'diag', from: 0, to: K.end - 1, label: `only ${lg.length} snapshots written to flash` }];
  // then the stage 13 / stage 12 rules, in this order: torn hazard record (fusion, "hazard record torn N times"),
  // late hazard read > 15 ms (fusion), late hazard frame > 25 ms (vision), bus exchange > 30 ms late (bus_mgr),
  // motor gap > 11 ms (motor), exactly as in specs/stage-13.md section 6b; return [] when nothing is wrong.
}
```
Measured: motor with `wa` only -> motor 0 to 30 "motor called esp_task_wdt_add() but never calls ..."; no `wa` anywhere -> motor 0 to 30 "motor is not watched"; diag unfreed with period 300 -> diag 0 to 999 "heap down to 2048 B: 3 frame(s) ..."; free twice -> heap 20480, diag "heap grew to 20480 B"; thin stacks -> beacon 0 to 12 "peak stack use 768 of 768 B, only 0 B spare"; diag period 300 (freed) -> diag 450 to 950 "snapshot 500 ms after its slot"; diag empty -> diag 0 to 999 "only 0 snapshots"; diag prio 2 -> vision 150 to 176 "26 ms after its slot"; diag prio 3 -> fusion 150 to 167 "hazard read 17 ms"; no hz_lock -> fusion 58 to 70 "torn 19 times"; solution and alts -> `[]`. (Rows that crash return `[]`.)

## 7. Wrong answers
Mutations of the solution (found by name; `unwd(u)` removes every `wdtAdd`/`wdtReset` of `u`). All measured, T = 1000.
| Name | Mutation | Fails / crash | Measured | `says` |
|---|---|---|---|---|
| the start (camera and science still watched) | the start program | crash `task_wdt` | camera at 318 ms | (crash) |
| camera fixed, science still watched | science `[wa(), c('readSample'), sn('samples'), wr()]` | crash `task_wdt` | science at 385 ms | (crash) |
| watch the arm too | arm code `[wa(), ...arm.code, wr()]` | crash `task_wdt` | arm at 304 ms (it sleeps 640 and 10000 ms) | (crash) |
| diag on the full core | `diag.core = 1` | crash `task_wdt` | IDLE1 at 857 ms | (crash) |
| diag spins | `diag.code = [bz(700), ...]` | crash `task_wdt` | IDLE0 at 599 ms | (crash) |
| leak left | `diag.code = [un(150), allocFrame, logStatus, logToFlash]` | crash `pvPortMalloc` | NULL at 637 ms | (crash) |
| diag stack 2048 | `diag.stack = 2048` | crash `stack overflow` | task diag at 176 ms | (crash) |
| watchdog removed everywhere | `unwd(motor)` | 0 | watched: nobody | `noWatch` |
| subscribed but never fed | `motor.code = [wa(), c('motorStep'), d(8)]` | 0 | motor watched, no `esp_task_wdt_reset` | `neverFeeds` |
| diag frees twice | `diag.code = [..., freeFrame, freeFrame]` | 1 | 20480 B heap free | `doubleFree` |
| stacks left tight | beacon 768, heart 768, motor 1088, spectro 1280 | 2 | beacon 0 B, heart 0 B, motor 20 B, spectro 12 B | `thinStack` |
| only one stack fixed | all stacks of the solution except `spectro = 1280` | 2 | spectro 12 B | `thinStack` |
| diag stack exactly at the peak | `diag.stack = 2168` | 2 | diag 0 B | `thinStack` |
| diagnostics on the slow side | `diag.code[0] = un(300)` (with `freeFrame`) | 3 | 3 snapshots, worst delay 500 ms | `fewLogs` |
| diagnostics removed | `diag.code = [un(150)]` | 3 | 0 snapshots | `fewLogs` |
| diag at priority 3 | `diag.prio = 3` | 4 | frames worst 24, reads worst 17 (limit 15) | `diagHog` |
| diag at priority 2 | `diag.prio = 2` | 4 | frames worst 26 (limit 25) | `diagHog` |
| hazard lock removed | vision and fusion lose their `take`/`give` | 4, 5 | 19 torn reads (regression of stage 13) | `regress` |

Accepted correct designs for `alts` (all pass every objective, measured):
| Name | Mutation | Stars | Measured |
|---|---|---|---|
| camera kept on the watchdog, fed between phases | `camera.code = [wa(), d(240), wr(), c('compressFrame'), wr(), d(240)]` | 3 | watched: motor, camera; RAM 43416 |
| telemetry watched too | `telemetry.code = [wa(), c('sendTelemetry'), d(85), wr()]` | 3 | watched: motor, telemetry |
| vision watched too | `vision.code = [wa(), ...vision.code, wr()]` | 3 | watched: motor, vision |
| motor fed in the middle of its loop | `motor.code = [wa(), c('motorStep'), wr(), d(8)]` | 3 | ok |
| diag frees before logging | `diag.code = [un(150), allocFrame, logStatus, freeFrame, logToFlash]` | 3 | worst snapshot delay 73 ms |
| diag watched | `diag.code = [wa(), ...diag.code, wr()]` | 3 | watched: motor, diag |
| 64 B margins | beacon 832, heart 832, motor 1132, spectro 1332 | 2 | RAM 43544 |
| every stack 4096 | all tasks `stack = 4096` | 2 | RAM 103776 |

## 8. Reactions (keys and `diagnose` logic)
Keys: `noWatch`, `neverFeeds`, `doubleFree`, `thinStack`, `fewLogs`, `diagHog`, `regress`, `stack`, `heap`, plus the four the verifier demands (`watchdog`, `crash`, `fail`, `pass`). Code (tested against every row of section 7):
```js
diagnose: (K, res) => {
  if (K.crash && /stack overflow/.test(K.crash.msg)) return reactions.stack;
  if (K.crash && /pvPortMalloc/.test(K.crash.msg)) return reactions.heap;
  if (K.crash && /task_wdt/.test(K.crash.msg)) return reactions.watchdog;
  if (K.crash) return reactions.fail;
  if (!res[0][0]) {
    const sub = [...K.wdt.keys()];
    return sub.some(u => !u.code.some(i => i.op === 'wdtReset')) ? reactions.neverFeeds : reactions.noWatch;
  }
  if (!res[1][0]) return reactions.doubleFree;
  if (!res[2][0]) return reactions.thinStack;
  if (!res[3][0]) return reactions.fewLogs;
  if (!res[4][0]) { const dg = K.units.find(u => u.name === 'diag'); return dg.base > 1 ? reactions.diagHog : reactions.regress; }
  return res.slice(5).some(r => !r[0]) ? reactions.regress : reactions.fail;
}
```
Meaning: `watchdog` (the game answers every `task_wdt` crash with it, first time lines 0 and 1, later line 1; the copy must cover all cases seen: the named task has a loop longer than the timeout or blocks for hardware, so unsubscribe it or feed between phases; a task on core 0 that never blocks starves IDLE0; `IDLE1` means the full core: move work to core 0), `heap` ("`pvPortMalloc` returned NULL": something allocated and never freed; find the task whose allocations outnumber its frees, check `heap_caps_get_free_size`), `stack` (read the peak use in the table), `noWatch` (a watchdog nobody subscribes to protects nothing: the motor must be watched), `neverFeeds` (subscribing without resetting is a reset waiting to happen), `doubleFree` (free more than you took: heap corruption), `thinStack` (spare under 32 B: name the tasks from the stack table, size = peak + margin), `fewLogs` (diagnostics too slow or missing), `diagHog` (housekeeping at a high priority starves the vision path; priority 1 on core 0 is enough), `regress` (an older stage broke).

## 9. Theory outline (6 sections, one check question each)
1. **The review checklist**: what "flight ready" means for firmware: nothing waits for ever, nothing leaks, nothing is one byte from overflow, and when something fails the rover knows and says why. SVG: a checklist with the three findings (watchdog, heap, margin) and the tools that prove each. Widget: "finding board": click a symptom (reset at 318 ms, NULL from malloc, 0 B unused stack) and see which tool and which section answers it. Check: "Which of these is a symptom of a heap leak rather than a stack problem?" (`pvPortMalloc` returns NULL after several cycles).
2. **The task watchdog**: `esp_task_wdt_add(NULL)` once before the loop, `esp_task_wdt_reset()` once per pass of the loop, timeout, panic action, the idle-task check from stage 13 (`IDLE0/IDLE1`). A task is watched because it must run regularly, not because it exists. SVG: timeline of a watched task feeding every 100 ms and a hung one missing the 300 ms deadline. Widget: timeout and loop-length sliders with the verdict "fed in time / bitten" for `motor` (8 ms), `camera` (540 ms) and `science` (420 ms wait). Check: "A task blocks 420 ms waiting for hardware by design. Should it be subscribed to a 300 ms watchdog?" (no; or feed it in a loop that wakes up more often).
3. **Feeding the dog honestly**: reset from the task's own loop after real work, never from a timer or another task (it hides a hung task), never reset "just in case" at the top; a longer timeout hides problems; the camera design (reset between phases) versus unsubscribing. SVG: three loops (honest, reset at the top, reset from a timer). Widget: edit a loop by choosing where `wr()` goes and see whether a hang is still caught. Check: "Why is calling `esp_task_wdt_reset()` from a periodic timer callback a bad idea?" (the timer keeps running while the real task is hung).
4. **Stack margins**: high-water mark (`uxTaskGetStackHighWaterMark`), margin policy (peak plus a margin, never exactly the peak), why the peak you measure is a lower bound (a path that ran, not the worst path), `CONFIG_FREERTOS_CHECK_STACKOVERFLOW`. SVG: stack bar with the peak, the margin and the limit for `diag`. Widget: slider for stack size per task with the table of spare bytes and the 32 B rule. Check: "A task shows 12 B unused after a full test run. Is it safe?" (no: the worst path may not have run).
5. **Heap and leaks**: `heap_caps_get_free_size`, `esp_get_minimum_free_heap_size`, why a leak shows up late, allocate/free pairs, a double free, fragmentation, heap tracing (`CONFIG_HEAP_TRACING`). SVG: free heap falling 2 KB per cycle until NULL at 637 ms. Widget: pick the instruction that frees the frame and watch the heap curve flatten (and rise above the top when freed twice). Check: "Free heap goes down by 2048 B every 150 ms and never up. Which instruction is missing?" (`free` / `freeFrame` in `diag`).
6. **Diagnostics that do not hurt**: snapshot at low priority on the spare core, time and size budget, flash writes block (`logToFlash` never from an ISR), core dumps and `esp_system` reset reasons, `vTaskList` / run-time stats, the final review. SVG: the solution chart with `diag` every 150 ms under vision and fusion. Widget: priority selector for `diag` (1, 2, 3) with vision's worst delay against the 25 ms limit. Check: "Why must the snapshot task have a low priority?" (it must not delay the real-time tasks; it can wait).

Facts to verify against ESP-IDF documentation (mark `VERIFY:` in the draft):
- `esp_task_wdt_add(NULL)` subscribes the calling task; calling it again from the loop (what the game's editor shows) is an error in real code (`ESP_ERR_INVALID_ARG`/`ESP_ERR_INVALID_STATE`), so say "once, before the loop"; default timeout `CONFIG_ESP_TASK_WDT_TIMEOUT_S` = 5 s; panic option `CONFIG_ESP_TASK_WDT_PANIC`; in IDF 5.x init is `esp_task_wdt_init(&config)` with `esp_task_wdt_config_t` and the idle-task checks `CONFIG_ESP_TASK_WDT_CHECK_IDLE_TASK_CPU0/1`.
- `uxTaskGetStackHighWaterMark` returns the minimum free stack in words (bytes on IDF: `StackType_t` is a byte on Xtensa ports: check); `CONFIG_FREERTOS_CHECK_STACKOVERFLOW_CANARY`, and that the stack-overflow message format matches the game's.
- `heap_caps_get_free_size(MALLOC_CAP_8BIT)`, `esp_get_free_heap_size()`, `esp_get_minimum_free_heap_size()`, `CONFIG_HEAP_TRACING_STANDALONE`; `malloc` returning NULL versus the heap-abort option (`CONFIG_HEAP_ABORT_WHEN_ALLOCATION_FAILS`); the real crash after a failed allocation is a LoadStoreError/StoreProhibited when the NULL is used.
- A flash write blocks other cores' flash-resident code while the cache is disabled; `esp_core_dump` and reset reasons (`esp_reset_reason()`: `ESP_RST_TASK_WDT`, `ESP_RST_PANIC`).
- Whether the real watchdog message prints the CPU of the offending task (the game always prints `CPU 0`).

## 10. Open risks
1. **Stage 13 (and 12) are not built, the base is rebuilt** (stage 12 from `pathfinder.js`, stage 13 from its spec). Everything in section 5 depends on stage 13's exact units: re-measure after `two-brains.js` exists, especially objective 4's thin margins (reads 13 vs 15, frames 20 vs 25) and the three stack spares (`vision` 48 B, `fusion` 32 B: both are exactly at or above the 32 B rule, so `fusion` at 1600 is the least-margin task that already passes).
2. **`wa()` is shown inside the loop.** The kernel re-arms on every pass (and a missing `wr()` is invisible in the simulator for short loops). The verifier-proof check is structural: objective 0 requires `wdtReset` in the code of every subscribed task (reads `u.code`, the same pattern `diagnose` uses). If a builder moves checks to be purely behavioural, the "wa only" wrong answer passes.
3. **The watchdog cannot recover in the game**: the first trip ends the run, so the lesson cannot show "a hung task is detected and the rover restarts". It shows the false positive (healthy task bitten) and the missing subscription instead; the theory covers real recovery.
4. **Timing coupling**: the first trip is `camera` at 318 ms and the second `science` at 385 ms (the first `wa()` of `science` after its last sample at 80 ms plus 300). `arm` or `uplink` subscribed trips at 304 or 325 ms. These depend on `wdtTimeout = 300`; do not change it.
5. **`diag` timing**: it ends 50 ms after each 150 ms slot (it waits 20 ms for flash and is preempted by priority 2 vision and fusion on core 0). Moving it to priority 2 or 3 breaks stage 13's objective (26 ms / 17 ms). A `freeFrame` before `logToFlash` measures 73 ms, so the 100 ms limit is only 27 ms above it.
6. **Only the heap-end value is checked**: `freeFrame` has no double-free check, hence the upper bound `K.heap <= 8192`. A free placed after the alloc and a free before the next alloc both pass; freeing in a different task is not modelled.
7. **The 32 B margin is a game rule**: `beacon` and `heart` run no function, their peak is the 768 B context, and the real task needs a different number. Say so in the theory. The CPU star does not discriminate (all correct designs measure 71%).
8. **Not browser-tested**: the stack table in `main.js` prints peak use and "never used" per task, but it was read from code, not run, and it must be shown after a crashed run too (the player reads the stack findings after fixing the first two). `main.js` CPU gauge issue from stage 13 applies. Units 0 to 26 are unlocked: the player may edit stacks of tasks other than the four (all fine) or move old tasks to core 0 (not measured).
