# Stage 9 spec: Fold the Antenna

All numbers were measured with `runSim` (scratch script `specs/tmp-09.js`, deleted). Neither the stage 7 nor the stage 8 lesson file existed, so the base is the stage 8 reference solution built from `specs/stage-08.md` section 4: `stage6.solution()` (`spec-one-bus-two-masters.js`, which already holds `i2c_lock`, `imu` 10, `thermo` 11) + ISR `onBump` = `[stopMotors, ngi('bumper')]` (unit 12) + task `bumper` prio 1, stack 1280 = `[nt(-1, 0), checkThermals]` (unit 13); no `bump_sem`. (`stage8.solution()` measures CPU 97%, RAM 20864 with the stage 9 irqs but no antenna.)
L = `{ T: 1000, cores: 1, heap: 8192, pins: ['BEACON','HEART'], irqs: { onBump: [150, 152], onPacket: [100, 420, 500, 580] } }`.
Unit order: beacon 0, heart 1, motor 2, camera 3, telemetry 4, spectro 5, nav 6, mapper 7, science 8, radio 9, imu 10, thermo 11, onBump 12 (isr), bumper 13, **onPacket 14 (isr)**, **antenna 15 (task)**, **onStow 16 (timer callback)**. Priorities: beacon/heart 4, motor 3, telemetry/science/imu/thermo 2, camera/spectro/nav/mapper/radio/bumper/antenna 1.

## 1. Identity
- id: 9
- slug: `fold-the-antenna`
- title: Fold the Antenna
- topic: Software timers and the timer service task (xTimerCreate, one-shot vs auto-reload, xTimerReset as a restartable timeout, callbacks must never block, the timer service task)
- file: `main/rover_main.c`
- T: **1000**, cores: 1, `heap: 8192`, pins: `['BEACON', 'HEART']`
- irqs: `{ onBump: [150, 152], onPacket: [100, 420, 500, 580] }` (one lone packet, then a pass of three packets 80 ms apart; only two impacts, see open risks)
- ops: `['gpio', 'call', 'delay', 'until', 'busy', 'send', 'recv', 'take', 'give', 'giveISR', 'sendISR', 'notifyGive', 'notifyGiveISR', 'notifyTake', 'tReset', 'tStop']`
- fns: `['stopMotors', 'checkThermals', 'deployAntenna', 'stowAntenna', 'handlePacket']` (all already in `F`)
- no `chartGrid`, no `power`.

## 2. Story
The comms team bolted on a high-gain antenna on a folding mast. A ground-station pass sends packets that the rover handles (`handlePacket`, 3 ms) with the mast out, and the mast must fold again 180 to 250 ms after the last packet of a pass, never during the pass (the dust seals wear on every fold). They wrote it the obvious way: the `antenna` task deploys, handles the packet, sleeps 250 ms in `vTaskDelay`, then stows. While it sleeps it cannot read the next packet: in the pass the packets at 500 and 580 ms wait 194 and 377 ms in the queue, and the mast folds and unfolds 4 times for 2 passes (385, 684 and 945 ms). The comms team already created a timer `stow_tmr` (200 ms, one-shot) and its callback `onStow`, but nothing starts them. The fix is a software timer used as a restartable timeout: every packet resets it with `xTimerReset`, and the callback stows once, 200 ms after the last packet.

