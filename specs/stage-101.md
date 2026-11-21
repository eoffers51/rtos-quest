# Stage 101 spec: Martian Night (side mission, ESP32 sleep modes)

All numbers were measured with `runSim` (T = 30000, 1 core, `power: true`) on the programs below. Every program has exactly one unit, `reporter` (index 0), and a measured run takes under a second. No kernel change is needed: the power model, `pm` object, `wt`/`ds` ops, `wakeTimer`/`deepSleep` handling and the four Wi-Fi rover functions already exist in `src/kernel.js` and `verify.js` already lists the two ops.

## 1. Identity
- id: 101, `side: true`, `power: true`
- adds (build log line): `Night mode: temperature reports on a power budget`
- slug: `martian-night`
- title: Martian Night
- topic: ESP32 sleep modes: light sleep, deep sleep and what a wake-up costs
- file: `main/night_report.c`
- T: 30000, cores: 1
- pins: `[]` (no GPIO row; the chart shows the task row and the current row)
- ops: `['call', 'delay', 'busy', 'wakeTimer', 'deepSleep']`
- fns: `['readTemperature', 'wifiConnect', 'wifiSend', 'wifiStop']`
- objects the player may add: `pm` (`{ type: 'pm', lightSleep: true|false }`, shown as `esp_pm_configure(...)`)
- Reporting interval: 10 s (game time, 1 ms ticks).

## 2. Story
The rover is parked for the Martian night. The only job left is to send the outside temperature to Mission Control every 10 seconds, and the battery has to last until sunrise. The code works: it reads the sensor, connects Wi-Fi, sends, then waits with `vTaskDelay(10000)`, but it leaves Wi-Fi switched on and never lets the chip sleep, so the rover burns 106 mA all night instead of a few mA.

## 3. Kernel additions
None. Used as they are:
- Power model (mA): run 40, idle 25, light sleep 0.8, deep sleep 0.01, +80 while Wi-Fi is started, +50 while a radio call runs, `BOOT` 30 ms.
- `readTemperature` (2 ms CPU, 400 B stack, sets `x`), `wifiConnect` (120 ms blocked, 5 ms CPU, 2600 B stack), `wifiSend` (25 ms blocked, 2 ms CPU, 1800 B stack, pushes `K.t` into `K.w.reports` when Wi-Fi is up and `x` is set; otherwise `K.bad(...)`), `wifiStop` (1 ms CPU).
- Minimum stack of the task is 768 + 2600 = 3368 B (wifiConnect). The start gives 4096 B; RAM is not graded.
- UI work the builder must check (not provable here): the editor must offer the `pm` object with a light-sleep toggle and the `wt`/`ds` ops; the chart must show the current row and the timeline must cope with T = 30000 ms.

## 4. Programs
Helpers: `rd = c('readTemperature')`, `cn = c('wifiConnect')`, `sd = c('wifiSend')`, `st = c('wifiStop')`.

`start(null)`:
```js
{ objs: {}, units: [ task('reporter', 2, [rd, cn, sd, d(10000)], { stack: 4096 }) ] }
```
(ESP-IDF form: `for(;;){ x = read_temp(); wifi_connect(); send(x); vTaskDelay(pdMS_TO_TICKS(10000)); }`, with Wi-Fi left on.)

`solution()` (deep sleep, the three-star answer):
```js
{ objs: {}, units: [ task('reporter', 2, [rd, cn, sd, st, wt(10000), ds()], { stack: 4096 }) ] }
```
Code indexes: 0 read, 1 connect, 2 send, 3 stop, 4 wake timer, 5 deep sleep.

Valid but weaker answer (light sleep, two stars, measured below):
```js
{ objs: { pm: { type: 'pm', lightSleep: true } }, units: [ task('reporter', 2, [rd, cn, sd, st, d(10000)], { stack: 4096 }) ] }
```
Other accepted variants: deep sleep without `st` (the reset kills Wi-Fi anyway, 2.47 mA, passes all stars); `wt` from 9800 to 10100; light sleep with `d(9850)` (3.16 mA).

