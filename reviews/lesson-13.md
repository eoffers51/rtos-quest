# Review: lesson 13, Two Brains

## Verdict
The stage design is strong: the broken start gives a watchdog reset the learner can interpret, the second failure (torn read) only appears after the first fix, and the wrong-answer reactions are specific. The weak point is presentation. The two things the stage teaches, which core a task is on and what the two tasks do at the same moment, are not visible in the chart, the HUD or the serial monitor in the screenshots, so the learner must take them on trust. The manual also teaches more (spinlocks, ISR variants, affinity) than the mission assesses, and 12 objectives crowd the panel.

## Keep
- Broken-first start with a reset, then a second, different failure after the fix (productive failure, one problem at a time).
- Reaction wording (`race`, `halfLocked`, `longSection`, `delayNotLock`, `readerStarved`): cause first, then the question to ask next.
- The solution note's experiment: wrap visionStep() too and watch the read delay pass 15 ms.
- Check question 4 (delay is not a fix) and 6 (what belongs in the lock) ask for consequences.

## Findings

### L13-1 (high, ui) The chart shows neither cores nor the new tasks
- where: `lesson-13-fail.png`, timing chart (rows beacon ... thermo). Also `lesson-13-briefing.png`.
- problem: In the still frames the chart lists 12 task rows and ends at thermo; vision and fusion, the two tasks the stage is about, are not visible, and nothing groups rows by core. Hint 1 ("which core row is solid") and the watchdog reaction ("Find that core in the chart") refer to core rows that do not exist; the learner sees a continuous bar on camera/spectro/radio and cannot tell they all sit on core 1. The HUD shows one CPU figure (100% in the fail shot, 50% in the result) with no per-core split, which also contradicts "95 percent" in the briefing.
- principle: Intrinsic integration and signalling; the mechanic being taught (core placement) must be what the screen shows. Spatial contiguity.
- change: Group chart rows under "CORE 0" and "CORE 1" headers (add an IDLE0 and IDLE1 row), put vision and fusion at the top of the visible area for this stage (or make the chart taller), and show per-core load in the HUD ("CORE 0 0% | CORE 1 95%"). Until then reword hint 1 to "Look at the CPU figure and the chart: which tasks keep the CPU busy all the time?". I could not check scrolling inside the chart from a still frame.
- effort: M

### L13-2 (high, ui) The crash cause is scrolled out of the serial monitor
- where: `lesson-13-fail.png`, serial monitor (only "(599) Rebooting..." and the result line are visible); the watchdog reaction and check question 2 depend on the IDLE1 line.
- problem: The monitor shows about four lines and auto-scrolls to the end, so the line that names IDLE1 (CPU 1), the key diagnostic, is hidden. The chart's red label "watchdog reset at 600 ms: the ..." is also clipped at the right edge.
- principle: Feedback must be immediate, specific and visible where the learner is looking.
- change: Pin the first error line of a crash at the top of the monitor, or highlight and keep visible the line containing `IDLE`/`task_wdt`; make the monitor taller or collapse the "[result]" block (it is a wall of per-task bytes that is irrelevant to this failure) when a crash happened. Wrap or shorten the chart label to "watchdog reset at 600 ms: IDLE1 starved".
- effort: M

### L13-3 (medium, lesson) Twelve objectives, nine of them regressions, bury the three new ones
- where: `lesson-13-briefing.png` and `lesson-13-fail.png`, objectives panel (cut off at "Still working from stage 12: all 9 bus"); `goals` in `two-brains.js`.
- problem: Only the first four rows are readable without scrolling and the stage-13 objectives take most of that space; the long "Still working from stages 1 and 2: ..." strings are dense and fail together in a crash, so a red wall appears whose cause is one thing.
- principle: Cognitive load; extraneous load removed; goals clear before play.
- change: Do not loosen anything, but present the regression lines as one collapsible group "Older stages (9 checks)" that shows a single tick or cross and expands on click; keep the three new objectives and the crash line always visible. Shorten the long strings in the expanded view to the check name plus number.
- effort: M

