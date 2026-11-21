# Review: lesson 101, Martian Night

Reviewed from markup, copy and diagram code only; nothing was rendered. Points that need a person to look at the page are marked "visual check".

## Verdict
The core loop is good: the learner flashes a working-but-wasteful program, reads the power chart, and has several valid designs (radio off, light sleep, deep sleep) with star targets that reward better engineering. The weak spots are that the manual and hints give away the experiment before the learner tries it, that the pass gate can be met with one call so the sleep-mode skill lives only in the stars, and that the manual carries too much configuration detail and jargon for a first read. Fix presentation and sequencing; the simulator numbers and objectives are right as they are.

## Keep
- The "flash it as it is and read the chart first" briefing: a clear broken-first start with a measurable problem.
- Reactions for nowake, lostState, tooOften and wifiOn explain the cause and say what to look at next, and wifiOn declares the simulator simplification versus real modem sleep.
- Declared simplifications (1 ms tick, rounded mA, 30 ms boot, microseconds versus ms) and the real-code listing with comments.
- The light-versus-deep crossover diagram and the sleeplab widget: one question each, consequence visible.

## Findings

### L101-1 (high, theory) The manual spoils the experiment
- where: martian-night.content.js section 1 ("Stopping it alone gets the average down to 26.98 mA, which clears the 40 mA gate"), section 4 (`wt(10)` ... 153 times, 127 mA), section 6 ("shorten the wake timer by 400 ms ... 3.29 mA"); copy.js hints[3] (the 400 ms margin).
- problem: The briefing says to measure first, but the manual states the diagnosis, the fix and the exact trap numbers before the learner has hit any of them. The wrong attempts that should teach (no wake source, forgotten reconnect, ms versus us) become things the learner was warned about, so they are not discovered.
- principle: Productive failure; scaffolding and fading (hints come after an attempt, not before).
- change: Keep section 1 to the model (what each state costs, the formula charge = current x time) and move the "stop Wi-Fi alone gives 26.98 mA", the 153-wake and 3.29 mA examples into the post-pass material (reactions.pass or a "debrief" block shown after the first pass). Replace the section 1 bullet with: "Run the start program and read the average. Which line of the table above accounts for most of it?" Hint 4 should only say "The star budget has a window: a timer that is too short or too long costs a star. Check how many reports fit in 30 s."
- effort: M

### L101-2 (high, copy) The pass gate hides the skill the lesson is about
- where: martian-night.js goals ("Night budget: average current at most 40 mA"); copy.js briefing (never mentions stars); reactions.pass.
- problem: Stopping Wi-Fi alone reaches 27 mA and passes every objective. A learner can finish without meeting light sleep or deep sleep, then learns that stars exist only in the pass message. The sleep modes (the stated topic) are assessed only by optional targets the learner has not seen.
- principle: Constructive alignment; goals clear before play.
- change: Do not change the thresholds. Add to the end of briefing paragraph 3: "Passing needs 40 mA. Two star targets sit below it: 3.5 mA and 2.8 mA. The stars are where the chip's sleep modes come in." Reword the star labels to carry the lesson: "Light sleeper: at most 3.5 mA (chip sleeps, Wi-Fi off)" and "Deep sleeper: at most 2.8 mA (chip powers down between reports)". Check that the stars panel shows these before the first flash (visual check).
- effort: S

### L101-3 (medium, theory) Quiz tests recall, and the answers are predictable
- where: martian-night.content.js `quiz`. Correct indices are 1, 2, 1, 1, 1, 1: five of six answers are option B. Q1, Q2, Q4 are answerable from one manual sentence; there is a stray `null` at the end.
- problem: A learner who guesses B scores 83% without reading. Most questions ask for a definition (what does the call do) rather than a consequence.
- principle: Retrieval practice at Bloom apply/analyse level; assessment aligned to the skill (decide and predict).
- change: Shuffle so correct options spread over A, B and C and are not systematically the longest. Replace Q2 (watchdog) with a design case: "Your sensor must be read every 60 s and the code keeps a running count in a plain global. Which design keeps the count correct?" with options light sleep, deep sleep with a plain global, deep sleep with an RTC_DATA_ATTR counter. Add one pin-wake case: "A bumper must wake the rover within milliseconds, the interval is 5 min. Which mode and why?" (light sleep keeps state and wakes faster, deep sleep needs an ext0 wake source). Remove the `null`.
- effort: M

