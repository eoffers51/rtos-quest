# Review: lesson 2, Wheels and Eyes

## Verdict
The stage is well built around "broken first": the learner flashes the all-priority-1 firmware, sees the wobble, then learns priorities, and the regression objectives for the stage 1 lights are a good continuity device. Its weak points are the feedback and the hint ladder (the diagnosis misreads some wrong answers, and the hints jump straight to the answer), plus a manual that loads too many ideas for stage 2 and contradicts its own diagram on the time-slicing number. Fix the feedback and the numbers first; the rest is load reduction and polish. Visual points below are judged from markup and need a person to look at the rendered page.

## Keep
- The briefing tells the learner to flash the unchanged firmware and read the chart first (productive failure).
- Goals for stage 1 behaviour are labelled "Still working from stage 1" (regression, spacing).
- The reaction `lights` explains why high priority is free for near-zero-CPU tasks, and the solution note ends with an experiment ("give the camera priority 3").
- The preempt diagram has row labels and a one-sentence takeaway, and colours are consistent (motor green, camera blue-ish `c`) between diagrams.

## Findings

### L2-1 (high, copy/lesson) "camera on top" gets the wrong feedback
- where: `wheels-and-eyes.js` `diagnose` and `reactions.slicing`; wrong case `camera on top` (fails motor, camera frames, telemetry).
- problem: When motor fails (res[0]) `diagnose` always returns `slicing` ("Five tasks at priority 1 take turns..."). A learner who over-corrects and puts the camera at 5 has no equal priorities, so they are told something untrue about their code and may undo a correct idea.
- principle: Feedback must be specific to the cause, about the task, and say what to look at next.
- change: Branch on the cause before `slicing`. If the camera's priority is above the motor's, return a new reaction `starved`: "The camera now outranks the motor. It computes for 60 ms at a time and nothing below it can run: look at the motor row, it is faded for that whole stretch. Who has the tightest deadline? Who should wait?" Keep `slicing` only when motor, camera and telemetry share one priority. This needs `diagnose` to read the player's priorities (owner lesson to wire it, owner copy for the wording). Do not change the objectives.
- effort: M

### L2-2 (high, theory) the time-slicing number disagrees across the manual, diagram and quiz
- where: `wheels-and-eyes.content.js`: slicing diagram caption "it finishes after 4 ms of wall time"; manual "2 ms of work takes up to 6 ms"; quiz 2 "About 6 ms"; hint 1 "one tick in three or more".
- problem: A learner who reads the diagram (3 tasks, motor runs ticks 0 and 3, done after 4 ms) then meets a quiz whose correct answer is 6 ms. That looks like a wrong answer key, and it erodes trust in the material.
- principle: Coherence and constructive alignment: the quiz must follow from what the diagram showed.
- change: Make one claim. Diagram note: "with three busy tasks the motor needs 2 ms of CPU and finishes 4 to 6 ms later". Manual: "2 ms of work takes 4 to 6 ms". Quiz 2: ask "Roughly how long?" with options "2 ms", "4 to 6 ms", "It never finishes", and `why`: "One tick in three, so the work is spread over about three times as many milliseconds as it needs." Hint 1 stays. Use the same words everywhere.
- effort: S

### L2-3 (medium, lesson/copy) the hint ladder starts with theory and gives the answer by hint 2
- where: `hints`.
- problem: Hint 1 re-explains round-robin (the learner already saw it in the reaction), hint 2 states the whole solution order (motor > telemetry > camera), and hint 3 then adds the lights. Nothing tells a stuck learner where to edit, and the lights (needed for objectives 4 and 5) come last, after the "answer".
- principle: Scaffolding as a ladder from nudge to near-answer.
- change: Reorder and rewrite: (1) nudge, "Read the chart: which row is faded when it should be solid? That task is waiting for the CPU." (2) "Priority is the fifth argument of each xTaskCreate(). Which task is the most urgent, and which could wait the longest?" (3) the current hint 2 text (order of the three new tasks). (4) the current hint 3 (lights at the top). (5) the RAM-star hint. Existing hint 1 text moves to the manual only (it is already in section 2).
- effort: S

