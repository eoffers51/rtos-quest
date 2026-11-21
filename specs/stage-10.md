# Stage 10 spec: All Systems Go

All numbers were measured with `runSim` (scratch scripts `specs/tmp-10*.js`, deleted). The stage 9 lesson file did not exist, so the base is the stage 9 reference solution from section 4 of `specs/stage-09.md`: `stage8.solution()` (`spec-direct-line-specs-stage-08-md.js`) + queue `rx_q` (len 4, item 32) + timer `stow_tmr` (200 ms, one-shot, cb `onStow`) + ISR `onPacket` = `[si('rx_q')]` (unit 14) + task `antenna` prio 1, stack 1792 = `[rc('rx_q',-1), c('deployAntenna'), trs('stow_tmr'), c('handlePacket')]` (unit 15) + timer unit `onStow` = `[c('stowAntenna')]` (unit 16). That base measures CPU 99%, RAM 22976, idle ticks 395-399, 738-739, 789, 792-793, 795-797, 998-999.
L = `{ T: 1000, cores: 1, heap: 8192, pins: ['BEACON','HEART'], irqs: { onBump: [150, 152], onPacket: [100, 420, 500, 580] } }` (identical to stage 9, so the stage 9 regression is the same run).
Unit order: stage 9 units 0 to 16 (unchanged), then **radio_link 17, time_sync 18, gps_fix 19, uplink 20** (all tasks, all priority 1). Priorities in force: beacon/heart 4, motor 3, telemetry/science/imu/thermo 2, camera/spectro/nav/mapper/radio/bumper/antenna/radio_link/time_sync/gps_fix/uplink 1.

## 1. Identity
- id: 10
- slug: `all-systems-go`
- title: All Systems Go
- topic: Event groups (xEventGroupCreate, xEventGroupSetBits, xEventGroupWaitBits: wait for all bits vs any bit, bits are state not events, clear-on-exit, why a semaphore cannot express "all of these")
- file: `main/rover_main.c`
- T: **1000**, cores: 1, `heap: 8192`, pins: `['BEACON', 'HEART']`
- irqs: `{ onBump: [150, 152], onPacket: [100, 420, 500, 580] }`
- ops: `['gpio', 'call', 'delay', 'until', 'busy', 'send', 'recv', 'take', 'give', 'giveISR', 'sendISR', 'notifyGive', 'notifyGiveISR', 'notifyTake', 'tReset', 'tStop', 'evSet', 'evWait']` (all exist in the editor and the verifier `OPS`)
- fns: `['stopMotors', 'checkThermals', 'deployAntenna', 'stowAntenna', 'handlePacket', 'acquireLink', 'syncTime', 'acquireFix', 'sendUplink']` (the last four are new, section 3)
- no `chartGrid`, no `power`.

## 2. Story
The comms team added an uplink that sends the day's science packet to Earth, and the ground station rejects any packet that is sent before three things are true: the radio link is up, the clock is synced and the rover has a position fix. Three bring-up tasks (`radio_link`, `time_sync`, `gps_fix`) each finish at their own time, twice in the test (the rover has two uplink windows), and the team wired them the obvious way: every task gives one binary semaphore `ready_sem` and `uplink` takes it. The first give wakes the uplink, which sends with only the radio up (the log shows "packet rejected by the ground station, missing: time sync, position fix"), then again after the clock, and only the third send is accepted; the same happens in the second window. Nobody created the event group `sys_ev` that the architect asked for with bits `LINK_UP`, `TIME_OK`, `FIX_OK`: the fix is to make each bring-up task set its own bit and have `uplink` wait for all three at once.