### L101-4 (medium, theory) Manual is too dense and jargon-heavy for a first read
- where: sections 3 and 5 of the manual: the `CONFIG_FREERTOS_IDLE_TIME_BEFORE_SLEEP` bullet (3 versus 8 ticks, `PM_SLP_IRAM_OPT`), the next bullet repeating 3 versus 8 ticks, the `ESP_ERR_WIFI_NOT_INIT` / `ESP_ERR_WIFI_NOT_CONNECT` bullet, the boot-time bullet with `startup_time` and `CONFIG_BOOTLOADER_SKIP_VALIDATE_IN_DEEP_SLEEP`. Terms used before they are explained: WAITI/WFI, tickless, RTC domain, ULP, BSSID, ext0/ext1.
- problem: A learner who needs "light sleep keeps RAM, deep sleep resets" must read 7 sections and wade through Kconfig names. Bullets of 60+ words are hard for non-native readers, and the 3-ticks threshold is stated twice.
- principle: Segmenting and pre-training; cognitive load (extraneous detail); prior knowledge (terms before use).
- change: Cut sections 3 to 5 to the essentials each (two to four short bullets, one idea per bullet). Move the Kconfig defaults, tick-threshold detail, error-code names and boot-time measurement to section 7, "Real hardware notes", as a clearly labelled "Going further" list. Delete the duplicated 3-tick bullet. Define WFI, RTC and ULP in one plain sentence at first use, or drop ULP and BSSID from the first read. Aim for sentences under 25 words.
- effort: M

