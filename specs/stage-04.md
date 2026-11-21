# Stage 4 spec: Every Byte Counts

All numbers were measured with `runSim` (L = `{ T: 1500, cores: 1, heap: 8192, pins: ['BEACON','HEART'] }`) on `stage3.solution()` plus the two new tasks. Unit order: beacon, heart, motor, camera, telemetry, spectro, **nav (index 6)**, **mapper (index 7)**.

## 1. Identity
- id: 4
- slug: `every-byte-counts`
- title: Every Byte Counts
- topic: Stacks, heap, high-water marks
- file: `main/rover_main.c`
- T: **1500** (not 3000, see 6b), cores: 1
- `heap: 8192` as a lesson field (free heap left for the application, bytes). `runSim` already reads `L.heap` into `K.heap`.
- pins: `['BEACON', 'HEART']` (no new pin)
- ops: `['gpio', 'call', 'delay', 'until', 'busy']`
- fns: `['planPath', 'allocFrame', 'processFrame', 'freeFrame']` (all already in `F`)

## 2. Story
The navigation team delivered a path planner and the mapping team a terrain mapper. The mapper allocates a 2 KB frame buffer every lap, processes it, and never frees it, so the 8 KB heap is empty after four laps and the next `pvPortMalloc()` returns NULL and the rover panics at 1179 ms. Both teams also copied the default 4096-byte stack from the examples, which makes the firmware 3.3 KB too large for the RAM budget of the flight board, and nobody knows how much stack the new tasks really use. You fix the leak, then use the unused-stack figures in the results to size the stacks with a safety margin.

## 3. Kernel additions
None. Optional UI addition (not required by the verifier): print free heap in the `[result]` line in `src/main.js` (`K.heap` bytes). Everything used already exists: `F.planPath` (cost 20 ms, stack 2400 B), `F.allocFrame` (cost 1, stack 200, takes 2048 B from `K.heap`, panics with the NULL message when too little is left), `F.processFrame` (cost 10, stack 600), `F.freeFrame` (cost 1, stack 100, returns 2048 B). Stack need = 768 + deepest call: nav 3168 B, mapper 1368 B (measured high-water marks). The high-water mark per task is already shown by the game ("unused stack" in the serial `[result]` line and the "peak use" column).

## 4. Programs
`start(prev)`: `clone(prev || stage3.solution())`, then push
```js
task('nav', 1, [c('planPath'), d(250)], { stack: 4096 }),
task('mapper', 1, [c('allocFrame'), c('processFrame'), d(250)], { stack: 4096 })
```
`solution()`: `stage3.solution()` plus
```js
task('nav', 1, [c('planPath'), d(250)], { stack: 3328 }),
task('mapper', 1, [c('allocFrame'), c('processFrame'), c('freeFrame'), d(250)], { stack: 1536 })
```
No priorities are retuned, no objects are needed (so the Reachability rule holds). Margins: nav 3328 - 3168 = 160 B, mapper 1536 - 1368 = 168 B.
ESP-IDF form: `xTaskCreate(nav_task, "nav", 3328, NULL, 1, NULL)`, `uxTaskGetStackHighWaterMark(NULL)` to read the peak, `heap_caps_free_size(MALLOC_CAP_8BIT)` / `esp_get_free_heap_size()` for the heap, `free(frame)` after use.

## 5. Objectives (goals, in order) and checks
Helpers: `mp = E_(K,'processFrame').length`, `pl = E_(K,'planPath').length`, `sp = S_(K,'sampleSpectrometer').length`, `nm` = units named `nav` or `mapper`, `room = Math.min(...nm.map(u => u.stack - u.hw))`, `steady` and `seen` as in stage 3. When the run crashes there are no results, so values below for the start are "crash".

| # | Goal text | Check | Start | Solution |
|---|---|---|---|---|
| 0 | `Mapper: at least 5 frames processed in 1.5 s` | `mp >= 5`, text `${mp} frames` | crash at 1179 ms | 6 ok |
| 1 | `Navigation: at least 4 paths planned in 1.5 s` | `pl >= 4`, text `${pl} paths` | crash | 5 ok |
| 2 | `No leak: at most one 2048 B frame still allocated when the test ends` | `K.heap >= 8192 - 2048`, text `${K.heap} B of heap free` | crash (0 B at panic) | 8192 ok |
| 3 | `Memory budget: stacks and kernel objects use at most 14500 bytes of RAM` | `K.m.ram <= 14500`, text `${K.m.ram} B of RAM` | 16448 -> fail | 13120 ok |
| 4 | `Stack headroom: nav and mapper keep at least 128 bytes of stack unused at their peak` | `room >= 128`, text `smallest free stack ${room} B` | 928 ok | 160 ok |
| 5 | `Still working from stage 3: spectrometer 72 to 78 samples started in 1.5 s` | `sp >= 72 && sp <= 78`, text `${sp} samples` | 75 | 75 ok |
| 6 | `Still working from stage 2: motor never more than 11 ms between steps, telemetry never more than 105 ms between packets, at least 13 sent` | `mg <= 11 && tg <= 105 && tl.length >= 13`, text `motor gap ${mg} ms, telemetry gap ${tg} ms, ${n} packets` | - | 10, 100, 15 ok |
| 7 | `Still working from stage 1: BEACON every 500 ms and HEART every 200 ms (within 3 ms)` | `steady(b,500,2) && steady(h,200,6)` | - | ok |