## 3. Kernel additions
Four new `F` entries, **already added to `src/kernel.js`** (one Edit, additive, appended after `fusionStep`; two tiny helpers `nth` and `ready` follow the `F` object). Builders must not change them.
```js
 acquireLink:{wait:K=>nth(K,'nLink',[430,60]),waitTxt:'blocks 60 to 430 ms while the radio associates',cost:1,stack:700,fx:'radio',sig:'acquire_link()',end:K=>ready(K,'link')},
 syncTime:{wait:K=>nth(K,'nTime',[510,290]),waitTxt:'blocks 290 to 510 ms for the time server',cost:1,stack:900,fx:'chip',sig:'sync_time()',end:K=>ready(K,'time')},
 acquireFix:{wait:K=>nth(K,'nFix',[640,60]),waitTxt:'blocks 60 to 640 ms for a position fix',cost:1,stack:800,fx:'mast',sig:'acquire_fix()',end:K=>ready(K,'fix')},
 sendUplink:{wait:20,cost:1,stack:1200,fx:'radio',sig:'send_uplink()',end:K=>{ /* checks K.w.rdy; rejects and K.bad(...) if anything is missing, else K.w.up.push({t, ok:true}) and clears K.w.rdy */ }}
 // nth(K,key,arr): the n-th call gets arr[n] (the last value repeats). ready(K,k): K.w.rdy[k]=true and K.w.done[k].push(K.t).
```
| Function | CPU | Blocked wait | Stack | Effect |
|---|---|---|---|---|
| `acquireLink` | 1 ms | 430 ms (1st call), 60 ms (later) | 700 B | marks "link" ready, records `K.w.done.link` |
| `syncTime` | 1 ms | 510 ms, then 290 ms | 900 B | marks "time" ready, `K.w.done.time` |
| `acquireFix` | 1 ms | 640 ms, then 60 ms | 800 B | marks "fix" ready, `K.w.done.fix` |
| `sendUplink` | 1 ms | 20 ms | 1200 B | if link, time and fix are not all ready since the last accepted packet: `K.bad('send_uplink(): packet rejected by the ground station, missing: <radio link, time sync, position fix>')` and `K.w.up.push({t, ok:false})`; otherwise `K.w.up.push({t, ok:true})` and all three are cleared (the next packet needs fresh data) |

Why CPU 1 ms and waits that late: the stage 9 firmware is 98 to 99% loaded and has **only five idle ticks (395 to 399) before 738**; the task watchdog (600 ms without an idle tick) trips at 999 or earlier if the bring-up burns more CPU, and any CPU spent before ~400 ms moves that slice. Measured: completion costs of 3 or 4 ms crash with `task_wdt` at 599 or 999 even for the reference; costs 1/1/1/1 are stable (start, solution and all wrong answers below except the two intended crashes). Every bring-up completion therefore lands after 400 ms, so the idle slice at 395 is untouched. Keep these numbers.
Other facts the builders must respect:
- `objs.sys_ev = { type: 'events', bits: ['LINK_UP', 'TIME_OK', 'FIX_OK'] }`. Bits are cleared on exit from `xEventGroupWaitBits` (the editor line for `evWait` already renders `pdTRUE`, and `pdTRUE`/`pdFALSE` for wait-all).
- **Timeout behaviour of the simulator:** when an `evWait` times out the task restarts its code from the first line instead of falling through to the next instruction. Do not teach "timeout then send anyway" and do not use a timeout in the reference or the hints.
- **Broadcast is not modelled like FreeRTOS:** `evSet` wakes every waiter and each one re-checks, and the first to run clears the bits (real FreeRTOS clears them for all satisfied waiters at the end of `xEventGroupSetBits`). This stage has one waiter, so it is not visible; the theory must not claim a second waiter shows it on the chart.
- Task cap: the start has 18 tasks. The editor cap is 14 tasks (`src/editor.js` line 124) and only blocks adding a task; the player adds none here. No change needed.
- Rover functions' `sig` text is what the editor shows; `acquire_link()`, `sync_time()`, `acquire_fix()`, `send_uplink()`.
- Game-time note: 1 ms ticks; real association, SNTP and GPS cold fixes take seconds, scaled down for the 1 s test. Say so in the theory.

## 4. Programs
Start (`start(prev)`, `prev` = stage 9 solution; the new tasks come after unit 16):
```js
const p = clone(prev || stage9.solution());
p.objs.sys_ev = { type: 'events', bits: ['LINK_UP', 'TIME_OK', 'FIX_OK'] };   // created, never used
p.objs.ready_sem = { type: 'binary' };
p.units.push(task('radio_link', 1, [c('acquireLink'), gv('ready_sem'), d(40), gv('ready_sem'), d(220), c('acquireLink'), gv('ready_sem'), d(10000)], { stack: 1536 }));   // unit 17
p.units.push(task('time_sync',  1, [c('syncTime'),    gv('ready_sem'), d(20), c('syncTime'),    gv('ready_sem'), d(10000)], { stack: 1792 }));   // unit 18
p.units.push(task('gps_fix',    1, [c('acquireFix'),  gv('ready_sem'), d(60), c('acquireFix'),  gv('ready_sem'), d(10000)], { stack: 1664 }));   // unit 19
p.units.push(task('uplink',     1, [tk('ready_sem', -1), c('sendUplink')], { stack: 2048 }));                                                       // unit 20
```
Story of the code: `radio_link` gives once after association and again after DHCP (`d(40)`), then re-associates for window 2; `time_sync` and `gps_fix` do one sync/fix per window; the trailing `d(10000)` is "done, sleep" (real code would `vTaskDelete(NULL)`; there is no delete op). Stack need = 768 + deepest call: radio_link 1468, time_sync 1668, gps_fix 1568, uplink 1968, so the stacks above leave 68 / 124 / 96 / 80 B.

