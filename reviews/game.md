# Learning review: whole game

**Verdict.** The core idea is strong: the loop is edit, flash, watch the chart, read the objectives, and the mechanic is the skill (intrinsic integration). Stage 1 starts "broken first", the run takes a fixed ~3 s, and the carried-forward firmware gives a real journey. The weak points are support and feedback: the hints do not adapt, SOLVE skips instead of teaching, wrong-run feedback is rich only in stage 1, and theory sits in a modal that hides the game. Accessibility is thin (colour-led status, tiny text, no dialog semantics). Judged from markup and CSS only; points marked "visual check" need a person.

## Keep
- Broken-first stage 1 (super loop plus busy-wait, then the watchdog reaction naming the cause and pointing at the IDLE row).
- Objectives that show the measured value on failure ("intervals seen: ...") and bonus stars that reward better engineering (RAM, CPU).
- Constant ~3 s playback with SKIP, speed and zoom, and the hover probe on the chart.
- Build log as a journey map with "Rover gains" and "You learn" per stage; regression via inherited firmware.
- Two-click confirm on destructive buttons; reduced-motion handling in JS and CSS.

## Findings

### G-1 (high, copy/ui) Hints are a blind cycle, not a ladder
- where: `src/main.js` `$('#hint').onclick = ... L.hints[hintN % L.hints.length]`; `first-light.js` hints.
- problem: Hint order is fixed and wraps around, so a learner who needs the RAM hint after solving the lights gets the busy-wait hint first. Hint 1 already names the cause and the API, so no nudge stage exists. A reload resets `hintN`.
- principle: Scaffolding as a ladder from nudge to near-answer; feedback that fits the current error.
- change: Pick the hint by state: if the last run crashed or failed, start from the level for that cause (use `diagnose`), else from the first unmet objective. Give each hint 3 levels: (1) a question ("Which row of the chart is empty, and why?"), (2) the concept ("A Blocked task gives the CPU back."), (3) the action (current text). Show "Hint 1 of 3" and let the learner ask for the next level; never wrap. Store the level per stage in `save`.
- effort: M

### G-2 (high, ui/copy) SOLVE replaces the learner's code with no explanation of the difference
- where: `confirmBtn($('#solve'), 'REPLACE MY CODE?' ...)`; `solutionNote`; `save.solved` unlocks the next stage.
- problem: The learner's code is overwritten, cannot be restored, and the solution is simply run. The learner sees a pass but not what differs from their attempt, and the next stage unlocks anyway. This is a skip, not a worked example.
- principle: Worked example with self-explanation; an escape hatch should teach; safe failure.
- change: (a) Before replacing, keep the learner's code (`save.mine[L.id]`) and add an "UNDO SOLVE / MY CODE" button. (b) On the result screen add "What changed": 2 to 4 bullets generated from `solutionNote` (for stage 1: "busy-wait became vTaskDelay", "one task became two", "stack lowered"). (c) After SOLVE, require one check question from that stage's manual before the next stage opens (do not change objectives). (d) Say once in the button label what it does: "SHOW SOLUTION (keeps your code)".
- effort: M

### G-3 (high, copy) Stage 1 briefing front-loads unexplained jargon and four click-throughs
- where: `first-light.js` `briefing`: "super loop", "app_main()", "xTaskCreate" is implied, "task watchdog", "idle task", "Blocked".
- problem: A learner new to RTOS must click through four typewriter lines, then close a panel that covers the scene, before knowing what to do. "Super loop" and "BEACON/HEART" are never defined. After the dialog closes the goal text is only in the small objectives panel.
- principle: Pre-training of key terms; one new concept per step; narrative must not delay the task.
- change: Cut to three lines and end on the action: 1 "TICK-1 is down. Its firmware is a loop on the left." 2 "Goal: BEACON toggles every 500 ms, HEART every 200 ms. Press FLASH & RUN and watch." 3 "It will fail. That is the point; read the chart row called IDLE." Move "super loop / watchdog / idle task" into the post-failure reaction (it is already there) and a one-line glossary tooltip (`<abbr title>`) in the objectives. Add a "SKIP BRIEFING" key hint and re-open briefing via a "?" button in the HUD.
- effort: S

