# Review: lesson 6, One Bus, Two Masters

## Verdict
The stage has a strong core: the player meets a visible collision first, the manual builds from the bus to the race to the mutex with an interactive widget for each idea, and every wrong solution gets its own cause-specific reaction. The weak points are in presentation. The briefing hands over the fix before the learner has diagnosed anything, the manual carries too many side topics for one stage, several diagrams have overlapping or ambiguous labels, and the evidence bracket and result screen do not point at the lesson's own skill. Screenshots are still frames at 1440 x 900, so I cannot judge the animation, sound or timing of the widgets or the run.

## Keep
- Broken first: the starting code runs, passes 7 of 8 objectives and fails exactly one, "I2C bus: never two transactions on the bus at the same time" (lesson-6-fail.png). The failure is single, specific and interpretable.
- In lesson-6-fail.png the imu and thermo rows sit next to each other at the bottom of the task rows, so the overlap at 4 ms can be seen without scrolling.
- The racelab (step A or B, preset orders), deadlab (untick a give) and holdlab widgets: one question each, consequence shown at once. The `wrong` list covers 10 mistakes, each with its own reaction.
- Declared simplifications: the manual says reads are stretched to 5 and 8 ms, that the real driver already locks single calls, and that the tick rate differs from ESP-IDF defaults.
- The closing prompt in `solutionNote` ("move the give to just before the delay and watch the imu gap") is a good experiment. See L6-7 for where it sits on screen.

## Findings

### L6-1 (medium, owner: copy) The briefing gives the fix before the diagnosis
- where: `one-bus-two-masters.copy.js`, briefing[1] and [2]: "The thermal team sent a mutex, i2c_lock, but nobody takes it yet." and "Your job: make both tasks hold i2c_lock for exactly one transaction, then give it back." Also `hints[1]`, which repeats this.
- problem: The learner is told which object to use and where to put it before flashing, so the task becomes four block drops with no diagnosis. The briefing then says "Read the faults row and the chart before you change anything", which has nothing left to discover.
- principle: Productive failure (meet the problem, then the explanation), and a completion problem that fades support. Theory step 1 already teaches the mutex, so the mission can ask for the outcome.
- change: Replace briefing[1] last sentence and briefing[2] with: "The thermal team left a mutex called i2c_lock in app_main(), but no task uses it yet." and "Your job: stop the collisions without making either task late, and keep every earlier stage working. Flash it first and work out which two rows overlap." Keep the "hold the lock for exactly one transaction" wording in `hints[2]`, where it is a hint.
- effort: S

### L6-2 (medium, owner: theory) The bus diagram has overlapping labels and the timing notes are far from what they describe
- where: lesson-6-manual-0.png, the first diagram (`busDia`). At the lower right, the note "transaction: 8 ms in the game" is drawn under the "thermometer" box, and the box text overprints it so both are unreadable. The note "transaction: 5 ms in the game" touches the edge of the IMU box.
- problem: The first picture of the stage has garbled text, and the timing facts are separated from the devices they belong to.
- principle: Mayer's spatial contiguity and coherence; no overlapping labels.
- change: Delete both `note(...)` calls. Put the times inside the boxes: `box(470, 14, 100, 36, 'IMU|addr 0x68|read 5 ms', 'c')` and `box(600, 150, 100, 40, 'thermometer|read 8 ms', 'a')`. Increase the svg height from 190 to 200. Diagram text is about 8 to 9 px next to 17 px body text across the stage's diagrams, so also raise the `.bx` label size in the diagram kit if the box widths allow it.
- effort: S

### L6-3 (medium, owner: theory) The "hold time" diagram does not show who is blocked
- where: lesson-6-manual-4.png, `holdDia` under "5. Keep the critical section short". The "imu reads" row sits between the two thermo rows and looks the same in both scenarios. The red "waiting" bar runs along the lower thermo row and the time axis. The labels ("lock held 108 ms", "imu wanted the bus here", "and gets it only here: 88 ms late") are small and spread over the figure.
- problem: The key message is that a long hold delays the other task, but the learner cannot see which imu reads are lost in the long-hold case. The numbers are also inconsistent across the stage: 88 ms late in the diagram, a 119 ms gap in the bullet and in quiz 5, and "past 100 ms" in `solutionNote`.
- principle: Signalling, and one message per diagram; consistent numbers across a lesson.
- change: Draw two labelled stacked panels, each with an imu row above its thermo row. In panel A (hold 8 ms) all imu bars are cyan. In panel B (hold 108 ms) draw the imu bars at 20, 40, 60, 80 and 100 ms as hollow red outlines labelled "waiting for the lock", and the first real read at about 108 ms. Use one number everywhere: change the diagram caption to "the IMU gap grows from 20 ms to 119 ms in the game" and `solutionNote` to "grow past 100 ms (119 ms)".
- effort: M