### L2-4 (medium, theory) too many new ideas in the manual for a stage 2 learner
- where: manual sections 3 and 4; quiz question 4.
- problem: The stage teaches priorities and preemption, but the manual also brings the Liu and Layland bound with `n · (2^(1/n) − 1)`, symbols C, T and U that are never defined (and period 97 and 180 appear without saying they are 85 + 12 and 120 + 60), a table of Wi-Fi and lwIP system tasks, and a quiz question about Wi-Fi starvation on a rover that has no Wi-Fi yet. Intrinsic load for stage 2 should be one rule plus one consequence.
- principle: One new concept per step; cognitive load (extraneous and intrinsic); segmenting and pre-training.
- change: Keep section 3 to the sentence "shorter period, higher priority" and one worked line "motor 2/10 = 20%, telemetry 12/97 = 12%, camera 60/180 = 33%: 65% of the CPU in use, so every deadline can be met". Define C = CPU time per run, T = period in a single line, and explain 97 and 180. Move the Liu-Layland bound and the table of n values into a collapsed "Going deeper" block. Trim section 4 to the three facts that matter now (higher number wins, app_main is at 1, leave the top levels to the system) and park the table in "Going deeper". Replace quiz 4 with a stage-relevant question, see L2-5.
- effort: M

### L2-5 (medium, theory) the quiz tests recall, not diagnosis, and does not revisit stage 1
- where: `quiz`.
- problem: Q3 (lowest priority goes to the compression job) repeats the manual sentence nearly verbatim, and no question asks the learner to predict a consequence or recalls stage 1 ideas (Blocked, idle, watchdog). Q2's wrong option "It never finishes" is not plausible.
- principle: Retrieval practice and spacing; Bloom apply and analyse; plausible distractors.
- change: Replace Q3 with an analysis question: "Motor (prio 3) never delays: its loop has no vTaskDelay. Which tasks run?" opts: "Everything, the motor is preempted every tick" / "Only tasks at priority 3 or higher; lower ones starve, including IDLE, and the watchdog fires" / "Nothing changes, it is only 2 ms of work". Answer 2, `why`: "A task that is always Ready holds the CPU against everything below it. This is the stage 1 watchdog again, with priorities." Replace Q4 with: "Your LED task needs 50 microseconds of CPU every 200 ms. Is priority 4 above the motor safe?" (yes, it uses almost no CPU and blocks right away). Q2 distractor: "3 ms".
- effort: S

### L2-6 (medium, copy/theory) the objective numbers are unexplained and the real-code snippet silently needs 1 kHz
- where: `goals` ("11 ms", "12 frames", "27 sent", "105 ms"); `realCode` (`pdMS_TO_TICKS(8)`); briefing.
- problem: The briefing says the motor runs every 10 ms, but the goal says 11 ms, and the learner cannot tell where 12, 27 or 105 come from; they look arbitrary. Also stage 1 teaches that ESP-IDF defaults to 100 Hz, where `pdMS_TO_TICKS(8)` is 0 ticks and `vTaskDelay` would not block, so the snippet is wrong on a default build and nothing here says so.
- principle: Goals clear before play; transfer with declared simplifications.
- change: Briefing, add one line: "Spec sheet: motor every 10 ms (we allow 1 ms of slack), telemetry every 100 ms (5 ms slack), camera about 6 frames a second, so 12 or more in 3 s is the floor." In `realCode`, add above the tasks: `// needs CONFIG_FREERTOS_HZ=1000, as in stage 1. At the default 100 Hz pdMS_TO_TICKS(8) is 0.` Do not change the thresholds themselves.
- effort: S