### G-4 (medium, ui) Chart and objectives can show stale or unlabelled state while the learner edits
- where: `main.js` `preview()` is called on begin and reset only; `editor.js` `onEdit` calls `changed()`; `drawGoals(null,null)` before any run shows all objectives neutral.
- problem: After editing code the timing chart still shows the previous run until FLASH. If it does, a learner can read a chart that no longer matches the code (split attention between code and old evidence). Visual check needed.
- principle: Temporal contiguity; the observe step must refer to the code just run.
- change: On any edit, dim the chart and add a label "OUT OF DATE: code changed since last run" (or re-run `preview()` debounced 300 ms, since the sim is cheap and deterministic). Clear the label on FLASH.
- effort: S

### G-5 (medium, theory/ui) Field manual is a full-screen modal opened on demand, so theory and practice never meet
- where: `#manual` overlay (z-index 7, 92vh), `#openManual` "FIELD MANUAL 0/n", quiz in `mountManual`.
- problem: The learner must leave the code and chart to read, then remember it. Nothing points to the relevant section after a failure. The quiz wrong answer says "Have another look at the section above" and, on the second miss, "The answer is in the section above": it never explains why the chosen option is wrong, and the check questions are optional, so most learners will skip them.
- principle: Split-attention avoidance; feedback about the cause; retrieval practice with consequence questions.
- change: (1) After a failed or crashed run, end the mission-control line with a button "READ: The Blocked state" that opens the manual at the right section (`manNav` already scrolls). (2) Per-option feedback: add `q.wrong[j]` text (one sentence about the misconception) shown on a miss instead of the generic line. (3) Allow the manual as a side drawer at width above 1300 px so code and chart stay visible. (4) Show quiz progress in the Build log per stage.
- effort: M

### G-6 (medium, ui/lesson) Retrieval and spacing come only from regression objectives; the map shows nine stages that cannot be played
- where: `lessons/index.js` `JOURNEY`; build log "IN DEVELOPMENT"; stage briefings.
- problem: Earlier concepts are reused in code but never recalled as questions, so a learner can paste forward without remembering why. Build log lists 12 stages, 9 greyed, which sets the end point but also reads as unfinished. The side mission "Martian Night" sits outside the journey with no stated prerequisite.
- principle: Spaced retrieval; visible mastery; goals clear before play.
- change: Open every stage briefing with one recall prompt from the previous stage (two choices, no penalty): e.g. stage 3 "Last stage, why did a delayed task keep the CPU idle?". Reword the status to "COMING NEXT" and show only the next two planned stages in full, the rest collapsed under "Later in the journey". Label the side mission "After stage 3" or whatever prerequisite is true.
- effort: M

### G-7 (medium, ui) Failure feedback depends on a per-lesson `diagnose`; the default is generic
- where: `finish()`: `L.diagnose ? L.diagnose(K,res) : L.reactions.fail` ("Not there yet. Compare the logic analyzer with the objectives..."); `reactions.crash` ("The serial monitor at the bottom says why."); typewriter dialog opens 1.5 s after a crash.
- problem: Stages without `diagnose` give "not there yet", which says nothing about the cause or where to look. On a crash the learner is sent to the 74 px serial strip. The dialog covers the middle of the 3D scene and needs a click.
- principle: Feedback specific, about the cause, saying what to look at next; never just "wrong".
- change: Make the generic fallback name the failed objective and its measured value ("BEACON: intervals seen 500, 503 ms. Look at the BEACON row in the chart."), and have crash text quote `K.crash.msg` in plain words. Require `diagnose` in the lesson contract. Show feedback as a non-blocking strip above the deck that stays until the next run, not a click-to-dismiss modal.
- effort: M