Drift of the spectrometer is not checked: with two more priority 1 tasks the worst drift is 47 ms (stage 3 allowed 25), while the average rate stays exact (75 samples). Objective 5 therefore checks the rate. Boundary note: objective 2 allows one frame in flight because the test can end between `allocFrame` and `freeFrame` (end heap is 8192 or 6144 in correct runs, measured).

## 6. Bonus
`B(92, 13500)`.
- Solution: CPU 88%, RAM 13120 B: both stars.
- Fix the leak only (4096/4096): RAM 16448, fails objective 3 (no pass).
- Leak fixed, nav 4096, mapper 1536 (alt): RAM 13888 > 13500, CPU 88: **2 stars** (misses Lean).
- Nav 3584, mapper 1536: RAM 13376, 3 stars. Nav 3840: 13632, 2 stars.
- Tight margins nav 3296 / mapper 1496: RAM 13048, smallest free 128: 3 stars.
- CPU discriminator: polling at 100 ms (nav and mapper `d(100)`) gives CPU 95% (misses Efficient, passes the rest, 2 stars; end heap 6144 B). Nav at 150 ms gives 91%.
- Margins are small because every stack variant has the same CPU, and the RAM spread is only 3.3 KB: the solution clears RAM by 380 B (2.8%) and CPU by 4 points.

## 6b. Chart
- T is 1500 because the stage 3 spectrometer row makes any 3000 ms run need 16x. At T = 1500 the busiest row is `spectro`.
- Start: crashes at 1179 ms; busiest row spectro 62.9 changes/100 px, **AUTO zoom 4x, 375 ms visible**.
- Solution: spectro 82 changes/100 px, **AUTO zoom 8x, 188 ms visible**.
- The leak run that does not crash (wrong answer 4) is also 8x.
- `evidence(K)`: crashes have no evidence (the serial monitor carries the message, and the mapper row ends at the panic). For a non-crash run with objective 2 unmet:
```js
evidence: K => { const a = S_(K,'allocFrame'); if (K.heap >= 8192 - 2048 || !a.length) return [];
  const n = a.length - E_(K,'freeFrame').length;
  return [{ unit: 'mapper', from: a[0], to: K.end - 1, label: `${n} frame buffers allocated and never freed, ${K.heap} B of 8192 B heap left` }]; }
```
- `chartGrid`: none (neither task is a fixed-rate stage objective). `powerMarks`: none.

## 7. Wrong answers (replayed on the solution; `p.units[6]` nav, `p.units[7]` mapper)
| name | apply | result (measured) | says |
|---|---|---|---|
| mapper never frees (the original bug) | `units[7].code.splice(2,1)` | crash at 1179 ms, `/pvPortMalloc/` | (crash reaction) |
| nav stack guessed at 3072 | `units[6].stack = 3072` | crash at 18 ms, `/stack overflow/` | (crash reaction) |
| mapper stack 1024 | `units[7].stack = 1024` | crash at 25 ms, `/stack overflow/` | (crash reaction) |
| leak hidden by a slow loop | `units[7].code = [c('allocFrame'), c('processFrame'), d(400)]` | no crash; fails #0 (4 frames) and #2 (0 B free); rest ok, cpu 87% | `leak` |
| stacks sized exactly to the peak | `units[6].stack = 3168; units[7].stack = 1368` | no crash; fails only #4 (smallest free 0 B); RAM 12792 | `headroom` |
| stacks left at 4096 | `units[6].stack = 4096; units[7].stack = 4096` | no crash; fails only #3 (16448 B) | `budget` |
| nav above everything | `units[6].prio = 5` | no crash; fails #6 (motor gap 30 ms, telemetry gap 110 ms) and #7 (lights); #5 holds (75) | `hog` |

Also measured: mapper at priority 5 fails #6 (motor 22, telemetry 112); nav at priority 3 fails #6 (motor 12, telemetry 119); removing `processFrame` fails #0 (0 frames).
Alternatives for `alts`: `{ name: 'tight margins', stars: 3, apply: nav.stack = 3296, mapper.stack = 1496 }`; `{ name: 'nav keeps its 4096', stars: 2, apply: units[6].stack = 4096 }`; `{ name: 'slower loops', stars: 3, apply: units[6].code[1] = d(400); units[7].code[3] = d(300) }` (5 frames, 4 paths, CPU 87%).