Reference solution:
```js
const p = stage9.solution();              // stage 9 reference, same objs, onPacket, antenna, onStow
p.objs.sys_ev = { type: 'events', bits: ['LINK_UP', 'TIME_OK', 'FIX_OK'] };   // ready_sem is NOT added: deleted
p.units.push(task('radio_link', 1, [c('acquireLink'), es('sys_ev','LINK_UP'), d(40), es('sys_ev','LINK_UP'), d(220), c('acquireLink'), es('sys_ev','LINK_UP'), d(10000)], { stack: 1536 }));
p.units.push(task('time_sync',  1, [c('syncTime'),    es('sys_ev','TIME_OK'), d(20), c('syncTime'),    es('sys_ev','TIME_OK'), d(10000)], { stack: 1792 }));
p.units.push(task('gps_fix',    1, [c('acquireFix'),  es('sys_ev','FIX_OK'),  d(60), c('acquireFix'),  es('sys_ev','FIX_OK'),  d(10000)], { stack: 1664 }));
p.units.push(task('uplink',     1, [ew('sys_ev', 'all', -1), c('sendUplink')], { stack: 2048 }));
```
ESP-IDF form: each bring-up task `xEventGroupSetBits(sys_ev, LINK_UP_BIT);` after its work; `uplink`: `xEventGroupWaitBits(sys_ev, LINK_UP_BIT | TIME_OK_BIT | FIX_OK_BIT, pdTRUE, pdTRUE, portMAX_DELAY); send_uplink();`. Setting a bit that is already set changes nothing, which is why the second `LINK_UP` give in window 1 is harmless here and breaks the semaphore design.
Player edits: delete `ready_sem` (editor "delete"), change eight `xSemaphoreGive` lines to `xEventGroupSetBits` (pick the bit from the select) and one `xSemaphoreTake` to `xEventGroupWaitBits(..., all)`. Reachability: `sys_ev` is in `start()`; nothing is added by the player.
Measured timeline of the solution (ms): link ready 456 and 799; time ready 536 and 849; fix ready 667 and 793. Window 1 completes at 667 (fix is last), window 2 at 849 (time is last), so no single bit is the last in both windows. Packets accepted at 693 and 874.

## 5. Objectives (goals, in order) and checks
Helpers: `up = K.w.up || []`, `dn = K.w.done || {}`, `okU = up.filter(u => u.ok).map(u => u.t)`, `rej = up.filter(u => !u.ok).length`, `rounds = [0, 1].map(i => Math.max(...['link','time','fix'].map(k => (dn[k] || [])[i] ?? -1)))`, `upLat = rounds.map((r, i) => okU[i] === undefined || r < 0 ? -1 : okU[i] - r)`, then `pk`, `hp`, `lat`, `ant`, `stows`, `lastP`, `stowLat`, `unf` (unfolds counted as `ant` events with `v === 1` while folded), `irq`, `st`, `ck`, `stopLat`, `ckLat`, `coll`, `im`, `ids`, `lost`, `sp`, `mg`, `tl`, `tg`, `b`, `h`, `mp`, `pl`, `steady` as in stages 5 to 9.