## 3. Kernel additions
None in `src/kernel.js`. Everything exists: objects `{ type: 'timer', period, auto, cb }`, units `{ kind: 'timer', name, code }` (runs at priority 1 when the timer expires), ops `tReset` (`trs`) and `tStop` (`tst`), `F.deployAntenna` and `F.stowAntenna` (cost 0, push `ant` events with `v` 1 and 0), `F.handlePacket` (cost 3, stack 900), `K.irq`, and the crash texts "xTimerReset() was called inside an ISR. An ISR can never block: only the ...FromISR() functions are allowed there." (measured at 100 ms), "vTaskDelay() tried to block inside a timer callback. Callbacks run in the timer service task, which must never wait." and "transmit() blocks, and it was called from a timer callback."
Facts of the simulator the theory and builders must respect:
- Each `kind: 'timer'` unit is its own priority-1 unit, **not one shared timer service task**. The sim does not model the shared service task, the timer command queue, or one slow callback delaying the others. Say so (or teach it as a diagram only).
- A timer expires at the start of a tick; the callback runs when the scheduler gives priority 1 the CPU (measured: stow 202 to 203 ms after the last packet for a 200 ms period; the 2 to 3 ms is the delay before `trs` ran in the task plus scheduling).
- Editor/lesson plumbing for the builders:
  - **Task cap**: the start has 14 tasks (13 from stage 8 + `antenna`). The cap must already be 14 or higher (stage 7 spec raises it to 14); the player adds none here.
  - The `onPacket` ISR is `static void IRAM_ATTR onPacket(void *arg)` with `xQueueSendFromISR(rx_q, ...)`; the `onStow` unit renders as `static void onStow(TimerHandle_t t)` (editor already does this for `kind: 'timer'`); `stow_tmr` renders as `xTimerCreate("stow_tmr", pdMS_TO_TICKS(200), pdFALSE, NULL, onStow)` with editable period and reload select (already supported in `src/editor.js`).
  - `tReset` needs a `<select>` of timer names and `sendISR`/`recv` of queue names (editor already does).
  - The lesson ops must list `tReset`/`tStop` and `sendISR` (verifier `OPS` already allows them).
- Game-time note: 1 ms ticks (real ESP-IDF default 100 Hz, so a 200 ms period is 20 ticks and cannot be finer than 10 ms). ESP-IDF's timer service task defaults to priority 1 and 2048 words of stack (verify, see section 9).

## 4. Programs
Start (`start(prev)`):
```js
const p = clone(prev || stage8.solution());
p.objs.rx_q = { type: 'queue', len: 4, item: 32 };
p.objs.stow_tmr = { type: 'timer', period: 200, auto: false, cb: 'onStow' };   // created by the comms team, never started
p.units.push({ kind: 'isr', name: 'onPacket', code: [si('rx_q')] });
p.units.push(task('antenna', 1, [rc('rx_q', -1), c('deployAntenna'), c('handlePacket'), d(250), c('stowAntenna')], { stack: 1792 }));
p.units.push({ kind: 'timer', name: 'onStow', code: [c('stowAntenna')] });
```
Reference solution:
```js
const p = stage8.solution();
/* same objs, onPacket and onStow as the start */
p.units.push(task('antenna', 1, [rc('rx_q', -1), c('deployAntenna'), trs('stow_tmr'), c('handlePacket')], { stack: 1792 }));
```
ESP-IDF form: `antenna`: `xQueueReceive(rx_q, &pkt, portMAX_DELAY); deploy_antenna(); xTimerReset(stow_tmr, 0); handle_packet(&pkt);`. Callback: `static void on_stow(TimerHandle_t t) { stow_antenna(); }`. `xTimerReset` on a dormant timer starts it; on a running one it restarts the period.
Stack need of `antenna` = 768 + 900 = 1668; 1792 leaves 124 B.
Reachability: the queue, the timer, `onStow` and `onPacket` are in `start()`. The player edits one task line (delete the `vTaskDelay` and the `stowAntenna` call, add `xTimerReset`). Nothing else.
**Priority 1 is the right one**: the system is ~98% loaded (stage 8 spec). Priority 2 shares with telemetry (telemetry gap 105, exactly the limit), priority 3 and 4 preempt the motor (gap 12 and 13). Packet times are chosen after the first idle slice (about 390 ms): bursts of `handlePacket` before 400 ms starve idle and trip the task watchdog at 599 ms, so keep `irqs` exactly as specified (see risks).

## 5. Objectives (goals, in order) and checks
Helpers: `pk = K.w.irq.onPacket || []`, `hp = E_(K,'handlePacket')`, `lat = pk.map((t, i) => hp[i] === undefined ? -1 : hp[i] - t)`, `ant = K.ev.filter(e => e.k === 'ant')`, `stows = ant.filter(e => e.v === 0).map(e => e.t)`, `deploys` = count of `ant` events with `v === 1` that follow a stowed (or initial) state, `last = [100, 580]` (last packet of each pass: a packet with no other packet within 150 ms after it), `stowLat = last.map(t => (first x of stows with x >= t) - t, or -1)`, `irq = K.w.irq.onBump || []`, `stp = E_(K,'stopMotors')`, `stopLat`, `ck = E_(K,'checkThermals')`, `ckLat = irq.map((t, i) => ck[i] === undefined ? -1 : ck[i] - t)`, `im`, `coll`, `ids`, `lost`, `mp`, `pl`, `sp`, `mg`, `tl`, `tg`, `b`, `h`, `steady`, `f` as in stages 5 to 8.

