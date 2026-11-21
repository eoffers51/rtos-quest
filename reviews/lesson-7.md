# Review: lesson 7, Bump in the Night

Verdict. The stage is well built: it opens broken, the failure is readable (one grey 8 ms block on the onBump row, a red objective with "longest ISR 8 ms"), the mission mechanic (move work out of the ISR) is the skill being taught, and the wrong-answer cases give specific feedback. The weaker parts are presentation: diagram text is clipped in three of the manual screens, the evidence label is cut off in the chart, the quiz always has its right answer in the middle slot, and the manual loads a lot of ESP-IDF detail (IRAM, int-wdt, glitch filters, GPIO service setup) on top of the one idea the mission tests. Screenshots are stills: animation, sound and the interactive widgets (only their headers are visible in the shots) were not judged.

## Keep
- Broken-first start: the starting firmware runs checkThermals() inside onBump, and the fail screen shows the cause (lesson-7-fail.png, onBump row and the "longest ISR 8 ms" line).
- The pass/fail marks in Objectives are a tick and a cross, not only colour, and each carries a measured line ("stop delays 0, 0, 0 ms", "thermal check 8, 8, 8 ms after the bumps").
- Reactions diagnose the cause and say what to look at next (slowIsr, noStop, hog, busyLoop).
- Section 6 teaches the priority decision with measured numbers (10 ms, 12 ms, 18 ms gaps) and refutes the "important event, so important task" instinct.
- The 3-star reference-solution screen with the per-task stack table; the alternative solutions (counting semaphore, stop moved into the task) show there is more than one valid answer.

## Findings

### L7-1 (medium, owner theory) Quiz answers are always the middle option
- where: `bump-in-the-night.content.js`, `quiz`: all 7 entries have `a: 1`.
- problem: A learner who notices the pattern, or who just picks the middle, scores 7/7 without recalling anything. The three options per question are also uneven in length: the right one is usually the longest and most specific.
- principle: Retrieval practice needs real discrimination; valid assessment (constructive alignment).
- change: Shuffle the correct index across 0, 1 and 2 (for example 1, 2, 0, 1, 0, 2, 1) and make distractors the same length as the answer. Keep questions as they are, they already ask for consequences.
- effort: S

### L7-2 (medium, owner theory) Diagram text is clipped or struck through by tick marks
- where: `lesson-7-manual-0.png`: the "polls at 10 and 20 ms both see 'not pressed': the bump is gone" label runs past the right edge ("the" is the last visible word) and the two vertical tick lines at 20 ms and 30 ms cut through the words. `lesson-7-manual-2.png`: "milliseconds, can wait" is cut to "can wai", and the bumper box text is tight. `lesson-7-manual-4.png`: the caption under the yield diagram ("...so the switch happens on the") and the code comments in the `<pre>` ("...as the") are cut off.
- problem: The sentence that states each diagram's message is the one that is lost. The learner must guess the ending.
- principle: Signalling and spatial contiguity (Mayer): the caption that states the message must be fully visible and not collide with marks. Readability.
- change: In `pollDia` move the note to a free band below the tick row (y about 78, x start 120) and shorten it to "polls at 10 and 20 ms see no press: the bump is missed". In `deferDia` shorten the right label to "ms, can wait" or widen the viewBox. In `yieldDia` split the caption over two lines and shorten it to "handler outranks motor: switch on ISR exit". In the `<pre>` move the trailing comments onto their own lines above the calls so no line is longer than about 60 characters.
- effort: M

### L7-3 (medium, owner lesson) The evidence label for the failing objective is truncated and the view hides the time axis
- where: `lesson-7-fail.png`, onBump row: the red bracket is correct, but its label reads "onBump ran 8 ms inside the interrupt at 150 ms: no task" and stops at the chart edge. The rest of the label (the motor gap) is the link to stage 2 that the learner needs. The time-axis row is scrolled out of view, so the learner cannot read which bump this is. In `lesson-7-briefing.png` the onBump, BEACON, HEART and IRQ rows are below the visible chart, yet the briefing says "Watch the motor row and the onBump row."
- problem: The learner cannot see the cause and its effect in one frame, and is told to watch a row that is not on screen.
- principle: Spatial contiguity; feedback must show the cause. Signalling.
- change: Shorten the label in `evidence` to fit: `onBump: 8 ms inside the interrupt (motor gap ${g[1]-g[0]} ms)` and move the detail to the reaction text. Make the label anchor to the left of the bracket when it would run off the right edge. Change the briefing's last line to "Watch the onBump row (scroll the chart down) and the motor row", or reorder rows so onBump is next to motor for this stage (`chartGrid`/unit order). Do not change what is measured.
- effort: M