### L6-4 (medium, owner: theory) Too many new ideas for one stage, and forward references
- where: `one-bus-two-masters.content.js`. Section 1 bullet 3 (`ESP_ERR_TIMEOUT`, `ESP_ERR_INVALID_STATE`). Section 4 (priority inheritance "stage 12 measures it", the recursive mutex, ISR rules). Section 7 (critical sections, `CONFIG_ESP_INT_WDT_TIMEOUT_MS` with a SPIRAM exception, `trans_queue_depth`, dual-core spinlocks).
- problem: The stage's skill is "take, use for one transaction, give". The manual also asks the learner to hold race conditions, mutex versus semaphore, priority inheritance, recursive mutexes, interrupt watchdog values and async driver modes at once. A learner who gets lost in section 7 reads the closing "Complete ESP-IDF example" as noise.
- principle: One new concept per step; cognitive load (remove extraneous load); pre-training (key terms before detail); segmenting.
- change: (1) In section 1, cut bullet 3 to one sentence: "On real hardware the symptom is a read that times out or returns a wrong value without any error." (2) Section 4: keep ownership and initial state. Replace the priority-inheritance and recursive bullets with one line each: "Stage 12 shows why a mutex also boosts priorities. Recursive mutexes exist for nested takes; you do not need one here." (3) Section 7: keep the three-column design diagram and one sentence per design. Move the interrupt-watchdog and driver-async detail into the "Complete ESP-IDF example" build notes as "later, in production".
- effort: M

### L6-5 (medium, owner: ui) The objectives panel hides most of the goals
- where: lesson-6-fail.png and lesson-6-briefing.png, the OBJECTIVES panel at the top right. Only 3 and a half of 8 objectives are visible. The Thermometer line is cut off, and the five "Still working from stage N" lines, including the Stage 5 line the learner has just built, are below the fold with no scroll cue.
- problem: Pass and fail of the regression objectives are invisible during the run. A learner who breaks stage 5 or stage 3 sees no feedback on screen except the mission-control reaction (the `hog` case).
- principle: Goals are clear before play; feedback is immediate and specific; signalling.
- change: Group the "Still working from stage N" lines under one collapsed row: "Stages 1 to 5 still pass: 5 of 5 checks", with a red count and an auto-expand on any failure. Show the three new objectives in full. This changes only the presentation, not what the simulator measures.
- effort: M

### L6-6 (medium, owner: lesson) The evidence bracket marks one task and its label covers the row
- where: `one-bus-two-masters.js` `evidence`, collision branch; lesson-6-fail.png, thermo row at 4 ms. The red bracket is about 28 px wide around only the thermo transaction. Its long label ("I2C collision at 4 ms: imu and thermo were on the bus at the same time (5 in 1 s)") is drawn along the thermo row and covers that row for most of the first 240 ms. `reactions.race` asks "which two rows are both solid at that moment?", but the rows show short bars, not solid bands.
- problem: The bracket shows one of the two overlapping transactions, so the learner has to find the other by eye. The text on the thermo row hides thermo activity that the learner will want to read.
- principle: Signalling and spatial contiguity; feedback says what to look at next. The reaction wording should match what is on screen.
- change: In the collision branch return two entries: the existing thermo span, and an imu span for the imu read that was still running at `tc` (the last `S_(K,'i2cReadIMU')` start at or before `tc` up to its next end). Shorten the label to "collision at 4 ms: imu and thermo on the bus together (5 in 1 s)". Change `reactions.race[1]` to "Look at the first red mark: which two rows have a bar at the same moment?".
- effort: S

### L6-7 (medium, owner: ui) The result screen buries the lesson, and the stars reward stack tuning
- where: lesson-6-solved.png. The reference-solution table (12 tasks by priority, stack, peak use, never used) fills the dialog. The `solutionNote` experiment is below the fold, cut off at "Try it on the reference...". Nothing says what earns the stars; `bonus: B(97, 19700)` and `hints[3]` are about CPU load and stack bytes, which is stage 4 skill.
- problem: The learner who has just fixed a lock bug sees a stack table, not the bus. The one reflective prompt that transfers the idea ("move the give above the delay") is below the fold. The mastery target rewards stack trimming, not better lock engineering.
- principle: Constructive alignment (mastery should reward the stage's skill); feedback says what to look at next; visible, understandable progress.
- change: In the result dialog, show first: "0 collisions, IMU worst gap 30 ms, thermometer worst gap 115 ms, longest lock hold 8 ms", then the solution note with its experiment, then a short line "Stars: CPU load at most 97% and stack RAM at most 19700 B", and fold the per-task table into a collapsed "Show stack table". Do not change the bonus thresholds. In `hints[3]` say that this star is about stack size, the same skill as stage 4.
- effort: M

### L6-8 (low, owner: theory) Polish: a clipped code line, tiny diagram text, and a cut-off label
- where: lesson-6-manual-2.png, the first `<pre>` in section 3: "xSemaphoreTake(i2c_lock, portMAX_DELAY);   // owner = this task, or block until it is fre" is cut off at the panel edge. In the same section the "Take: blocked" label in `keyDia` sits on top of its arrow.
- problem: A truncated comment in the key code of the stage reads as an error. Overlaps in diagrams suggest carelessness.
- principle: Text: line length and legibility; code and prose clearly distinct.
- change: Shorten to `xSemaphoreTake(i2c_lock, portMAX_DELAY);   // block until free, then own it` and `xSemaphoreGive(i2c_lock);                  // free it, wake one waiter`. Move the "Take: blocked" label in `keyDia` 12 px lower with an offset in `arrow(...)`.
- effort: S