| # | Goal text | Check | Start | Solution |
|---|---|---|---|---|
| 0 | `Uplink: every packet handled within 60 ms of arriving (4 of 4)` | `pk.length === 4 && lat.every(x => x >= 0 && x <= 60)`, text `packet delays ${lat.join(', ')} ms` (-1 = never) | 29, 10, 194, 377 -> NO | 29, 10, 29, 13 ok |
| 1 | `Antenna: stowed once per pass, 180 to 250 ms after the last packet of each pass` | `stows.length === 2 && stowLat.every(x => x >= 180 && x <= 250)`, text `${stows.length} stows, ${stowLat.join(', ')} ms after the last packets` | 3 stows, 285, 104 -> NO | 2 stows, 202, 203 ok |
| 2 | `Mast: unfolded once per pass, never folded in the middle of one (2 unfolds)` | `deploys === 2`, text `${deploys} unfolds` | 4 -> NO | 2 ok |
| 3 | `Still working from stages 7 and 8: no ISR longer than 1 ms, motors stopped within 3 ms of both impacts, a thermal check for each within 150 ms` | `K.stats.isrMax <= 1 && irq.length === 2 && stopLat.every(x => x >= 0 && x <= 3) && ck.length >= 2 && ckLat.every(x => x >= 0 && x <= 150)`, text `longest ISR ${K.stats.isrMax} ms, stop delays ${stopLat.join(', ')} ms, thermal checks ${ckLat.join(', ')} ms after the impacts` | 0 ms, 0, 0, 29, 81 ok | 0 ms, 0, 0, 29, 81 ok |
| 4 | `Still working from stage 6: no I2C collisions, IMU at least 45 reads, never more than 40 ms apart` | `coll === 0 && im.length >= 45 && maxGap(im) <= 40` | 0, 50, 30 ok | 0, 50, 30 ok |
| 5 | `Still working from stage 5: all 10 samples transmitted, in order, none overwritten` | as stage 8 | 10 ok | 10 ok |
| 6 | `Still working from stage 4: mapper frees its frames, at least 3 frames processed and 2 paths planned in 1 s` | `K.heap >= 6144 && mp >= 3 && pl >= 2` | 4, 3, 8192 ok | same |
| 7 | `Still working from stage 3: spectrometer 47 to 53 samples started in 1 s` | `sp >= 47 && sp <= 53` | 50 ok | 50 ok |
| 8 | `Still working from stage 2: motor never more than 11 ms between steps, telemetry never more than 105 ms between packets, at least 9 sent` | `mg <= 11 && tg <= 105 && tl.length >= 9` | 10, 101, 10 ok | 10, 101, 10 ok |
| 9 | `Still working from stage 1: BEACON every 500 ms and HEART every 200 ms (within 3 ms)` | `steady(b,500,2) && steady(h,200,5)` | 2 / 5 ok | 2 / 5 ok |

The start fails exactly objectives 0, 1 and 2 (one cause: the task sleeps instead of using a timer). Margins: packet delay 29 vs 60 (2x); stow 202 and 203 in a 180 to 250 window (22 ms and 47 ms); unfold count is exact; motor gap 10 vs 11 and telemetry 101 vs 105 are inherited and unchanged. Timer periods that pass objective 1: about 180 to 245 (measured 190, 220, 230, 240 pass; 150 and 260 fail).

## 6. Bonus
`B(99, 23100)`.
- Solution: CPU **99%**, RAM **22976 B**: 3 stars. Start: CPU 98%, RAM 22976. RAM here = stage 8 solution 20864 + antenna stack 1792 + `rx_q` (96 + 4 x 32 = 224) + `stow_tmr` 96.
- RAM: antenna stack 1668 = 22852, 1700 = 22884, 1792 = 22976, 2048 = 23232 (misses Lean), 4096 = 25280 (misses). Queue length 1 = 22880, 2 = 22912. Margin on the Lean limit 124 B, deterministic. The kernel cannot delete the timer or the queue here, so no design is leaner than ~22850.
- CPU: every correct design measures 98 or 99 (the extra work is 12 ms of `handlePacket`), so the CPU star does not discriminate; 99 matches the 99% stage 8 solution with zero margin (as in stage 8). If an earlier-stage builder changes stacks or priorities, re-measure. Lean is the discriminating star.

