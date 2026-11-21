# Stage 3 spec: Steady Pulse

All numbers below were measured with `runSim` (T = 3000, 1 core) on `stage2.solution()` plus the spectrometer task. Unit order in the program is: beacon, heart, motor, camera, telemetry, **spectro** (index 5).

## 1. Identity
- id: 3
- slug: `steady-pulse`
- title: Steady Pulse
- topic: Ticks, drift and vTaskDelayUntil
- file: `main/rover_main.c`
- T: 3000, cores: 1
- pins: `['BEACON', 'HEART']` (unchanged, no new pin; the spectrometer is shown by its `mast` effect and its task row)
- ops: `['gpio', 'call', 'delay', 'until', 'busy']`
- fns: `['sampleSpectrometer']` (already in `F`)

## 2. Story
The science team bolted a spectrometer onto the mast. It must be sampled at exactly 50 Hz, one sample every 20 ms, or the spectra are smeared. Their task does `sampleSpectrometer(); vTaskDelay(20);`, and since the call itself takes 3 to 7 ms the loop really runs every 23 to 27 ms and falls further behind the clock on every lap. After 3 s only 91 of the 150 samples exist, and the last ones are over a second late.

## 3. Kernel additions
None. `F.sampleSpectrometer` already exists (cost 3 to 7 ms deterministic cycle `[3,5,7,4,6]`, stack 500 B, fx `mast`). `un()` / op `until` already exist. Minimum stack for the new task is 768 + 500 = 1268 B.

## 4. Programs
`start(prev)`: clone of `prev || stage2.solution()`, then push
```js
task('spectro', 1, [c('sampleSpectrometer'), d(20)], { stack: 1280 })
```
(stack 1280 is given so that the start does not crash; the player sees a comfortable stack. RAM star can be reduced further only to 1268 so there is no extra RAM trick.)

`solution()`: `stage2.solution()` plus
```js
task('spectro', 1, [c('sampleSpectrometer'), un(20)], { stack: 1280 })
```
Priorities are NOT retuned: every other unit keeps its stage 2 priority (lights 4, motor 3, telemetry 2, camera 1). Spectro stays at 1 on purpose, see Open risks.

ESP-IDF form of the fix: `TickType_t last = xTaskGetTickCount(); for(;;){ sample(); vTaskDelayUntil(&last, pdMS_TO_TICKS(20)); }`.

## 5. Objectives (goals strings, in order) and check expressions
Helpers: `s = S_(K,'sampleSpectrometer')`, `n = s.length`, `drift = n ? Math.max(...s.map((t,k)=>Math.abs(t-k*20))) : Infinity`, `steady` and `seen` as in stage 2 (tolerance 3 ms).

| # | Goal text | Check | Start | Solution |
|---|---|---|---|---|
| 0 | `Spectrometer: 145 to 155 samples started in 3 s (50 Hz)` | `n>=145 && n<=155`, text `${n} samples` | 91 -> fail | 150 -> ok |
| 1 | `Spectrometer: sample k starts within 25 ms of k x 20 ms (no drift)` | `drift<=25`, text `worst drift ${drift} ms` | 1197 ms -> fail | 17 ms -> ok |
| 2 | `Still working from stage 2: motor never more than 11 ms between two motorStep() calls` | `maxGap(S_(K,'motorStep'))<=11`, text `worst gap ${m} ms` | 10 ok | 10 ok |
| 3 | `Still working from stage 2: telemetry never more than 105 ms between packets, at least 27 sent` | as stage 2 obj 2 | 100 ms, 30 pkts ok | 100 ms, 30 pkts ok |
| 4 | `Still working from stage 1: BEACON every 500 ms and HEART every 200 ms (within 3 ms)` | `steady(b,500,5) && steady(h,200,13)`, text `seen(b)` / `seen(h)` | ok | ok (500 / 200) |

Count window upper bound 155 stops a "too fast" period from passing silently.

## 6. Bonus
`B(85, 8400)`.
- Solution: CPU 81%, RAM 8256 B. Lazy stack 4096 (otherwise correct): CPU 81%, RAM 11072 -> misses the RAM star.
- CPU target is workload-driven (the spectrometer adds about 25%), so it is a weak discriminator; wrong answers that sample less (d(20): 73%) have lower CPU but fail objectives. See risks.

## 7. Wrong answers (replayed against the solution; `p.units[5]` is spectro)
| name | apply | result (measured) | says |
|---|---|---|---|
| plain delay (the original bug) | `units[5].code[1] = d(20)` | fails #0, #1: 91 samples, drift 1197 ms; others ok, cpu 73%, ram 8256 | `drift` |
| delay with a fudge value | `units[5].code[1] = d(15)` | fails #0, #1: 112 samples, drift 769 ms; cpu 77% | `drift` |
| wrong period in delayUntil | `units[5].code[1] = un(25)` | fails #0, #1: 120 samples, drift 596 ms; cpu 76% | `drift` |
| spectrometer above everything | `units[5].prio = 5` (with `un(20)`) | fails #2, #3: motor worst gap 12 ms, telemetry worst gap 114 ms; #0 #1 hold (150 samples, drift 0); cpu 80% | `hog` |
| stack too small | `units[5].stack = 1024` | crash, matches `/stack overflow/` | (crash reaction) |
| sample loop without a delay | `units[5].code.pop()` | crash, matches `/task_wdt/` | (watchdog reaction) |