### L7-4 (medium, owner copy) The briefing hands over the solution recipe, so the hints have nothing left to ladder
- where: `bump-in-the-night.copy.js`, `briefing[2]`: "Give it from onBump with xSemaphoreGiveFromISR(), and let a new task called bumper take it and run the check." Hint 2 and 3 then repeat the same recipe.
- problem: The learner is told the answer before trying, which removes the diagnose step. The only real decisions left are the priority and stack of bumper.
- principle: Productive failure and scaffolding ladder (nudge to near-answer); worked example first only when the theory has not already taught it. Here step 1 already teaches the pattern.
- change: Replace the third briefing paragraph with: "Your job: the motors must stop within 3 ms of every bump, and the thermal check must follow within 100 ms. The semaphore bump_sem is already delivered. Decide what stays in the interrupt and what moves out." Keep the recipe in hints 2 and 3. Add one line to hint 1 pointing to field manual section 3.
- effort: S

### L7-5 (medium, owner theory) Too many new ideas in one manual, some not used by the mission
- where: manual sections 1, 2 and 5: `gpio_config` / `intr_type` constants, `gpio_install_isr_service`, `ESP_INTR_FLAG_IRAM`, `IRAM_ATTR` / `DRAM_ATTR`, interrupt watchdog and its Kconfig names, `portYIELD_FROM_ISR` no-argument form. Section 2 also repeats the dual-core sentence twice in one paragraph and bullet. Section 7 has four bullets of glitch-filter and debounce detail. See `lesson-7-manual-0.png` for the third bullet in section 1.
- problem: The core idea (ISR short, defer to a task, semaphore carries the signal, give from ISR) competes with detail the game never tests. Non-native readers meet about ten new identifiers in the first two sections.
- principle: Cognitive load (one new concept per step, remove extraneous load); segmenting and pre-training.
- change: Keep the game-relevant parts in the main text: ISR cannot wait, FromISR, deferral. Put the IRAM, int-wdt, GPIO setup and glitch-filter detail inside a closed "Real hardware: more detail" box (or the existing realCode and section 7). Delete the duplicated dual-core sentence in section 2. Remove the stray ";)" in section 6 ("ESP-IDF;)").
- effort: M

### L7-6 (medium, owner lesson) The yield, taught in section 5, is not part of what the player writes or is checked on
- where: `lesson`: `ops` lists `giveISR` only; the solution is `[stopMotors, giveISR]`. Section 5 and quiz question 5 teach `woken` and `portYIELD_FROM_ISR`, and `solutionNote` says "yields if that wakes a task".
- problem: The learner is asked about a step that the mission never lets them write or omit, and at priority 1 it makes no visible difference. The theory and the activity do not line up.
- principle: Constructive alignment; intrinsic integration.
- change: Either state in section 5 and the solution note that the simulator performs the yield inside `giveISR` (a declared simplification, and "at priority 1 it never switches, which is why the check lands 29 to 39 ms later"), or add an optional alt in `alts` that shows a bumper at a higher priority waking at once. Do not change objectives.
- effort: S

### L7-7 (low, owner ui) Objective list is long and clipped on the first view
- where: `lesson-7-briefing.png`, Objectives panel: 4 of 9 goals visible and the fifth ("Still working from stage 6...") is cut at the panel edge. The five "Still working" lines are not visible without scrolling.
- problem: The learner cannot see at a glance which 4 objectives are new and which 5 are regression checks.
- principle: Clear goals before play; signalling.
- change: Group the five regression goals into one collapsed row, "Stages 1 to 6 still hold (5 checks)", that expands on click and turns red with a count if any fail. Show a scroll hint if it stays a list.
- effort: M

### L7-8 (low, owner theory) Result table does not show what this stage changed
- where: `lesson-7-solved.png`: the table lists 14 tasks with priority, stack, peak, never used; "bumper" is the last row with nothing marking it, and the quoted "My version" text is long. The 98% CPU and 20960 B figures have no comparison with stage 6.
- problem: The result screen informs but does not point at the lesson: the new row and the latency numbers (29, 39, 37 ms) are not highlighted.
- principle: Feedback that says what to look at next; mastery made visible.
- change: Highlight the new `bumper` row and add one line above the table: "New this stage: ISR 0 ms, thermal check 29 to 39 ms after each bump." Shorten the solution note's first paragraph to two sentences.
- effort: S