## 8. Reactions
Required: `watchdog`, `crash`, `fail`, `pass`. Stage specific, in `diagnose(K, res)` order:
- `leak`: `!res[0][0] || !res[2][0]` (no crash because crashes bypass diagnose). Heap is draining: every lap takes 2048 B and nothing returns it. Mention reading the free heap in the evidence label and pairing every `pvPortMalloc` with a `vPortFree`.
- `headroom`: `!res[4][0]`. Stack sized exactly to the peak has no margin: a different input or a later change (one more local, a log call) overflows it. Keep 10 percent or more.
- `budget`: `!res[3][0]`. Everything works but the board does not have the RAM: read "peak use" / "never used" per task and cut the stacks to the peak plus margin.
- `hog`: `!res[5][0] || !res[6][0] || !res[7][0]`. The new tasks must not break stages 1 to 3; priority is not the tool here. Say the leak and stack problems are not scheduling problems.
- `fail` for anything else, `pass` when all ok. Crash messages: `crash` generic; the verifier needs only the four required keys.
- Case `!res[1][0]` (fewer than 4 paths) falls to `fail`; the reply must say nav ran too slowly or not at all.

## 9. Theory outline
1. **Where the RAM goes: stack, heap, static** - diagram: memory map with one stack per task, the heap, the TCB. Widget: existing `heap` widget (task creation) or a variant with a RAM-budget bar; check: what does `xTaskCreate(..., 4096, ...)` take from the heap besides the stack?
2. **What lives on a task's stack** - diagram: stack growing downward, frames of nested calls, locals, saved registers, ISR/context-save area (the 768 B base in the game). Widget: call-depth slider that fills the stack bar and overflows. Check: what happens first when a function needs 200 B more than is left?
3. **Stack overflow: how it is detected and what it looks like** - diagram: canary bytes at the stack end, the `***ERROR*** A stack overflow in task X has been detected` panic. Widget: stack bar vs size choice. Check: is the overflow always caught at once? (`CONFIG_FREERTOS_CHECK_STACKOVERFLOW`, canary and watchpoint methods.)
4. **High-water marks: measure, do not guess** - diagram: peak line inside a stack bar. Widget: "never used" table like the result screen, user sets size = peak + margin. Check: a task reports 180 B high-water mark free; how much margin did it have?
5. **The heap: malloc, free, leaks and fragmentation** - diagram: heap bar filling up every lap for the leak, and a checkerboard of free holes for fragmentation. Widget: leak simulator (lap period, buffer size, heap size shows time to NULL). Check: what returns NULL, and what happens if the code does not check it?
6. **Budgets and margins** - diagram: RAM budget bar split per task. Widget: stack-sizing slider with budget line and overflow danger zone. Check: why not size to the exact peak?
7. (optional) **Real ESP-IDF tools** - `uxTaskGetStackHighWaterMark`, `esp_get_free_heap_size`, `esp_get_minimum_free_heap_size`, `heap_caps_get_largest_free_block`, `idf.py size`, static task allocation (`xTaskCreateStatic`).

Facts to verify against ESP-IDF documentation:
- In ESP-IDF the `xTaskCreate` stack depth argument is in **bytes** (not words as in vanilla FreeRTOS); a stack of 4096 B is typical; minimum stack size `configMINIMAL_STACK_SIZE`.
- `uxTaskGetStackHighWaterMark()` returns the minimum free stack ever seen, in bytes in ESP-IDF; `uxTaskGetStackHighWaterMarkBytes` in newer versions.
- Stack overflow check methods (`CONFIG_FREERTOS_CHECK_STACKOVERFLOW_PTRVAL` / `_CANARY`; watchpoint on the stack end) and the exact panic text `***ERROR*** A stack overflow in task %s has been detected.`
- Heap: `esp_get_free_heap_size()`, `esp_get_minimum_free_heap_size()` (low-water mark), `heap_caps_get_largest_free_block()`, `malloc` returning NULL and `CONFIG_HEAP_ABORT_WHEN_ALLOCATION_FAILS`, heap-poisoning and tracing options for leak finding.
- The game's 768 B base stack, 96 B per kernel object and the 8 KB "application heap" are simplifications (a real ESP32 has about 300 KB of heap) and the theory must say so. The game states stack in bytes and the 2048 B frame buffer is a game number.

## 10. Open risks
- Two failures in one stage: the starting code only shows the leak crash. The stack and budget lessons arrive through objectives 3 and 4 and the result table, not through a crash. If a learner shrinks a stack too far they get the stack overflow panic (wrong answers 2 and 3), which covers that case. Briefing must tell them to read the "never used" figures.
- Objective 3 (RAM 14500) is a one-star objective while the RAM star is 13500: the span between them is only 1 KB. Both measured, but the difference is small. Stage 4 changes the RAM of later stages: the stage 5 starting RAM is 13120 B for the reference.
- Objective 2 tolerates one frame in flight (boundary measured: end heap 8192 or 6144 in correct runs). A learner who frees only every other lap cannot do that with these ops, so no such wrong answer exists.
- The kernel does not model use-after-free (`freeFrame` before `processFrame` passes). Not offered as a wrong answer; the theory can mention it as a warning only.
- Spectrometer drift is 47 ms here (stage 3 limit 25) because nav and mapper share priority 1 with the camera; objective 5 deliberately checks the rate only. Camera frames drop to 5 in 1.5 s and are not checked.
- The stack margin check (128 B) applies to nav and mapper only. The stage 2 lights tasks run on a 768 B stack with zero margin; the spec does not ask the player to fix that.
- Fact list in section 9 is unverified against the live docs.