## 6b. Chart
- Start: AUTO zoom **4x**, densest row `spectro` 56.5 changes per 100 px, **250 ms visible at once**. Solution: 4x, 56.3, 250 ms. (T = 1000 as in stages 5 to 8; 3.2 px per ms.)
- The failure fits one window: start bracket on `antenna` 500 to 694 ms (194 ms, the packet that waited); late-stow brackets are 250 ms long (last packet to the end of the window). The mast story from first packet (100 ms) to last stow (783 ms) does not fit one window; it is shown as two brackets, as above.
- No `chartGrid` (nothing periodic). `powerMarks` not used.
- `evidence(K)` (verified on the start, the solution and the wrong answers below):
```js
evidence: K => {
  const pk = K.w.irq.onPacket || [], hp = E_(K, 'handlePacket'), ant = K.ev.filter(e => e.k === 'ant');
  const last = pk.filter((t, i) => i === pk.length - 1 || pk[i + 1] - t > 150);          // last packet of every pass
  if (K.crash) return /ISR/.test(K.crash.msg) ? [{ unit: 'onPacket', from: pk[0], to: K.crash.t, label: K.crash.msg.split('.')[0] }] : [];
  const bad = pk.findIndex((t, i) => hp[i] === undefined || hp[i] - t > 60);
  if (bad >= 0) return [{ unit: 'antenna', from: pk[bad], to: hp[bad] === undefined ? K.end - 1 : hp[bad], label: `packet at ${pk[bad]} ms waited ${hp[bad] === undefined ? 'forever' : hp[bad] - pk[bad] + ' ms'}: antenna was asleep, not at xQueueReceive` }];
  const stows = ant.filter(e => e.v === 0).map(e => e.t);
  const m = stows.find(s => { const p = pk.filter(t => t <= s).pop(), n = pk.find(t => t > s); return p !== undefined && n !== undefined && n - p <= 150; });
  if (m !== undefined) { const p = pk.filter(t => t <= m).pop(), n = pk.find(t => t > m); return [{ unit: 'antenna', from: m, to: n, label: `stowed at ${m} ms, ${m - p} ms after a packet, and packet at ${n} ms followed: it must stay out during a pass` }]; }
  for (const l of last) { const s = stows.find(x => x >= l); if (s === undefined || s - l < 180 || s - l > 250) return [{ unit: 'antenna', from: l, to: Math.min(l + 250, K.end - 1), label: s === undefined ? `last packet at ${l} ms, antenna never stowed` : `last packet at ${l} ms, antenna stowed ${s - l} ms later (want 180 to 250)` }]; }
  const extra = stows.length > last.length ? stows[stows.length - 1] : undefined;
  if (extra !== undefined) return [{ unit: 'onStow', from: extra, to: extra + 1, label: `${stows.length} stows for ${last.length} passes: stowAntenna() ran again at ${extra} ms with nothing to stow` }];
  if (!ant.some(e => e.v === 1)) return [{ unit: 'antenna', from: pk[0], to: hp[0] || pk[0] + 10, label: 'deployAntenna() was never called: the mast stayed folded' }];
  return [];
}
```
Measured: start -> `antenna` 500 to 694, "packet at 500 ms waited 194 ms: antenna was asleep, not at xQueueReceive"; timer 50 -> `antenna` 472 to 500 "stowed at 472 ms, 52 ms after a packet..."; timer 500, stopped timer, no reset -> `antenna` 100 to 350 "last packet at 100 ms, antenna never stowed"; timer 150 -> same bracket, "stowed 152 ms later"; auto-reload -> `onStow` 983 to 984, "3 stows for 2 passes"; double stow call -> `onStow` 783 to 784; no `deployAntenna` -> `antenna` 100 to 129; `xTimerReset` in the ISR -> `onPacket` 100 to 100 with the crash text; solution -> `[]`. All unit names exist in the start and every mutation (`onStow` and `onPacket` rows exist).