### L2-7 (low, theory) the preempt diagram starts with the low task and the lab has no question
- where: `preempt` diagram (camera bar 0 to 10 first, motor first appears at 10); `<div data-w="schedlab">` text "Change the priorities and watch the chart".
- problem: At t = 0 the motor and camera are both Ready, and the rule on the page says the higher one runs, but the diagram shows the camera running first. The lab invites free play with no question or takeaway.
- principle: Coherence; interactive widgets should pose one question and state a takeaway.
- change: Draw motor first (motor 0 to 2, camera 2 to 10) and label the first dashed line "motor wakes again". For the lab, replace the sentence with: "Predict first: with the camera on top, will the motor still run every 10 ms? Then try it. Takeaway: a long task above a deadline task breaks the deadline." Visual check by a person is needed after the diagram edit.
- effort: S

### L2-8 (low, copy) jargon in the pass message and the starvation wording
- where: `reactions.pass` ("rate-monotonic scheduling"), `reactions.watchdog` ("Task watchdog. Something never blocks"), hint 3.
- problem: "rate-monotonic" is a term first met in manual section 3, so only learners who read the manual understand the praise; the plain rule is in the same sentence. The watchdog text assumes the learner remembers the stage 1 cause.
- principle: Terms introduced before use; feedback names the cause and what to look at next.
- change: pass: "Wheels steady, lights steady, and the camera lives on leftovers. Shortest deadline gets the highest priority: engineers call this rate-monotonic scheduling." watchdog: "Task watchdog again, as in stage 1: a task that never blocks keeps everything below its priority from running, the idle task included. Find the row that is solid from end to end."
- effort: S

---

# Visual pass

Judged from the six lesson 2 screenshots (1440 x 900 stills) plus `game-phone.png` (a lesson 1 screen, since no lesson 2 phone shot exists). Animation, sound and timing cannot be judged from stills.

## Verdict
The stage looks coherent and the pass/fail marks use a tick and a cross as well as colour, which is good. The visual weak points are all on the stage's key skill: the priority argument is clipped out of sight in the code panel, the failing objectives are cut off by the chart panel, and the colour code for the tasks changes between the game chart, the manual diagram and the lab.

## Keep
- Objectives use a tick and a cross plus green and red, with a small evidence line under each ("worst gap 14 ms"): `lesson-2-fail.png`, right panel.
- The result screen has one dominant button (NEXT STAGE) and a clear table of priority, stack and peak use: `lesson-2-solved.png`.
- Task names in the chart rows match the names in the code (beacon, heart, motor, camera, telemetry).

## Findings

### L2-V1 (high, ui) the priority argument is clipped at the edge of the code panel
- where: `lesson-2-briefing.png`, startup code, the five `xTaskCreate (...)` lines at y 311 to 420. The lines end in `NULL),` or `NULL, ...` at the panel edge; the telemetry line shows `NULL, 1` and then nothing, with no closing `);`. The comment line ends at "argument, priority, ha". `game-phone.png` shows the same clipping much earlier at 400 px: only the stack field `4096` is visible.
- problem: Lesson 2 is about the priority value, yet it is the last argument on the line and the first thing to be cut off. A learner cannot see or tell that more is hidden to the right, and on a phone the line is unusable.
- principle: Signalling (the key element must be visible); extraneous load; usability on the phone layout.
- change: Let the `xTaskCreate` rows wrap onto two lines (name and stack on the first, `NULL, priority, NULL` on the second), or make the code panel scroll horizontally with a visible fade or scrollbar at the right edge. Give the priority field the same highlight colour as the briefing's wording so it stands out from the stack field.
- effort: M