| # | Goal text | Check | Start | Solution |
|---|---|---|---|---|
| 0 | `Uplink: the ground station rejects no packet (nothing is sent before the radio link, the clock and the position fix are all ready)` | `rej === 0`, text `${rej} rejected` | 5 rejected -> NO | 0 ok |
| 1 | `Uplink: exactly one packet per window, sent within 60 ms of the last of the three being ready (2 packets)` | `okU.length === 2 && up.length === 2 && upLat.every(x => x >= 0 && x <= 60)`, text `${up.length} packets, accepted at ${okU.join(', ')} ms, delays ${upLat.join(', ')} ms (-1 = never)` | 7 packets, accepted 693, 876, delays 26, 22 -> NO | 2 packets, 693, 874, delays 26, 25 ok |
| 2 | `Still working from stage 9: every packet handled within 60 ms, mast stowed once per pass 180 to 250 ms after the last packet, unfolded twice` | `pk.length === 4 && lat.every(x => x >= 0 && x <= 60) && stows.length === 2 && stowLat.every(x => x >= 180 && x <= 250) && unf === 2`, text `packet delays ${lat.join(', ')} ms, stows ${stowLat.join(', ')} ms after the last packets, ${unf} unfolds` | 29, 10, 29, 13; 202, 203; 2 ok | same ok |
| 3 | `Still working from stages 7 and 8: no ISR longer than 1 ms, motors stopped within 3 ms of both impacts, a thermal check for each within 150 ms` | as stage 9 objective 3 | 0 ms, 0, 0, 29, 81 ok | same ok |
| 4 | `Still working from stage 6: no I2C collisions, IMU at least 45 reads, never more than 40 ms apart` | as stage 9 | 0, 50, 30 ok | same ok |
| 5 | `Still working from stage 5: all 10 samples transmitted, in order, none overwritten` | as stage 9 | 10 ok | 10 ok |
| 6 | `Still working from stage 4: mapper frees its frames, at least 3 frames processed and 2 paths planned in 1 s` | `K.heap >= 6144 && mp >= 3 && pl >= 2` | 4, 3, 8192 ok | same |
| 7 | `Still working from stage 3: spectrometer 47 to 53 samples started in 1 s` | `sp >= 47 && sp <= 53` | 50 ok | 50 ok |
| 8 | `Still working from stage 2: motor never more than 11 ms between steps, telemetry never more than 105 ms between packets, at least 9 sent` | `mg <= 11 && tg <= 105 && tl.length >= 9` | 10, 101, 10 ok | same |
| 9 | `Still working from stage 1: BEACON every 500 ms and HEART every 200 ms (within 3 ms)` | `steady(b, 500, 2) && steady(h, 200, 5)` | 2 / 5 ok | same |

The start fails exactly objectives 0 and 1 (one cause: a counting-style signal cannot say which three things happened). Margins: delivery delay 26 and 25 vs 60 (2.3x); everything inherited is unchanged from stage 9 (packet delays 29, 10, 29, 13 identical). The sample window ("spectrometer 47 to 53") sits at 50: do not shorten `T` (at T=900/950 it reads 45/47).

## 6. Bonus
`B(99, 30160)`.
- Solution: CPU **99%**, RAM **30112 B** (3 stars). Start: CPU 99%, RAM 30208. RAM = stage 9 solution 22976 + radio_link 1536 + time_sync 1792 + gps_fix 1664 + uplink 2048 + `sys_ev` 96 (`ready_sem` deleted). Leaving `ready_sem` costs 96 B (30208) and misses Lean by 48 B; the limit sits 48 B above the solution and 48 B below that case.
- RAM variants: uplink stack 1968 = 30032; uplink 4096 = 32160; time_sync 4096 = 32416. Lean is the discriminating star.
- CPU: every correct design measures 99 (zero margin, as in stages 8 and 9); the CPU star does not discriminate. Busy-poll designs crash instead. Re-measure if an earlier builder changes stacks, priorities or the `bumper`/`antenna` code.