### G-8 (medium, ui) Accessibility gaps: colour-led status, tiny text, no dialog semantics
- where: `style.css` `#goals li.ok/.no` (green/red, same diamond shape), `.legend` .66rem, `.probe` .66rem, `.tll` .64rem, `.dia .bs` 9.5px; `index.html` `#stars aria-label` static, `#manual/#journey/#result` plain divs, `#dialog` not live; chart is a canvas with hover-only probe.
- problem: Pass and fail differ only by hue and a filled marker; many labels are under 11 px with wide letter-spacing; dialogs have no role, focus handling or Esc for the result; screen readers get no dialogue or result; keyboard users cannot read the chart probe; "best on a desktop screen" excludes phones.
- principle: Colour never the only signal; contrast and size; keyboard and screen-reader access; plain English.
- change: Prefix goal text with a visible "✓ " / "✗ " and set `aria-label`. Raise minimum text to 12 px (.75rem) and reduce letter-spacing on small text. Add `role="dialog" aria-modal="true" aria-labelledby` to the three overlays, move focus in on open and back on close, Esc closes the result. Make `#dialog` `role="status" aria-live="polite"`. Update `#stars` aria-label with the count. Make the chart focusable and step the probe with arrow keys. Visual check needed for contrast of `#6f86a1` and `--dim` on the glass panels.
- effort: M

## Visual pass

Based on the screenshots in `reviews/shots/` (game-title, game-journey, game-phone, lesson-1-briefing, -fail, -solved, -manual-2), all still frames at 1440 x 900 (phone 400 px). Animation, sound and timing cannot be judged from stills. Note: the earlier G-8 claim that pass and fail differ only by hue is out of date; `lesson-1-fail.png` and `-solved.png` now show an X and a check mark in the objectives. The six findings below are new.

### V-1 (high, ui) The phone layout hides the game loop
- where: `game-phone.png`: the 3D scene fills the top 380 px, then header, then the code editor. FLASH & RUN, objectives, chart and serial monitor are below the visible area.
- problem: At 400 px the learner sees the rover and a code block whose lines are cut off at the right edge ("GPIO_MODE_IN", "arg, ", the stack field half hidden) with no sign that it scrolls. The primary action (FLASH & RUN) and the goals are not visible, so the next step is not obvious.
- principle: Visual hierarchy (next action most prominent); signalling; code lines must not be silently truncated.
- change: At narrow widths shrink the scene to about 200 px, make the HUD one compact row, and pin a sticky bar at the bottom with FLASH & RUN plus a "GOALS 0/4" button that opens the objectives. Wrap code lines (`white-space: pre-wrap`) or show a fade and scroll cue on the right edge. The title text "best on a desktop screen" is honest; keep it, but the layout should still reach a first run.
- effort: M

### V-2 (high, ui) Code lines are clipped at the right edge of the editor on desktop
- where: `lesson-1-briefing.png` and `-fail.png`, left panel: the xTaskCreate row ends in "NULL, [1] , NU", the comments end in "ha" and "CPU", and `!gpio_get_level(BEACON_GPIO)` runs into the panel border. In `lesson-1-solved.png` the result card also covers the same lines.
- problem: The learner edits code they cannot fully read. The cut-off trailing arguments (priority, handle) are exactly what a later stage teaches, and the busy-wait comment that names the cause ("spins the CPU") is unreadable.
- principle: Readability; code and prose clearly distinct; no truncated text.
- change: Let editor rows wrap (`flex-wrap: wrap`, comment on its own line below the statement) or widen the left column from about 510 px to 600 px and drop the 4096 field width. Keep the comment visible at all times: it is the signal.
- effort: M

### V-3 (medium, ui) The mission-control dialog and the objectives panel both sit on the rover
- where: `lesson-1-briefing.png`: the dialog box (535-1125 x 437-557) covers the lower body and wheels of the rover and the stage floor; the objectives panel (1140-1427 x 75-325) overlaps the rover's right side and the HEART label. `lesson-1-fail.png`: the red LED on the rover is the best feedback in the scene and stays visible, but the dialog still hides the area under it.
- problem: The 3D scene is where the firmware's effect is shown, yet two panels crop it from the right and the bottom. The dialog also sits between the code and the chart, away from where the eye is when a run ends, and it needs a click, so it feels like a gate.
- principle: Spatial contiguity; coherence (nothing covers the content); feedback placed where the player looks.
- change: Move the rover target so it is centred in the free area between the panels (camera offset to the left of the objectives panel), make the dialog a narrow strip docked over the chart header, and auto-fade it after 6 s on a fail instead of waiting for a click. Keep the typewriter for the first briefing only.
- effort: M