### L2-V2 (high, ui) in the fail state the objectives panel is cut off by the chart panel
- where: `lesson-2-fail.png`, right panel. The list ends at "Efficient: CPU load at most 70%" (y 481) and its marker is half hidden behind the chart panel; "Lean: at most 7600 bytes" is not visible at all. In `lesson-2-briefing.png` all eight fit.
- problem: Once evidence lines are added the list grows and the lower objectives disappear without any sign. The learner cannot see two objectives or that a scrollbar might exist, which matters because those two are the optional star goals.
- principle: Goals are clear and progress is visible; layout (panels covering each other).
- change: Give the objectives panel a max height equal to the space above the chart with `overflow:auto` and a visible scrollbar or fade, or move the mission-control box so the right column can use the full height. Group the star goals under a small "Stars" heading so they read as optional.
- effort: M

### L2-V3 (medium, ui/theory) one task, three different colours
- where: `lesson-2-fail.png` chart: motor orange, camera green, telemetry purple. `lesson-2-manual-0.png`: the preempt diagram draws motor green and camera teal; the scheduling lab draws motor blue, telemetry pink and camera orange.
- problem: Orange is the motor in the game, the camera in the lab; green is the camera in the game, the motor in the diagram. A learner who transfers what they read in the manual to the chart reads it backwards.
- principle: Consistency of visual vocabulary; coherence.
- change: Define one colour per task (the game chart colours) in `widgets.js` and use it in the diagrams and the lab. Drive the lab's row colours from the same table. Check `lesson-2-manual-0.png` again after the change.
- effort: M

### L2-V4 (medium, ui) the failure is invisible in the chart at the shown zoom
- where: `lesson-2-fail.png`, chart rows `motor` and `telemetry`. The motor row is a dense solid orange band from 0 to 2750 ms. The faded "ready" bars the mission-control text points to ("faded bars between the solid ones") cannot be made out at 1x, and nothing marks the 14 ms gap that the red cross refers to.
- problem: Broken-first only works if the failure can be seen. The text tells the learner to look at something that is below the resolution of the picture, so the cause stays hidden unless they zoom and hover.
- principle: Signalling; spatial contiguity (the evidence sits in the objectives panel, the cause in the chart).
- change: On a failed gap objective draw a red bracket or marker on the motor row at the worst gap and link it with the objective (hover on the objective highlights it). Alternatively auto-zoom the chart to a 100 ms window around the worst gap on a failed run, with a "show all" control.
- effort: M

### L2-V5 (medium, ui) the result screen shows three gold stars next to a note that no stars are saved
- where: `lesson-2-solved.png`: three large gold stars at the top, then the line "Stars are not saved for the reference solution." The HUD stars behind are dimmed and empty; the "Efficient" objective behind the modal shows a half-filled marker.
- problem: The biggest element on the screen celebrates something the small print then takes back. For a learner who used SOLVE the screen also reads as a win. Mixed signals weaken the star goal.
- principle: Feedback should be clear and honest; the result screen must celebrate and inform without contradiction.
- change: For the reference solution show the three stars greyed out with a label "reference" and change the title to "Reference solution" only (it already is), and move the "Stars are not saved" line directly under the stars. Keep the full gold stars for a solved player run.
- effort: S

### L2-V6 (low, theory/ui) manual diagram label crossed by a line, and a crowded header
- where: `lesson-2-manual-0.png`: the dashed vertical line at x 753 runs through the word "exactly" in "camera resumes exactly where it was". The section tabs wrap to two rows (five numbered tabs plus "Complete ESP-IDF example") and the lab's chart is cut by the fold with its controls above it.
- problem: A line through a label hurts reading at the exact point the diagram teaches; the two-row tab strip adds noise on top of the title, and the lab's result is hidden until the learner scrolls.
- principle: Spatial contiguity; coherence; text readability.
- change: Move the label left or give it a dark background box so the dashed lines stop behind it. Shorten the tab names ("1 One rule", "2 Time slicing", "3 Choosing priorities", "4 ESP-IDF", "5 Pitfalls", "Example") so they fit in one row. Place the lab's controls and chart so both fit in one screen, or shrink the paragraph above it.
- effort: S