## 6b. Chart
- Start: AUTO zoom **4x**, densest row `spectro` 55.0 changes per 100 px, **250 ms visible at once**. Solution: 4x, 56.4, 250 ms. 3.2 px per ms.
- The failure fits one window: the first rejected packet is on the `uplink` row at 463 to 483 ms (the 20 ms the driver waits, then the rejection mark); the whole first window (radio at 456, time at 536, fix at 667, first accepted packet at 693) spans 237 ms. For a failing run the chart scrolls to the bracket below. The learner can compare the `uplink` row with the `radio_link`, `time_sync` and `gps_fix` rows (those tasks are blocked, then run for 1 ms when they finish).
- No `chartGrid`, no `powerMarks`.
- `evidence(K)` (checked on start, solution and the wrong answers; all unit names exist in start and solution):
```js
evidence: K => {
  const up = K.w.up || [], dn = K.w.done || {}, ss = S_(K, 'sendUplink');
  if (K.crash) return [];
  const logs = K.ev.filter(e => e.k === 'log' && /packet rejected/.test(e.text)).map(e => e.text.split('missing: ')[1]);
  const ri = up.findIndex(u => !u.ok);
  if (ri >= 0) { const rj = up.slice(0, ri).filter(u => !u.ok).length; return [{ unit: 'uplink', from: ss[ri], to: up[ri].t, label: `packet at ${up[ri].t} ms rejected: missing ${logs[rj]}` }]; }
  const rounds = [0, 1].map(i => Math.max(...['link', 'time', 'fix'].map(k => (dn[k] || [])[i] ?? -1)));
  const ok = up.filter(u => u.ok).map(u => u.t);
  const miss = rounds.findIndex((r, i) => r >= 0 && ok[i] === undefined);
  if (miss >= 0) return [{ unit: 'uplink', from: rounds[miss], to: Math.min(rounds[miss] + 250, K.end - 1), label: `the last bring-up task finished at ${rounds[miss]} ms but uplink never sent: it never saw all three bits` }];
  const late = rounds.findIndex((r, i) => r >= 0 && ok[i] - r > 60);
  if (late >= 0) return [{ unit: 'uplink', from: rounds[late], to: ok[late], label: `packet sent ${ok[late] - rounds[late]} ms after the last condition was ready` }];
  return [];
}
```
Measured: start -> `uplink` 463 to 483, "packet at 483 ms rejected: missing time sync, position fix"; `any` -> same bracket; only FIX_OK -> 795 to 818, "missing time sync"; only LINK_UP -> 463 to 483; sets bits before the work -> 26 to 46, "missing radio link, time sync, position fix"; gps never sets / time sets the wrong bit -> 667 to 917, "the last bring-up task finished at 667 ms but uplink never sent"; link bit set once -> 849 to 999; solution -> `[]`. The labels for crashes are empty (the verifier shows the crash text).

## 7. Wrong answers
Mutations of the solution (radio_link = `p.units[17]`, time_sync = 18, gps_fix = 19, uplink = 20; uplink code index 0 is the wait). Objective indexes as in section 5. All measured with `runSim`, T = 1000.

| Name | Mutation | Fails | Measured | `says` |
|---|---|---|---|---|
| one semaphore for all three (the start) | do not apply the fix | 0, 1 | 5 rejected, 7 packets, accepted 693 and 876 | `sendsEarly` |
| waits for any bit | `p.units[20].code[0] = ew('sys_ev', 'any', -1)` | 0, 1 | identical to the start: 5 rejected | `anyBit` |
| waits for FIX_OK only | `code[0] = ew('sys_ev', 'bit:FIX_OK', -1)` | 0, 1 | 1 rejected (window 2, missing time sync at 818), accepted 693 only | `oneBit` |
| waits for LINK_UP only | `code[0] = ew('sys_ev', 'bit:LINK_UP', -1)` | 0, 1 | 2 rejected, accepted 839 (delay 172) | `oneBit` |
| waits for TIME_OK only | `code[0] = ew('sys_ev', 'bit:TIME_OK', -1)` | 0, 1 | 1 rejected, accepted 877 (delay 210) | `oneBit` |
| bit set before the work | in units 17 to 19 swap each `c(acquire...)` with the `es(...)` that follows | 0, 1 | 1 rejected at 46 ms (missing all three), accepted 753 (delay 86) | `setsEarly` |
| gps_fix never sets its bit | `p.units[19].code = p.units[19].code.filter(i => i.op !== 'evSet')` | 1 | 0 packets | `neverSends` |
| time_sync sets the wrong bit | `p.units[18].code[1] = es('sys_ev','FIX_OK'); p.units[18].code[4] = es('sys_ev','FIX_OK')` | 1 | 0 packets | `neverSends` |
| radio_link sets its bit only once | `p.units[17].code = [c('acquireLink'), es('sys_ev','LINK_UP'), d(10000)]` | 1 | 1 packet (693); window 2 never completes | `oneWindow` |
| waits twice (first one bit, then all) | `p.units[20].code = [ew('sys_ev','bit:LINK_UP',-1), ew('sys_ev','all',-1), c('sendUplink')]` | 1 | 1 packet (693): the first wait cleared LINK_UP and window 2's LINK_UP is not set again | `oneWindow` |
| counting the gives (3 takes) | start code, `p.units[20].code = [tk('ready_sem',-1), tk('ready_sem',-1), tk('ready_sem',-1), c('sendUplink')]` | 0, 1 | 1 rejected, accepted 839 (delay 172); same with a counting semaphore | `countsGives` |
| uplink polls | `code[0] = ew('sys_ev', 'all', 0)` | crash | `task_wdt` at 599 ms | crash: `busyLoop` |
| uplink stack 1024 | `p.units[20].stack = 1024` | crash | "A stack overflow in task uplink has been detected" at 673 ms | crash: `stack` |