## 7. Wrong answers
Mutations of the solution (antenna = `p.units[15]`, onStow = `p.units[16]`, onPacket = `p.units[14]`). Objective indexes as in section 5. Measured values are all from `runSim`.

| Name | Mutation | Fails | Measured | `says` |
|---|---|---|---|---|
| sleeps instead of a timer (the start) | do not apply the fix | 0, 1, 2 | delays 29, 10, 194, 377; 3 stows (285, 104 ms after); 4 unfolds | `blocked` |
| timer period 50 ms | `p.objs.stow_tmr.period = 50` | 1, 2 | 4 stows, 53 ms after; 4 unfolds (stow at 472 inside the pass) | `foldsMidPass` |
| antenna also stows itself | `p.units[15].code.push(c('stowAntenna'))` | 1, 2 | 6 stows, 4 unfolds | `foldsMidPass` |
| timer period 150 ms | `p.objs.stow_tmr.period = 150` | 1 | 2 stows, 152, 153 ms after | `stowTiming` |
| timer period 260 ms | `p.objs.stow_tmr.period = 260` | 1 | 262, 263 ms after | `stowTiming` |
| timer period 300 ms | `p.objs.stow_tmr.period = 300` | 1 | 302, 303 ms after | `stowTiming` |
| timer period 500 ms | `p.objs.stow_tmr.period = 500` | 1, 2 | 0 stows, 1 unfold | `neverStows` |
| timer stopped, not reset | `p.units[15].code[2] = tst('stow_tmr')` | 1, 2 | 0 stows, 1 unfold | `neverStows` |
| timer never started | `p.units[15].code.splice(2, 1)` | 1, 2 | 0 stows, 1 unfold | `neverStows` |
| auto-reload timer | `p.objs.stow_tmr.auto = true` | 1 | 3 stows (302, 783, 983); stow delays 202, 203 | `repeatStow` |
| callback stows twice | `p.units[16].code = [c('stowAntenna'), c('stowAntenna')]` | 1 | 4 stows | `repeatStow` |
| task never unfolds the mast | `p.units[15].code = [rc('rx_q', -1), trs('stow_tmr'), c('handlePacket')]` | 2 | 0 unfolds | `noDeploy` |
| `xTimerReset` called in the ISR | `p.units[14].code = [si('rx_q'), trs('stow_tmr')]; p.units[15].code.splice(2, 1)` | crash | "xTimerReset() was called inside an ISR. An ISR can never block: only the ...FromISR() functions are allowed there." at 100 ms | crash: `isrBlock` |
| callback waits | `p.units[16].code = [d(10), c('stowAntenna')]` | crash | "vTaskDelay() tried to block inside a timer callback. Callbacks run in the timer service task, which must never wait." at 302 ms | crash: `timerBlocks` |
| callback calls a blocking driver | `p.units[16].code = [c('stowAntenna'), c('transmit')]` | crash | "transmit() blocks, and it was called from a timer callback." at 302 ms | crash: `timerBlocks` |
| callback does heavy work | `p.units[16].code = [c('stowAntenna'), c('planPath')]` (also `compressFrame`, `bz(40)`, `bz(200)`) | crash | `task_wdt` at 599 ms | crash: `heavyCallback` |
| antenna polls the queue | `p.units[15].code = [rc('rx_q', 0), c('deployAntenna'), trs('stow_tmr'), c('handlePacket'), d(5)]` | crash | `task_wdt` at 599 ms | crash: `busyLoop` |
| antenna above the motor | `p.units[15].prio = 3` (4: motor gap 13) | 8 | motor gap 12 (13), telemetry gap 105; packets 5, 3, 3, 3 | `hog` |
| antenna stack 1024 | `p.units[15].stack = 1024` | crash | "A stack overflow in task antenna has been detected" at 102 ms | crash: `stack` |

Crash cases truncate the run; the verifier needs only the crash text.