Simplifications the theory must state: the 120 ms Wi-Fi connect is paid on every report in both modes (the simulator never sleeps while Wi-Fi is started, and the game has no "stay associated" modem sleep); `BOOT` is 30 ms (a real ESP32 takes about 100 to 300 ms from the ROM bootloader to `app_main`); the mA figures are rounded datasheet numbers; the game tick is 1 ms (ESP-IDF default is 10 ms).

## 5. Objectives (goals, in order) and checks
Helpers: `reps = K.w.reports || []`, `g = gapsOf(reps)`.

| # | Goal text | Check | Start | Solution |
|---|---|---|---|---|
| 0 | `Reporting: at least 3 temperature readings reach Mission Control in 30 s` | `reps.length >= 3`, text `${reps.length} readings delivered` | 3 ok | 3 ok |
| 1 | `Reporting: a reading every 10 s (each gap between 9700 and 10300 ms)` | `g.length >= 2 && g.every(x => x >= 9700 && x <= 10300)`, text `gaps: ${g.join(', ') \|\| 'none'} ms` | 10154, 10154 ok | 10186, 10186 ok |
| 2 | `Every report is a fresh reading sent over a live Wi-Fi link (no driver errors)` | `K.stats.viol === 0`, text `${K.stats.viol} driver error(s)` | 0 ok | 0 ok |
| 3 | `Night budget: average current at most 40 mA` | `K.m.avgmA <= 40`, text `${K.m.avgmA} mA average` | 105.76 NO | 2.46 ok |

The start passes #0 to #2 on purpose (it works) and fails only #3. Objective #3 is the one-star gate: stopping Wi-Fi is enough for it (26.98 mA), sleeping is not required.

## 6. Bonus (two stars, `bonus: [{label, ok}, ...]`)
- `Light sleeper: average current at most 3.5 mA` : `K => K.m.avgmA <= 3.5`
- `Deep sleeper: average current at most 2.8 mA` : `K => K.m.avgmA <= 2.8`

Measured average current (mA) and stars:

| program | avg mA | stars |
|---|---|---|
| start (Wi-Fi on, plain delay) | 105.76 | 0 (fails #3) |
| `st` added, no `pm` (idle 25 mA between reports) | 26.98 | 1 |
| light sleep, Wi-Fi stopped | 3.16 | 2 (clears 3.5 by 10%, misses 2.8 by 13%) |
| deep sleep (solution) | 2.46 | 3 (clears 2.8 by 12%) |
| deep sleep, wake timer 9800 ms | 2.71 | 3 (thin, 3%) |
| deep sleep, wake timer 9600 ms | 3.29 | 2 (4 reports in the window; more cycles, more boot and Wi-Fi) |

Why deep wins here: per cycle both modes pay the same Wi-Fi connect and send; light sleep then costs 0.8 mA for about 9.8 s, deep sleep costs 30 ms of boot at 40 mA (1.2 mA x 0.001 s scale) and almost nothing in sleep. Break-even is an interval of roughly 1.5 s (boot energy about 1.2 mA s divided by the 0.8 mA light-sleep current, see theory section 6). At a 1 s interval light sleep would win.

## 7. Wrong answers (replayed on the solution; `p.units[0]` is `reporter`)
| name | apply | result (measured) | fails / crash | says |
|---|---|---|---|---|
| deep sleep with no wake source | `code.splice(4, 1)` (drops `wt`) | 1 report, then asleep for the rest of the test, 0.8 mA, 1 sleep, no boot | fails #0, #1 | `nowake` |
| forgot Wi-Fi after waking | `code.splice(1, 1)` (drops `cn`) | 0 reports, 3 driver errors (ESP_ERR_WIFI_NOT_CONNECT), 0.31 mA | fails #0, #1, #2 | `lostState` |
| forgot to read after waking | `code.splice(0, 1)` (drops `rd`) | 0 reports, 3 driver errors (empty packet), 2.45 mA | fails #0, #1, #2 | `lostState` |
| sleeping before sending | `code = [rd, cn, wt(10000), ds(), sd, st]` | 0 reports (code after `ds()` never runs), 0 errors, 2.05 mA | fails #0, #1 | `lostState` |
| wake timer in the wrong unit | `code[4] = wt(10)` | 153 reports, gaps 196 ms, 127.17 mA | fails #1, #3 | `tooOften` |
| light sleep, Wi-Fi left on | `objs.pm = {type:'pm', lightSleep:true}; code = [rd, cn, sd, d(10000)]` | never sleeps, 105.76 mA, reports fine | fails #3 | `wifiOn` |
| busy-wait instead of delay | `code = [rd, cn, sd, st, bz(10000)]` | crash `task_wdt` at 751 ms | crash `task_wdt` | (watchdog reaction) |

Also measured, not wrong answers: wake timer 10120 gives gaps of 10306 and fails #1 only (reaction `fail`); `d(10000)` without `pm` but with `st` is the one-star answer; empty task bodies and no tasks fail #0 (empty bodies hit `task_wdt`).

## 8. Reactions
Required by verify: `watchdog`, `crash`, `fail`, `pass`. Stage specific:
- `nowake` : `K.w.sleeps > 0 && !K.w.boots` (the chip went to deep sleep and never woke): you never set a wake source; `esp_deep_sleep_start()` with no wake-up source sleeps until someone presses reset.
- `lostState` : no report delivered at all, or `K.stats.viol > 0`: after a deep-sleep wake the chip has reset, Wi-Fi is down, `x` is gone, the task starts from the first line; code after `esp_deep_sleep_start()` never runs.
- `tooOften` : reports exist but the smallest gap is under 9700 ms: the wake timer is in microseconds in ESP-IDF, the game takes milliseconds; the chip woke far too often and the boot plus Wi-Fi cost ate the battery.
- `wifiOn` : #3 fails and `K.objs.pm` exists: light sleep is configured but the radio is still on, so the idle task never gets to sleep; stop Wi-Fi first.
- `awake` : #3 fails and there is no `pm` object: the CPU idles at 25 mA (and Wi-Fi adds 80 if left on) between reports; stop the radio, then let the chip sleep.
- `fail`: anything else (for example the interval is too long).

`diagnose(K, res)` order:
1. `!res[0][0] || !res[1][0]`: if `K.w.sleeps && !K.w.boots` return `nowake`; else if no reports return `lostState`; else if the smallest gap is under 9700 return `tooOften`; else `fail`.
2. `!res[2][0]`: `lostState`.
3. `!res[3][0]`: `K.objs.pm ? wifiOn : awake`.
4. else `fail`.
The `pass` reply may mention the star tier reached (1, 2 or 3 stars) and the light-versus-deep trade-off; this is copy-writer work.

## 9. Theory outline
1. **Where the current goes** : diagram: a bar stack of the model (run 40, idle 25, Wi-Fi +80, transmit +50, light 0.8, deep 0.01 mA) on a log-like scale. Widget: a state-mix calculator (percent of time in each state, shows average mA and battery days for a 2000 mAh pack). Check: a chip idles at 25 mA with Wi-Fi on; what dominates, the CPU or the radio?
2. **Idle is not sleep** : diagram: the idle task running `WFI` at full clock versus the chip clock-gated in light sleep. Widget: the game's own chart with a toggle for `vTaskDelay` versus busy-wait. Check: why does `bz(10000)` crash while `d(10000)` does not?
3. **Automatic light sleep and tickless idle** : diagram: timeline where the idle task finds the next wake-up more than 3 ticks away, stops the tick, sleeps, wakes on a timer. Widget: slider for the next wake-up distance (1 to 20 ms) showing sleep or no sleep. Check: next wake-up in 2 ticks, does the chip sleep? Code: `esp_pm_config_esp32_t cfg = { .max_freq_mhz = 240, .min_freq_mhz = 80, .light_sleep_enable = true }; esp_pm_configure(&cfg);`.
4. **Deep sleep: switching almost everything off** : diagram: what stays powered (RTC controller, RTC memory, wake sources) and what does not. Widget: the same timeline with a 'sleep for N ms' slider. Check: which call starts it, and does it return?
5. **Waking is a reset** : diagram: boot timeline (wake, ROM and bootloader, `app_main`, reconnect Wi-Fi, send, sleep) with the 30 ms BOOT bar and the 120 ms connect bar. Widget: replay of the solution with a log of `rst:0x5 (DEEPSLEEP_RESET)` lines and what survives (`RTC_DATA_ATTR`) versus what is lost. Check: a global variable set before sleep, what is its value after?
6. **Light or deep: the trade-off** : diagram: two curves of average current against interval, crossing near 1.5 s. Widget: interval slider and boot-cost slider that moves the crossing. Check: at a 1 s interval which mode is cheaper in this model, and why?
7. **Real hardware notes** (optional) : dev-board numbers (USB-UART chip and regulator add milliamps), Wi-Fi modem sleep, wake sources (timer, GPIO `ext0`/`ext1`, touch), `esp_sleep_get_wakeup_cause()`.

Facts to verify against ESP-IDF documentation:
- `esp_sleep_enable_timer_wakeup(uint64_t time_in_us)` takes microseconds; `esp_deep_sleep_start()` does not return; with no wake source configured the chip sleeps until reset.
- Deep sleep keeps only RTC peripherals and RTC memory (`RTC_DATA_ATTR`); everything else is lost and the application restarts from the bootloader; reset reason is `ESP_RST_DEEPSLEEP`; the log line `rst:0x5 (DEEPSLEEP_RESET)` is correct for the ESP32.
- Automatic light sleep needs `CONFIG_PM_ENABLE` and `CONFIG_FREERTOS_USE_TICKLESS_IDLE`; `esp_pm_configure()` takes `esp_pm_config_esp32_t` (`max_freq_mhz`, `min_freq_mhz`, `light_sleep_enable`); the idle task enters light sleep when the next wake-up is further away than `CONFIG_FREERTOS_IDLE_TIME_BEFORE_SLEEP` ticks (default 3), which is the rule used by the simulator.
- Real ESP32 can combine automatic light sleep with a connected Wi-Fi station (`esp_wifi_set_ps(WIFI_PS_MIN_MODEM)` or `MAX_MODEM`), unlike the simulator; the theory must say that this lesson simplifies it away and why it still teaches the right lesson (stopping the radio has the biggest effect).
- Typical figures: active CPU about 30 to 70 mA, Wi-Fi transmit 160 to 240 mA, light sleep about 0.8 mA, deep sleep about 10 uA for the chip alone (more on dev boards). The game numbers are rounded; say so.
- ESP-IDF default tick is 100 Hz (`CONFIG_FREERTOS_HZ`); the game uses 1000 Hz.
- Is `esp_wifi_stop()` before deep sleep recommended (yes in docs for clean shutdown; the reset would kill Wi-Fi anyway).

## 10. Open risks
- Whether the editor, chart and timeline already support the `pm` object, the two new ops, the current row and T = 30000 ms is not proven; only the simulator and `verify.js` are.
- Average current in a deep-sleep run depends on where T cuts the cycle (the last cycle is incomplete); the thresholds have 10 to 13% margin on the measured values but a player who shortens the wake timer by 400 ms or more (4 reports in the window) loses the third star; this is intended but should be mentioned in a hint.
- Both light and deep sleep pay the full Wi-Fi connect each cycle, so the gap between them is only 22% (3.16 against 2.46 mA). A 5 s interval with T = 20000 measured 5.52 against 4.93 mA (11%), too thin for margins, which is why the interval is 10 s.
- The one-star gate (#3, 40 mA) is a current objective, not a reporting one, because the start already reports correctly and verify requires the start to fail something. If the builder wants a purely functional one-star set, the start would have to be broken some other way (not done).
- `reactions.tooOften` wording blames units: the real API is microseconds and the game's `wt()` is milliseconds; copy must not suggest that the simulator is wrong.
- Wrong answer "light sleep, Wi-Fi left on" relies on the simulator rule that light sleep never happens while Wi-Fi is started, which differs from real ESP-IDF with modem sleep; the reply should say so.
