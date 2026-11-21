# Review: lesson 8, Direct Line (task notifications)

## Verdict
The stage is well aligned: the failure (4 impacts, 2 checks) is interpretable, the objective is the skill taught, and the wrong-answer set is rich. The weak points are presentation. The failed-objective evidence is clipped on screen, the manual opens by selling a RAM saving instead of the correctness problem the learner is about to see, and the relevant code is out of view. Several diagram and layout defects (tree diagram overflow, one red outline with two meanings) are cheap to fix.
Not judged: animation, sound, timing, phone layout (no 400 px shot for this scope). Screens used: lesson-8-briefing, -fail, -solved, -manual-0, -manual-2, -manual-4 (the manual shots show only sections 1, 3 and 5; sections 2, 4, 6, 7 were judged from source).

## Keep
- Briefing step "flash as it is, count thermal checks against impacts": a real broken-first task.
- Reactions that name the cause (clearsCount, lostImpacts, neverWakes) and the hint ladder ending in the two-line fix.
- burstlab widget (mechanism select + impacts/spacing sliders with a stated result line) and the pdTRUE/pdFALSE diagram.
- Declaring that the 45% speed claim is not measured by the game.
- Pass/fail objectives marked with check and cross glyphs, not colour alone.

## Findings

### L8-1 (high, ui) Failure evidence is clipped where the learner looks
- where: lesson-8-fail.png. Chart: red bracket on the `bumper` row, label shows only "2 impacts within 2 ms" at the right edge; objectives panel: the failed item reads "2 checks for 4 impacts, delays 29," and is cut at the panel bottom.
- problem: the evidence text ("... but only 1 thermal check followed: the extra wake-ups were lost") and the numbers on the failed objective are unreadable, so the diagnosis is left to the mission-control line. The bracket also spans about 150 ms of mostly empty row, with no mark on the lost second give.
- principle: feedback specific to the cause; signalling; spatial contiguity.
- change: left-align the label inside the bracket (or wrap it onto two lines above the row), and let the objectives list scroll to, or expand, the first failing item with its detail line. Optionally draw a small "lost" tick at the second impact time.
- effort: M

### L8-2 (medium, theory) Section 1 sells RAM, but the mission fails on correctness
- where: direct-line.content.js, section "1. A semaphore is a lot of machinery for one wake-up", `ramlab` widget (lesson-8-manual-0.png).
- problem: the first thing learned is "notifications save 96 B". The objective that actually fails is lost impacts, which the manual only explains in section 4. Theory-first also means the answer (pdFALSE, section 3) is read before the learner flashes the broken code.
- principle: constructive alignment; productive failure; pre-training.
- change: open with the problem: new section 1 "Four impacts, two checks" using `burstlab` preset to the mission (binary, 2 impacts, 2 ms, 29 ms) and a question "predict the number of checks" before showing it. Move the RAM comparison to the section that introduces the star, and mark it optional mastery. Merge old sections 3 and 4 order so the failure comes before the pdTRUE/pdFALSE detail.
- effort: M

### L8-3 (medium, theory) One red outline, two meanings
- where: lesson-8-fail.png: the red rectangle on the `science` row (legend: "Blocked on an object") and the red evidence bracket on `bumper` use the same style.
- problem: the learner can read the evidence bracket as "blocked on an object", or the science block as a fault.
- principle: consistency, one colour one meaning; coherence.
- change: give the evidence bracket a distinct style (thick dashed amber or a filled label tab) and keep the red outline only for the legend state.
- effort: S

### L8-4 (medium, ui) The code to edit is off screen
- where: lesson-8-briefing.png and -fail.png: the editor shows STARTUP CODE with 13 `xTaskCreate` lines; `onBump` and `bumper` are below the fold.
- problem: the briefing talks about onBump() and bump_sem, the evidence points at `bumper`, but the learner must scroll to find them. Split attention between the chart and an unseen editor.
- principle: signalling; spatial contiguity.
- change: on first view and after a failure, scroll the editor to (and briefly highlight) the unit named by the evidence; collapse startup code by default. Not verified how the editor behaves after scrolling (still frames only).
- effort: M

### L8-5 (medium, theory) Section 7 and the real-code listing overload the stage
- where: section "7. ESP-IDF habits and the load that stays" (seven dense bullets), `realCode` (IRAM_ATTR, ESP_INTR_FLAG_IRAM, CONFIG_GPIO_CTRL_FUNC_IN_IRAM).
- problem: IRAM-safety, watchdog, priority, stack, tick rounding and debouncing arrive in one block after the concept is done; the one new idea of the stage is diluted.
- principle: one new concept per step; segmenting; extraneous load.
- change: keep four bullets (handle before interrupt, ISR limit, timeout 0 is a poll, priority stays 1) with one sentence each. Move IRAM and tick rounding into a collapsed "Going further on real hardware" note, and drop the 8-line IRAM comment block from `realCode`.
- effort: M

### L8-6 (medium, theory) Diagram defects in the tool-choice tree and a duplicated widget
- where: lesson-8-manual-4.png: "(or a counting semaphore for a pool)" overflows its box; "all must see it" label sits on the connector; "a mutex is for shared resources, not for signals" floats mid-diagram with no link. Sections 3 and 4 both mount `burstlab` with the same defaults.
- problem: overflow and an orphaned label read as errors; the same widget twice makes section 3 show binary-semaphore results while the text is about pdTRUE.
- principle: coherence; spatial contiguity; one message per diagram; interactive widgets, one question each.
- change: widen the event-group box or shorten to "event group" with the pool remark in the caption; attach the mutex note to a greyed "not a signal" leaf; start section 3's widget on "notification, pdTRUE" with 3 impacts, keep binary default in section 4.
- effort: S

### L8-7 (medium, lesson/copy) Mission can be passed without learning the new concept, and the briefing hides the star goal
- where: lesson-8-briefing.png (editor dropdown "xSemaphoreCreateBinary()" with binary/counting select); briefing copy; `alts` (counting semaphore gives 2 stars).
- problem: switching the dropdown to counting passes the objectives, so the notification can be skipped. The reason to prefer it (RAM star, 20900 B) is shown only in hint 4 and section 1.
- principle: constructive alignment; intrinsic integration; goals clear before play.
- change: no change to objectives. Add one briefing line: "Three stars need the lean RAM figure, 20900 B; the stage 7 design costs 96 B more than it needs." After a counting-semaphore pass, have the reaction `pass` say that it works and that the notification saves 96 B.
- effort: S

### L8-8 (low, ui) Result screen leads with a stack table, not the lesson
- where: lesson-8-solved.png: the 13-row stack table fills the dialog; solutionNote with the experiment sits below the fold. Also load is quoted as "97%", "98%" (manual, hint) and "99%" in different places.
- problem: the escape hatch shows what the solution scores but not what changed; the stage takeaway is hidden.
- principle: feedback says what to look at next; escape hatch should teach; consistency.
- change: put solutionNote and a two-line "what changed" (onBump gives a notification, bumper takes with pdFALSE, bump_sem deleted) above the stack table, and collapse the table. Quote load as "about 98 to 99%" or use the measured figure.
- effort: S