### V-4 (medium, ui) The result card hides the evidence it talks about, and the bonus markers look broken
- where: `lesson-1-solved.png`: the card covers the editor, rover and chart; behind it the "Efficient" and "Lean" markers in the objectives panel are stretched into tall gold ovals, unlike the round rings in `lesson-1-fail.png`. Stars appear twice (header, card) with the header copy dimmed.
- problem: After "REFERENCE SOLUTION" the learner cannot compare their chart with the solved chart: the chart behind the card is a dark smear. The distorted bonus markers look like a rendering bug and make the pass state of the bonus goals unclear.
- principle: Consistency (one marker, one meaning); signalling; the result screen should inform, not only celebrate.
- change: Fix the marker size (`flex: none; width/height` equal, `aspect-ratio: 1`) for the bonus state. Make the result card shorter (about 360 px) and dock it to the centre column so the chart stays visible below it; or add a "SHOW CHART" toggle on the card. Use a check mark inside the bonus ring so pass is not only gold.
- effort: S

### V-5 (medium, ui) Dead space and weak hierarchy in the editor and bottom deck
- where: `lesson-1-briefing.png`: the left panel is empty from y 650 to 830 while the code above is cut off; the serial monitor is an empty black box (y 800-875) with text only after a run; the legend, chart and caption each use about 11 px text with wide spacing; the 3 s chart is only 770 px wide with a half-empty grid (0 to 2750 ms) before the first run.
- problem: The eye lands on the orange FLASH & RUN and the orange header buttons equally; "FIELD MANUAL" has the same gold outline as FLASH & RUN's family of controls, so the one action that matters (FLASH) is not unique. Small, spaced-out labels (legend, ms scale, caption) are hard to read on dark glass.
- principle: Visual hierarchy; text size and contrast; signalling.
- change: Reserve the gold fill for FLASH & RUN only; make FIELD MANUAL and BUILD LOG plain outline buttons and show the manual badge ("0/8") as a small dot. Raise chart legend, axis and caption text to 12 px, and give the serial monitor a placeholder line ("Serial monitor: output appears here after FLASH") so the box is not read as broken. Let the code panel use its spare height so more of the program is visible without scrolling.
- effort: S

### V-6 (low, ui) Title screen text competes with the rover; modals dim the HUD inconsistently
- where: `game-title.png`: the white subtitle ("Write real FreeRTOS code...") runs over rocks and the rover's top at about 414-1027 x 465, and the START button sits on the rover's pad, so the one 3D object that sets the scene is half hidden; the small hint line at y 602 is low contrast. `game-journey.png` and `lesson-1-manual-2.png`: the dimmed HUD stays visible behind the modal, with the top bar still showing "STAGE 01 / 12" at about 40% opacity, which is clutter behind a 1000 px wide panel.
- problem: Text readability over a busy 3D scene depends on where the rocks fall, and the title is not centred on the rover. Dimmed leftovers behind modals add noise.
- principle: Coherence; contrast; signalling.
- change: Add a soft dark gradient band behind the title block (`radial-gradient(rgba(10,6,4,.6), transparent)`), move the whole block up by about 120 px so the rover shows below the START button, and raise the hint line to a lighter colour at 12 px. For modals, blur the background (`backdrop-filter: blur(3px)`) and raise the dim to 70 per cent.
- effort: S

## Keep (visual)
- The orange-on-dark palette with cyan only for code and running state is consistent between HUD, chart and diagrams (`lesson-1-fail.png`, `lesson-1-manual-2.png`).
- The red LED glow and CPU bar at 100 per cent on a failed run give instant feedback in the scene.
- Manual diagrams (`lesson-1-manual-2.png`) use one message each, with red for busy and green for ready, and the interactive widget sits directly below its diagram.