### L13-4 (medium, theory) Manual teaches critical sections and spinlocks that the mission never uses
- where: `two-brains.content.js` sections 5 and check question 5 (16-byte copy shared with an ISR); `lesson-13-manual-4.png`.
- problem: The learner meets portENTER_CRITICAL, spinlocks, `_ISR` variants and configMAX_SYSCALL_INTERRUPT_PRIORITY in the same stage as pinning and affinity, then solves the mission with a mutex they already know from stages 6, 11 and 12. The topic line promises "critical sections" but nothing in play assesses it; the question 5 answer is recall of a table.
- principle: Constructive alignment; one new concept per step; segmenting.
- change: Keep the table, but move the spinlock/ISR detail into a short "going further" box, and open section 5 with the mission link: "In this stage the guard is the mutex you already know; the critical section is the tool for work that lasts microseconds or involves an ISR." Make question 5 a scenario with the stage's numbers (a 4 ms copy: critical section or mutex?) so it forces the comparison.
- effort: S

### L13-5 (medium, theory) Diagram text is clipped or overlapped
- where: `lesson-13-manual-0.png` core diagram (right-hand label "95% before visi..." and "and fusion arri..." cut off at the panel edge); `lesson-13-manual-2.png` affinity diagram (label "dashed: whichever core the sche..." clipped, dashed lines run through "solid: always this core" and the old task box); `lesson-13-manual-4.png` table (cells "critical section, _ISR variant" and "split the work: ISR sends to a task" overflow their boxes and touch).
- problem: The sentence that carries the point of each diagram ("95 percent before vision and fusion arrive") is unreadable, and crossing lines make the affinity diagram hard to follow.
- principle: Coherence and signalling; one message per diagram, labels beside what they describe.
- change: Move those labels into a caption below each diagram ("Core 1 is at 95% before vision and fusion arrive."), allow the table cells to wrap, and lay out the affinity diagram with core 0 and core 1 as two columns so that no arrow crosses another.
- effort: S

### L13-6 (medium, copy) The hint ladder has no near-answer for the core step
- where: `two-brains.copy.js`, `hints`.
- problem: Hint 1 refers to a "core row", hint 2 asks "could either new task run on the other core?" and hint 3 jumps to the mutex. A learner stuck at the reset has no hint that says where the setting is, so they go straight to the SOLVE button.
- principle: Scaffolding as a ladder from nudge to near-answer.
- change: Reorder and add: 1 "Flash it. Read the serial monitor: which IDLE task is named?" 2 "That core is full. How much of its time do vision and fusion need each 50 ms?" 3 "The last argument of xTaskCreatePinnedToCore is the core. Change it for both tasks (one task alone is not enough). Then read the log again." 4 mutex hint. 5 RAM star hint.
- effort: S

### L13-7 (low, ui) The result screen does not show the thing that was learned
- where: `lesson-13-solved.png`, "CPU LOAD, WHOLE RUN 68%" and the stack table (columns "peak use" and "never used" unexplained).
- problem: The summary shows a single 68% and a 20-row stack table; the outcome of the stage, work balanced between two cores, is not shown, and the table pushes the lesson note below the fold.
- principle: Feedback that informs, not only celebrates; stated takeaway.
- change: Replace the single CPU figure with "core 0: x%, core 1: y%" and put the two-sentence takeaway above the table; collapse the stack table by default and label "never used" as "spare bytes".
- effort: S

### L13-8 (low, lesson) The star target is stack trimming, not dual-core engineering
- where: `two-brains.js` `bonus: B(70, 41168)`, hint 4, alts "tight stacks".
- problem: Mastery in this stage is rewarded for shaving RAM, a skill from stage 4, while the idea of this stage (short lock, balanced cores) earns nothing extra. Hint 4 also nearly states the method.
- principle: Optional mastery should reward the stage's own skill; retrieval practice should be a question, not a recipe.
- change: Without changing what is measured, rename the star line in the UI to "RAM star (stage 4 skill: stacks)" and shorten hint 4 to "Stack = base + deepest call. Check peak use in the result table of your last run."
- effort: S

## Not judged
Animation, sound and timing of the dialogue; scrolling behaviour inside the chart, objectives panel and manual; the phone layout (not part of this scope's screenshots). Manual sections 2, 4, 6 and 7 were read in source only.