Accepted correct designs for `alts` (all measured, 0 failed objectives):
| Name | Mutation | Stars | Measured |
|---|---|---|---|
| timer period 190 | `p.objs.stow_tmr.period = 190` | 3 | stows 192, 193 ms after |
| timer period 230 | `p.objs.stow_tmr.period = 230` | 3 | 232, 238 |
| timer period 240 | `p.objs.stow_tmr.period = 240` | 3 | 242, 243 |
| reset after handling | `p.units[15].code = [rc('rx_q', -1), c('deployAntenna'), c('handlePacket'), trs('stow_tmr')]` | 3 | 235, 215 ms after |
| antenna stack 1668 | `p.units[15].stack = 1668` | 3 | RAM 22852 |
| antenna stack 4096 | `p.units[15].stack = 4096` | 2 | RAM 25280 |
| antenna stack 2048 | `p.units[15].stack = 2048` | 2 | RAM 23232 |
| queue length 1 | `p.objs.rx_q.len = 1` | 3 | RAM 22880, no loss at these spacings |
| antenna priority 2 | `p.units[15].prio = 2` | 3 | packet delays 7, 7, 6, 6; telemetry gap 105 (exactly the limit; do not use as the reference) |

## 8. Reactions
Keys and `diagnose(K, res)` logic, in this order (`tm = K.units.find(u => u.name === 'onStow')`, `deploys` as in section 5, `stows` the stow times):
- `isrBlock`: `K.crash && /called inside an ISR/.test(K.crash.msg)` (a timer call in the ISR; the FromISR variant exists but the reply should point at the real fix: let the task reset the timer).
- `timerBlocks`: `K.crash && /timer callback/.test(K.crash.msg)`.
- `stack`: `K.crash && /stack overflow/.test(K.crash.msg)`.
- `heavyCallback`: `K.crash && /task_wdt/.test(K.crash.msg)` and `tm` has any `call` other than `stowAntenna`/`deployAntenna`, or any `busy`.
- `busyLoop`: any other `task_wdt` crash.
- `blocked`: `!res[0][0]` (packets wait; the task is asleep in `vTaskDelay`).
- `foldsMidPass`: `!res[2][0]` and `deploys > 2` (also covers period 50 and a second `stowAntenna`).
- `noDeploy`: `!res[2][0]` and `deploys < 2` and `stows.length > 0`.
- `neverStows`: `!res[1][0]` and `stows.length === 0`.
- `repeatStow`: `!res[1][0]` and `stows.length > 2`.
- `stowTiming`: `!res[1][0]` otherwise (a stow outside 180 to 250 ms after the last packet: fix the timer period).
- `hog`: `!res[8][0]` or `!res[4][0]` or `!res[3][0]` (priority mistake; mention ~98% load and priority 1).
- `regress`: any other of `res[5..9]` failed.
- `fail`: fallback.