Also measured, not wrong answers: `un(20)` at priorities 3 or 4 fails #2 (motor 12 ms) and #3 (tel 114 ms); priority 2 fails #3 (tel 114 ms); priority 1 passes. `until(10)` crashes with `task_wdt` (sampling at 100 Hz needs more than 100% of the CPU with the rest).

## 8. Reactions (keys; `diagnose(K, res)`)
Required by verify: `watchdog`, `crash`, `fail`, `pass`. Stage specific:
- `drift`: `!res[0][0] || !res[1][0]` and `n < 145`. The sample loop is falling behind: the delay is counted from the end of the work, so every lap adds the work time (3 to 7 ms). Hint toward vTaskDelayUntil, keep period 20.
- `hog`: `res[0][0] && res[1][0] && (!res[2][0] || !res[3][0])`. Sampling is steady but motor or telemetry now miss deadlines: the spectrometer was given a priority above work with tighter slack. (Reply should say: 25 ms of drift is allowed, so it does not need to be on top.)
- `lights`: `!res[4][0]` (lights off beat, should not happen with the reference stack; kept as safety net).
- `fail`: anything else. `pass`: all ok. Order in `diagnose`: `!res[0][0] || !res[1][0]` -> `drift`; `!res[2][0] || !res[3][0]` -> `hog`; `!res[4][0]` -> `lights`; else `fail`. (Case n > 155 falls into `drift`; the reply must therefore not claim "too few".)

## 9. Theory outline
1. **Ticks and what a delay is** — diagram: timeline of 1 ms ticks with a task sleeping/ready; widget: tick-rate slider (100 / 1000 Hz) showing `pdMS_TO_TICKS(20)`. Check: how many ticks is 20 ms at 100 Hz?
2. **vTaskDelay counts from now** — diagram: work bar + delay bar, period = work + delay. Widget: work-time slider showing the real period and rate. Check: work 5 ms, delay 20 ms, what is the period?
3. **Drift adds up** — diagram: ideal 20 ms grid vs real grid, growing gap. Widget: lap counter showing accumulated lateness over 3 s. Check: lateness after 100 laps with 3 ms overrun?
4. **vTaskDelayUntil: counting from a fixed mark** — diagram: wake marks `last += period`, work shrinking the sleep. Widget: toggle delay/until over the same variable work. Check: which call keeps 50 Hz?
5. **Jitter is not drift** — diagram: samples scattered around grid slots but not walking away; priorities and preemption move a start by a few ms. Widget: higher-priority load slider showing jitter while drift stays 0. Check: what does a preempted wake-up change?
6. **Missed deadlines and the limits** — diagram: work longer than period, `until` returns immediately and catches up; `xTaskDelayUntil` return value. Widget: period vs work cost slider turning the bar red at 100% CPU. Check: what happens when work > period?
7. (optional) **Real ESP-IDF settings** — tick rate, `CONFIG_FREERTOS_HZ`, 32-bit tick wrap.

Facts to verify against ESP-IDF docs / FreeRTOS docs:
- ESP-IDF default `CONFIG_FREERTOS_HZ` is 100 (10 ms tick); the game uses 1000 and must say so. At 100 Hz `pdMS_TO_TICKS(20)` = 2 ticks, and delays shorter than a tick round to 0/1 tick.
- `vTaskDelay` blocks for N ticks counted from the call; `vTaskDelayUntil(&prevWake, inc)` is the legacy API, `xTaskDelayUntil` returns `pdTRUE` if the task was delayed, `pdFALSE` if the wake time had already passed; ESP-IDF FreeRTOS version in use (IDF v5.x: FreeRTOS 10.4/10.5) supports both.
- `xTaskGetTickCount()` initial value for `prevWake`; tick count wrap time (32-bit at 1 kHz is about 49.7 days) is handled by the kernel.
- Behaviour when work exceeds the period (no missed wakes are queued beyond catching up).
- `portTICK_PERIOD_MS` and `pdMS_TO_TICKS` usage.

## 10. Open risks
- Priority tuning is deliberately avoided: with `un(20)` any spectrometer priority above telemetry (2) pushes telemetry to 114 ms (> 105) and priorities 3 and above also push the motor to 12 ms. The reference keeps spectro at 1, so the spectrometer shows jitter (consecutive starts 7 to 35 ms apart, drift max 17 ms) while the average rate is exact. Objective 1 therefore checks drift with a 25 ms tolerance, not jitter. Theory section 5 should say this honestly. A stricter jitter goal would need retuned stage 2 priorities and loosened telemetry; not done.
- CPU star is weak (see section 6). The one robust discriminator is RAM.
- Camera frames drop to 11 (stage 2 solution: 15), still above stage 2's own threshold 12? NO: 11 < 12, so the stage 2 camera objective is intentionally not a regression here (CPU is about 80% loaded). Builder must not add it.
- `until` placed before the sample call shifts every start by 20 ms (drift 20, 149 samples) and still passes obj 0 and 1; accepted as a valid second solution.
- `reactions.hog` wording assumes spectro has priority above 1 or 2; verify.js only requires diagnose to return the `says` key for the `hog` wrong answer (measured: res #2 and #3 fail).