(Timeout designs such as `ew('sys_ev','all',600)` pass in the simulator because a timed-out task restarts its loop; they are deliberately left out, see section 3.)

Accepted correct designs for `alts`:
| Name | Mutation | Stars | Measured |
|---|---|---|---|
| three waits in sequence | `p.units[20].code = [ew('sys_ev','bit:LINK_UP',-1), ew('sys_ev','bit:TIME_OK',-1), ew('sys_ev','bit:FIX_OK',-1), c('sendUplink')]` | 3 | accepted 693, 874; RAM 30112 |
| uplink priority 2 | `p.units[20].prio = 2` | 3 | same results |
| uplink priority 3 | `p.units[20].prio = 3` | 3 | same results (priority 4 also passes; not listed) |
| uplink stack 1968 | `p.units[20].stack = 1968` | 3 | RAM 30032 |
| ready_sem left unused | `p.objs.ready_sem = { type: 'binary' }` | 2 | RAM 30208 |
| uplink stack 4096 | `p.units[20].stack = 4096` | 2 | RAM 32160 |
| time_sync stack 4096 | `p.units[18].stack = 4096` | 2 | RAM 32416 |

## 8. Reactions
Keys and `diagnose(K, res)` logic, in this order (`up = K.w.up || []`, `okU`, `rej` as in section 5, `ul = K.units.find(u => u.name === 'uplink')`, `waits = ul.code.filter(i => i.op === 'evWait')`, `takes = ul.code.filter(i => i.op === 'take')`):
- `stack`: `K.crash && /stack overflow/.test(K.crash.msg)`.
- `busyLoop`: `K.crash && /task_wdt/.test(K.crash.msg)`.
- `crash` (any other crash): fallback key already required by the contract.
- `countsGives`: `!res[0][0]` and `takes.length > 1` (several takes on one semaphore).
- `sendsEarly`: `!res[0][0]` and `takes.length === 1` (one semaphore, first give wakes the uplink).
- `anyBit`: `!res[0][0]` and `waits.some(w => w.mode === 'any')`.
- `setsEarly`: `!res[0][0]` and the first rejected packet is before 100 ms (`up.find(u => !u.ok).t < 100`).
- `oneBit`: `!res[0][0]` and `waits.length === 1 && /^bit:/.test(waits[0].mode)`.
- `neverSends`: `up.length === 0` (a bit is never set, the wrong bit, or the uplink still waits on a semaphore nobody gives).
- `oneWindow`: `!res[1][0]` and `okU.length === 1` (the second window is missing: bits are cleared on exit, so every window needs every bit set again).
- `hog`: `!res[8][0]` or `!res[4][0]` or `!res[3][0]` or `!res[2][0]` (priority or load mistake; the system is about 99% loaded).
- `regress`: any other of `res[5..9]` failed.
- `fail`: fallback.
The objective-0 keys cover each failure of the uplink, so `!res[0][0]` is tested before `!res[1][0]`.

