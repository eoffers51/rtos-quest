# Review: lesson 11, Deadly Embrace

## Verdict
The stage has a strong broken-first design: the failure is interpretable (log line "arm waits for cam_mtx, held by focus", labelled evidence brackets), the hint ladder is well graded, and the check questions ask for consequences. The weaknesses are in presentation: the evidence is hard to find in the chart on first flash, the deadlock rows look like the healthy blocked rows above them, two manual diagrams clip text, and the manual teaches starvation and livelock that the mission never assesses. The manual section 3 also hands over the exact fix, so the mission becomes copying.

## Keep
- Broken first: the start code deadlocks from the first flash, and the evidence label names task, wait time, lock and holder.
- The wrong-answer reactions (keepsLock, forgotGive, releasedEarly) each name a specific cause and the next thing to look at.
- Hint ladder (read the chart, compare orders, pick one order) and the "experiment" in the solution note (does priority remove the deadlock?).
- Quiz questions are apply/analyse level, e.g. "what is the next question to ask?" after reading a "held by" line.
- Wait-for graph in manual section 1 has one message and a caption that states it.

## Findings

### L11-1 (high, lesson) Deadlock evidence is off-screen and looks like normal blocking
where: lesson-11-fail.png, timing chart. Zoom is Auto (8x) and the view is scrolled to the end; the arm and focus rows sit below antenna, onStow, radio_link, time_sync, gps_fix and uplink, which are all drawn with the same red "blocked on an object" line. The two evidence labels ("arm has waited 154 ms for cam_mtx,") run to the right edge and are cut off; the "held by ..." half is missing.
problem: The learner sees about six identical red rows and cannot tell the two that are a fault from the event-group waits that are healthy. The briefing says "find the rows that stop moving", but they all look unmoving. The clipped label hides the holder, which is the key piece of information.
principle: Signalling; split attention; interpretable failure.
change: Shorten the evidence label so it fits at the right edge: `arm: 154 ms on cam_mtx (held by focus)`, and put the label at the left of the bracket or wrap it on two lines. Keep the bracket start `from` at the moment the wait began so it is visible when the view opens. Do not change what is measured.

### L11-2 (high, ui) Failing chart opens at the end, not at the cause
where: lesson-11-fail.png, "ZOOM AUTO (8x)" and the note "Chart zoomed 8x ... scroll it sideways".
problem: The first deadlock happens late in the test (the second session at about 830 ms). The view shows only the final 120 ms, with no run before the wait to compare to, so the learner cannot see that session 1 worked and session 2 froze, which is the point of manual quiz question 1.
principle: Temporal contiguity; the failure must be readable at first look.
change: When a lesson has `evidence`, auto-zoom to the evidence window with about 100 ms of context before `from` (or 1x zoom with the evidence rows pinned to the top). Owner for the code change is the main session.

### L11-3 (medium, theory) Manual section 3 gives the fix; the mission is a copy exercise
where: lesson-11-manual-2.png, "For the rover the change is two lines in focus per session: take arm_mtx first, then cam_mtx"; hint 3 repeats it.
problem: Theory comes first by design, but here the text names the exact lines to change, so there is nothing left to work out and the "worked example to completion problem" step is skipped straight to answer.
principle: Worked example, then completion problem; productive effort; generation effect.
change: In section 3 state the rule and show a generic example with other lock names (for example `log_mtx` and `flash_mtx`), then end with: "Apply it to arm and focus in the mission. Which task will you change, and why?" Keep the quiz question 3 (one task, or two tasks) as the check of the choice.

### L11-4 (medium, theory) Starvation and livelock are taught but never assessed
where: manual section 5 (lesson-11-manual-4.png); goals list in `deadly-embrace.js`; topic "Deadlock, lock ordering and starvation".
problem: The mission checks only for deadlock and missing locks. The learner reads the starvation text, finds nothing in the game that uses it, and the objectives do not match the stage topic. A task_wdt reaction exists but only as a failure case of busy polling.
principle: Constructive alignment; one new concept per step.
change: Either reduce the title and topic to "Deadlock and lock ordering" and move starvation to a short "next stage preview" in section 5, or add a presentation link: in the `busyLoop` reaction and in section 5 say "you will meet this again in stage 12" and name the objective that shows it. Do not add or loosen an objective.

### L11-5 (medium, theory) Manual section 5 is a wall of text
where: lesson-11-manual-4.png; the paragraph from "This scenario assumes the poller..." to "or only print", about 14 lines.
problem: One paragraph mixes four ideas (single core assumption, ESP32 dual core, idle task and watchdog, ESP-IDF defaults). The diagram is good but the explanation next to it is not segmented, and the main takeaway (a poller never blocks, so the holder never runs) is buried.
principle: Segmenting; coherence; line length and paragraph length.
change: Split into: (1) two sentences with the takeaway and the diagram; (2) a short bullet list "Why the idle task matters" ; (3) a boxed note "Real ESP-IDF differs" holding the dual-core and `CONFIG_ESP_TASK_WDT_TIMEOUT_S` (5 s) facts, with the game's 600 ms stated once.

### L11-6 (medium, theory) Clipped and overlapping text in the lock-order diagram
where: lesson-11-manual-2.png, the diagram under "3. One lock order": the right-hand caption "a task that needs only one lock / takes it and does not climb back" is cut at the right edge; the "then" label sits on the border of the arm_mtx box; the interactive widget header below is cut by the viewport.
problem: Text is lost, and the arrow label overlaps a box so it reads as noise.
principle: Readability; Mayer's spatial contiguity and coherence.
change: Widen the diagram viewBox or move the caption under the "any new task" box with a smaller line (max 28 characters per line); move "then" to the right of the vertical arrow.

### L11-7 (low, ui) Objective text and panel crowding
where: lesson-11-fail.png and lesson-11-briefing.png, OBJECTIVES panel: "Arm: at least 2 photographs taken in 1 / s" wraps with an orphaned "s"; the list is cut by the mission-control box so objectives 5 to 11 are not visible, and the evidence line "1 focus check (finished at 763" is truncated.
problem: Only six of eleven objectives can be read without scrolling, and the failing objective text is cut. Pass and fail are marked with a check and a cross plus colour, which is good.
principle: Signalling; extraneous load.
change: Copy: write "Arm: 2 photographs in 1 s" and "Camera: 2 focus checks in 1 s". UI: collapse the nine "Still working from stage N" lines into one expandable line "9 older checks: all passing" that expands when one fails.

### L11-8 (low, copy) Briefing does not say where the new code is
where: `deadly-embrace.copy.js` briefing, and lesson-11-briefing.png where the editor shows only app_main startup code down to nav.
problem: arm and focus live in the code files below the fold; the learner has to scroll to find tasks that the briefing says are the point. The last briefing paragraph also tells them to look for "the lock each of those tasks is holding", but the chart shows the lock each is waiting for.
principle: Goals clear before play; feedback that is accurate.
change: Briefing line 4: "Flash the firmware as it is and read the chart first. Find the two rows that stop moving, and read which lock each one waits for and who holds it. The code of arm and focus is in the task list below app_main(): scroll down to it."

## Not judged
Animation, sound and timing cannot be judged from still frames. The phone layout (400 px) was not part of this lesson's screens. The result screen (lesson-11-solved.png) is clear, with a stars row, CPU and RAM figures and a readable stack table; the solved state is only seen as the reference solution here.