## 9. Theory outline
1. **A delay is not a timeout.** `vTaskDelay(250)` blocks the whole task, so it cannot read the next packet; the stow was a different job that needed no task of its own. Diagram: the start's `antenna` row (receive, handle, sleep 250, stow) with the queue filling behind it. Widget: stepper on the start's four packets showing where each waits. Check: what is the antenna task unable to do while it sleeps? Verify: `vTaskDelay` blocks only the calling task.
2. **A software timer is a callback with a deadline.** `xTimerCreate`, one-shot (`pdFALSE`) vs auto-reload (`pdTRUE`), the period in ticks (`pdMS_TO_TICKS`), `xTimerStart`/`xTimerStop`/`xTimerReset`/`xTimerChangePeriod`. Diagram: timer object (period, reload, callback) and a time axis. Widget: timer lab with period and reload controls firing a callback at set times. Check: what does a one-shot timer do after it expires? Verify: signatures of `xTimerCreate`, `xTimerReset`, `xTimerIsTimerActive`, and that a timer is created dormant.
3. **The restartable timeout.** `xTimerReset` restarts the period each time, so the callback runs only when nothing happened for the whole period (watchdog pattern: keypad backlight, auto-stow). Diagram: packets resetting a countdown; the stow lands 200 ms after the last. Widget: packet-train editor (drag packets, choose period) showing the stow time and unfold count, linked to goals 1 and 2. Check: three packets 80 ms apart and a 50 ms period: how many folds? Verify: `xTimerReset` on a dormant timer starts it.
4. **Who runs the callback: the timer service task.** The callback does not run in the timer's creator or in an ISR; it runs in the timer service task (`configTIMER_TASK_PRIORITY`, `configTIMER_TASK_STACK_DEPTH`, `configTIMER_QUEUE_LENGTH`), and `xTimer...` calls from tasks only post a command to its queue. Diagram: tasks -> timer command queue -> timer service task -> callbacks. Widget: the same diagram with a callback you can make slow, showing the later callbacks it delays (explicitly shown, since the sim does not run a shared service task). Check: why can a slow callback delay another timer? Verify ESP-IDF defaults: `CONFIG_FREERTOS_TIMER_TASK_PRIORITY` (1), `CONFIG_FREERTOS_TIMER_TASK_STACK_DEPTH` (2048), `CONFIG_FREERTOS_TIMER_QUEUE_LENGTH` (10); the service task is pinned to core 0.
5. **Rules for callbacks.** Never block (no `vTaskDelay`, no waiting queue or semaphore, no blocking driver: the crashes in the wrong answers), keep them short, do the long work in a task. From an ISR use `xTimerResetFromISR`, never `xTimerReset`. Diagram: "short callback + notify a task" vs "long callback". Widget: pick-the-fix quiz over the four crash cases (blocking delay, blocking driver, heavy work, reset in ISR). Check: a callback must read a sensor for 40 ms: what do you do? Verify: the `...FromISR` timer API and the rule that a callback's `ticksToWait` must be 0.
6. **Timer or task?** Compare: one-shot timeout (this stage), periodic work (stage 3's `vTaskDelayUntil` vs an auto-reload timer, which gives no priority control and no blocking), and cost (a timer is 96 B here and no stack). Diagram: decision tree. Widget: "which tool?" quiz of four scenarios. Check: why did the stow not need its own task? Verify: RAM claims (the timer control block is small; the stack belongs to the service task, shared by all callbacks).
7. (optional) **Priority and the 98% load, once more.** Reuse the priority-picker widget: the antenna still belongs at priority 1. Check: why not priority 3 for a 3 ms handler?

Facts to verify in ESP-IDF/FreeRTOS docs: the signatures above and that `xTimerReset` starts a dormant timer; `CONFIG_FREERTOS_TIMER_TASK_PRIORITY`, `..._STACK_DEPTH`, `..._QUEUE_LENGTH` defaults and the core of the timer task; that timer callbacks must not block and must not call APIs with a non-zero block time; `xTimerResetFromISR(timer, &woken)`; auto-reload vs one-shot semantics; one-shot timers become dormant after they expire; the resolution of the timer is the tick (`CONFIG_FREERTOS_HZ`, default 100 in ESP-IDF, 1000 in this game).

## 10. Open risks
- **Chaotic timing.** The measured values depend on round-robin among the priority-1 tasks, and the system is saturated. The `onPacket` times and the double bump are tuned: bursts that start before about 400 ms (for example 100, 180, 260, 340, or packets at 420 to 980 plus 4 impacts) crash even the reference solution with `task_wdt` at 599 ms, because 99% load leaves no idle slice before 600 ms. Keep `irqs` exactly as specified and re-run the measurements if any earlier builder changes stacks, priorities or the `bumper` code.
- **Stage 7 and 8 lesson files did not exist**: the base is the stage 8 reference solution from the stage 8 spec. This stage keeps only two impacts (150 and 152 ms) instead of stage 8's four, to leave room for the packets; stage 8's `K.w.merged` and "4 of 4 impacts" are therefore not re-checked here (the 2-impact version still needs a notification or counting design only when both impacts are handled, and the stage 8 solution passes it).
- **The simulator does not model the shared timer service task.** Each callback is its own priority-1 unit, so "a slow callback delays other timers" cannot be seen on the chart; the heavy-callback wrong answer fails only through the watchdog. The theory must teach the shared service task from the docs and a diagram, not claim the chart shows it. Not proven here.
- **The CPU star has zero margin** (solution 99, limit 99) and does not discriminate designs. Lean is the discriminating star (limit 23100, solution 22976).
- **Priority 2 is an accepted alternative at the limit**: telemetry gap 105 equals the objective's 105; any inherited change could flip it. Listing it in `alts` is optional; if it flaps, drop it.
- **Window width**: objective 1 accepts a stow 180 to 250 ms after the last packet, so any timer period of about 180 to 245 passes; the story says "about 200 ms" and the check is deliberately tolerant to avoid a 2 ms edge (period 260 would miss by 12 ms with the window of 250).
- **Evidence for pass-length failures is two brackets**, not one: the full mast story (100 to 783 ms) is wider than the 250 ms visible at 4x, but each failure bracket fits.