## 9. Theory outline
1. **Waiting for more than one thing.** Why a semaphore counts "something happened" but cannot say what, and why three gives are not "all three". Diagram: the start's `ready_sem` with the three givers and the early packet. Widget: stepper over the start's timeline showing each give waking the uplink and what `sendUplink` found. Check: why does the first give send a packet too early? Verify: binary semaphore semantics.
2. **Event groups: one bit per fact.** `xEventGroupCreate`, 24 usable bits (ESP32 FreeRTOS uses a 32-bit event bits type with the top 8 bits reserved: verify), `xEventGroupSetBits`, bits are state, not a count: setting a set bit changes nothing. Diagram: a row of bits with three setters. Widget: bit board where you set bits from three tasks and watch the group value. Check: what happens if `radio_link` sets `LINK_UP` twice? Verify the bit width on ESP32 (`configUSE_16_BIT_TICKS` is 0, so 24 bits).
3. **Waiting for all or any.** `xEventGroupWaitBits(group, bitsToWaitFor, xClearOnExit, xWaitForAllBits, timeout)`, the four combinations, `portMAX_DELAY`, the return value. Diagram: truth table all/any with a mask. Widget: wait-lab with the three bits and the mode selector, reproducing "any" (the early packet) and "all". Check: which call waits for position fix and radio link, but not time? (mask question). Verify the exact parameter order and return value semantics.
4. **Clear on exit, and why a bit can be lost.** `pdTRUE` clears the waited bits when the wait returns; with window 2 each bit must be set again. Diagram: window 1 and window 2 with the bit values over time. Widget: the packet-window timeline from the sim: drag a bring-up task's completion time and see which bit is last and which packet time results, including the "wait only FIX_OK" trap (FIX is last in window 1 but not in window 2). Check: why does waiting for LINK_UP first, then for all three, send only one packet? Verify clear-on-exit semantics and that bits cleared are only those in the mask.
5. **Event groups vs semaphores vs notifications.** Decision table: one event, one waiter: notification; count of events: counting semaphore; "these N conditions" or several waiters: event group; cost (96 B here, no data payload). Diagram: decision tree. Widget: "which tool?" quiz of four scenarios. Check: why not three binary semaphores waited in sequence? (works only if each is given exactly once per window). Verify the RAM claim (event group control block size is small) and that event groups carry no data.
6. **Rules and real-world details.** Never poll with timeout 0 (the watchdog crash in the wrong answers), set the bit after the work not before, set from an ISR only through `xEventGroupSetBitsFromISR` which defers to the timer service task (stage 9 timer service task) and needs `configUSE_TIMERS`, a timeout is a decision the caller must make. Diagram: bring-up task timeline with "set after work". Widget: pick-the-fix over the crash and early-set cases. Check: where does `xEventGroupSetBitsFromISR` run its work? Verify against the ESP-IDF docs, including `xEventGroupSync` for a rendezvous (mention only).
Facts to verify in ESP-IDF/FreeRTOS docs: signatures of `xEventGroupCreate`, `xEventGroupSetBits`, `xEventGroupWaitBits`, `xEventGroupClearBits`, `xEventGroupSetBitsFromISR`, `xEventGroupSync`; usable bit width (24 on 32-bit ticks); behaviour of waiters when `SetBits` is called (real FreeRTOS clears for all satisfied waiters at the end; the simulator does not model several waiters); the tick-to-ms scaling note; that uplink-style bring-up usually takes seconds on real hardware.

## 10. Open risks
- **The system is saturated.** Stage 9 leaves only five idle ticks (395 to 399) before 738, and the task watchdog fires when no idle tick occurs for 600 ms. New CPU before ~400 ms or too much CPU afterward crashes even the reference (measured with costs 3 and 4 ms: `task_wdt` at 599 or 999). The numbers in section 3 (1 ms costs, all completions after 450 ms, T = 1000) are the stable set; any earlier builder change to stacks, priorities or the `bumper`/`antenna` code requires re-measuring. A start variant with `sendUplink` cost 2 crashed at 999.
- **The CPU star has zero margin** (99 vs 99) and does not discriminate; Lean (30160 vs 30112, 48 B) does, but by a small absolute margin; it is exact and deterministic.
- **`ready_sem` must be deleted** for the third star; the verifier proves it only if the editor's "delete object" works for it (it does for `bump_sem` in stage 8).
- **Simulator differences from real FreeRTOS** (timeout restarts the loop; several waiters are not modelled like `xEventGroupSetBits`). The theory must not teach them as truth; the reference avoids both.
- **Time scaling:** link, time and fix waits of 430 to 640 ms are unrealistically short for a real rover (seconds); the theory states the scaling.
- **Window 2 depends on the `d()` gaps** (`radio_link` 40 and 220, `time_sync` 20, `gps_fix` 60): link 2 at 799 and fix 2 at 793 must stay after the first accepted packet (about 693, with the send finishing at 697) or the second window merges into the first. They do, with 96 ms of margin, but changing the helper delays changes this.
- **`alts` priority 4 for uplink** passes too; there is no "hog" wrong answer in this stage (the uplink's work is 1 ms), so the `hog` reaction only covers regressions.
- **Evidence for crashes is empty** (the verifier prints the crash text; the chart shows the watchdog marker).