### L101-5 (medium, theory) Diagram colours change meaning between figures
- where: content.js diagrams. In `currentDia`, light sleep is class `g`, deep sleep `d`, idle and running both `c`, radio `r`. In `crossDia` light sleep is a hard-coded orange (#ffb347) and deep sleep cyan (#5fe3ff). In `bootDia` red `r` means "BOOT", in `deepDia` red means "lost", in `currentDia` red means "radio transmitting". `idleDia` and the chart show idle and running in the same class.
- problem: The learner cannot carry the colour code from one figure to the next, so each figure must be decoded again. "Running" and "idle" look identical in `currentDia`, although they differ by 15 mA. Colour is the only link between a bar and its meaning in some figures.
- principle: Consistent visual vocabulary; signalling; colour not the only signal.
- change: Fix one mapping for the lesson and use the game's existing classes: light sleep always `g`, deep sleep always `d`, radio always `a`, CPU running `c`, idle a distinct class from running, "lost/cost spike" `r`. Draw `crossDia` lines with the same classes (or the same token values) instead of hex codes, and label the line ends directly (already done). Give `bootDia` boot a class other than `r` or add a one-line colour legend under each figure. Add tick values to the y axis of `crossDia`. Check legibility of the 12-14 px text at phone width (visual check).
- effort: M

### L101-6 (medium, copy) Hint ladder merges two solution paths, and fail feedback is generic
- where: copy.js `hints[1]` and `hints[2]`; `reactions.fail` ("Not there yet. Compare the chart with the objectives...").
- problem: Hint 2 and 3 describe light sleep and deep sleep together, so the learner chasing one path reads half of each hint about the other. The restructure for deep sleep (loop becomes "work, sleep", the task restarts) is mentioned only in lostState, after the failure. The generic `fail` message tells the learner nothing about what to look at next.
- principle: Scaffolding as a ladder from nudge to near-answer; feedback specific to the cause.
- change: Keep hint 1. Hint 2: "Two separate changes are needed: switch off the radio, and let the chip sleep while it waits. Start with the radio." Hint 3: "Light sleep is a setting plus the same delay you already have. Deep sleep is a different shape: after the send, set the wake-up timer in microseconds and call the sleep function, and the task starts again from its first line after every wake." Hint 4 as in L101-1. Replace `reactions.fail` with: "Not there yet. Open the objectives list: the red line says what is missing. Reports late or missing: look at the timer and the order of the calls. Reports fine but the average high: look at what is still switched on between reports."
- effort: S

### L101-7 (low, copy) Solution note gives away its own prediction task
- where: copy.js `solutionNote[1]`: "Predict which mode wins at one second before you read the averages. Light sleep should come out cheaper."
- problem: The prediction exercise is answered in the next sentence. Also, at a 1000 ms interval the timing objectives will turn red (gaps must be 9700 to 10300 ms), which a learner may read as failure.
- principle: Retrieval and prediction before feedback; safe failure.
- change: Replace with: "Experiment: switch to light sleep, keep the stop call, and change the interval to 1000 ms. Write down which mode you expect to cost less at one second and why, then compare the averages. The timing objectives will turn red on purpose: you are now measuring cost, not passing the mission. Open the lab in section 6 to check your reasoning."
- effort: S

## Visual pass

Based on the six lesson-101 screenshots (briefing, fail, solved, manual-0, -2, -4) and `game-phone.png`. Still frames only: animation, sound, timing and hover tooltips cannot be judged. The only phone shot is lesson 1, so the 400 px layout of this stage is inferred, not seen.

### Verdict
The screen hierarchy works: objectives on the right, code on the left, and the fail state pairs a tick or cross with a number under each objective. But this lesson is about current over time, and the main screen shows current as one thin red strip with no scale, while the key number sits in 11 px console text. Code lines that carry the cost annotations are cut off at the panel edge, and several manual diagrams have clipped or colliding labels.

### Keep
- Objective rows in `lesson-101-fail.png`: check mark and cross plus a measured value ("105.76 mA average", "gaps: 10154, 10154 ms"). Pass and fail do not depend on colour alone.
- The three-star row and the star objectives listed under the pass gate, visible before the first run in `lesson-101-briefing.png`.
- The log-scale bar chart in `lesson-101-manual-0.png`: one message, direct value labels, orange for the radio.

### Findings

### V101-1 (high, ui) The power chart is too small to carry the lesson
- where: `lesson-101-fail.png`, timing panel, row "current" (about 14 px high, a solid red band across the full 30 s) and the console line "average current 105.76 mA" below it. `lesson-101-briefing.png` shows the same band before any run, at T+0000 ms and 0% CPU.
- problem: The player must compare a 105 mA run with a 2.8 mA target, but the strip has no axis, no 40 mA line and no number. It is the same red in both states, so a learner cannot see the difference between 105 mA and 3 mA. The briefing also shows a filled chart before anything has run, which looks like stale data. The one decisive number is in small grey console text at the bottom.
- principle: Signalling; spatial contiguity; state visibility (stale versus current).
- change: Make the "current" row taller (about 40 px) as a step plot with a label at the right ("avg 105.76 mA") and horizontal marker lines at 40, 3.5 and 2.8 mA, using the same colours as the star rows. Clear the chart on load and on reset, and show "no run yet". Also copy the average into the HUD next to the CPU readout.
- effort: M

### V101-2 (high, ui) Code lines are clipped at the editor edge, including the cost comments
- where: `lesson-101-briefing.png`, left panel: `esp_pm_configure(&(esp_pm_config_t){ .max_freq_mhz = 160, .min…`, the comment "// tasks: function, name, stack (bytes), argument, ha…", `xTaskCreate(… NU…`, and the comments "// blocks 120 ms while associating", "// blocks 25 ms · 2 ms CPU · 1800 B" cut at "↑ ↓ ×". Under the code the panel is empty down to the buttons.
- problem: The comments that give each call's time and cost are the data the learner needs for the energy sum, and they are cut. Nothing shows that the line continues. In `lesson-101-solved.png` the added `esp_sleep_enable_timer_wakeup(10000 * 1000ULL)` and `esp_deep_sleep_start` lines are clipped the same way. About 200 px of the panel is unused.
- principle: Readability; extraneous load (hidden information); layout (wasted space).
- change: Wrap long code and comment lines (allow `white-space: pre-wrap` with a hanging indent) or move the per-instruction cost to a right-aligned chip that stays visible. Break the `esp_pm_configure` initialiser over three lines. Check that no line needs horizontal scrolling at 1440 px.
- effort: M

### V101-3 (medium, theory) Manual diagrams have clipped and colliding labels
- where: `lesson-101-manual-0.png` chart title "(log scale: every grid line is 10 …" cut at the right; "40 mA" label sits on a dashed grid line; row label "running, radio transmitting" touches the left edge; legend swatches for "idle" and "deep sleep" are near-identical dark grey. `lesson-101-manual-2.png`: "n ≥ 3 ?" overlaps the arrow, "yes: stop the tick, light sleep" runs to the box border, and the code block is cut at "backward-compatibility alia…". `lesson-101-manual-4.png`: "wifiStop," cut at the right edge, the legend swatch overlaps "(boot and read)", the "read 2 ms" label floats away from its 2 ms segment, and the two caption lines are small monospace text inside the figure.
- problem: Each clipped or touching label has to be decoded, and the cut-off words are the ones that explain the figure. Idle and deep sleep cannot be told apart in the legend.
- principle: Spatial contiguity; coherence; consistent visual vocabulary. This adds to L101-5, which covers colour meaning in the source.
- change: Give the SVG viewBoxes 12 to 16 px of padding on the right and left; shorten the chart title to "log scale, one gridline = 10x"; move "40 mA" and "n ≥ 3 ?" off the grid line and the arrow; put the legend on its own row with 12 px between entries; give idle a lighter outline and deep sleep a filled swatch; set diagram captions in the body font below the figure. Wrap or scroll the code block with a visible scrollbar.
- effort: M

### V101-4 (medium, ui) Star rows change shape between states and look squashed when solved
- where: `lesson-101-solved.png`, objectives "Light sleeper" and "Deep sleeper": the earned markers are tall gold ovals about 20 x 40 px, while in `lesson-101-fail.png` the same rows have round hollow rings and the pass rows have a check mark. The result modal covers the centre, and the HUD stars (top bar) stay empty behind it although the modal shows three.
- problem: The earned-star marker is stretched, so it reads as a rendering fault and not a reward. The three-star state in the modal and the empty HUD stars look contradictory. (This screenshot is a reference-solution run, so empty HUD stars may be intended; if so, say it on the modal, as the text there is easy to miss.)
- principle: Consistency; affordance and state; game feel (the reward should look finished).
- change: Give the marker a fixed square size (`flex: none; width: 18px; height: 18px`) and use a star glyph in the earned state to match the HUD stars. Under the three modal stars add one line, "Reference run: stars not saved". Fill the HUD stars on a real run.
- effort: S

### V101-5 (medium, ui) The scene does not show what the firmware is doing
- where: `lesson-101-fail.png` and `lesson-101-briefing.png`: the rover looks the same with the radio on, in sleep and idle. The only state signal is the small header text "RADIO ON" (red, about 11 px) or "DEEP SLEEP" (green) next to the CPU bar. The Mission Control box covers the lower third of the rover and the area between the objectives and the chart.
- problem: The lesson's central event (radio on or off, awake or asleep) is a few pixels of text in the top bar, far from where the player looks. The 3D scene is the most prominent element but carries no information in this stage.
- principle: Intrinsic integration; signalling; feedback placed where the player looks.
- change: Drive visible rover state from the simulator's mode: a pulsing antenna ring while the radio is on, a dimmed rover with a "zzz" label in light sleep, a darker one in deep sleep. Make the HUD state chip larger and a fixed width so it does not move the T+ readout. Not judged here: whether such effects would read well in motion.
- effort: L

### V101-6 (low, ui) Phone layout cannot be confirmed and looks tight for this stage
- where: `game-phone.png` (lesson 1 only): the 3D scene takes the top 380 px, then the HUD, then the editor with `xTaskCreate ( mainLoop , "mainLoop", 4096` already cut off at the right edge; objectives, chart and console are not in view.
- problem: Lesson 101 has longer code lines and a taller chart than lesson 1, so on a 400 px screen the learner would scroll a long way, and sideways, to read the cost comments and see the average current. No phone screenshot exists for this stage.
- principle: Phone-layout usability; layout.
- change: Run `tools/shots.sh --one` with a 400 px width for `?shot=fail#m101` and check that the objectives and the current chart appear above the editor after a run. Apply the line wrapping from V101-2 at phone width and cap the scene height at about 240 px.
- effort: M
