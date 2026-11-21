# Review: lesson 14, Flight Readiness Review

## Verdict
The stage has a strong "broken first" design: a naive watchdog setup, a leak and thin stacks that surface one at a time, with several valid fixes (the `alts`) and good wrong-answer feedback. The weak points are in how the failure is shown: on the first crash the chart marks nothing and the serial monitor shows only the tail, so the learner cannot see which task tripped, and the manual tells them the whole failure sequence before they play it. The hints and the reference note also steer toward one fix ("do not subscribe camera and science") while the stage accepts, and rewards, feeding between phases.

## Keep
- Broken first, one finding at a time, with a named reaction for each failure (`watchdog`, `neverFeeds`, `doubleFree`, `thinStack`, `diagHog`): specific, about the cause, and says where to look next.
- The "feeding honestly" diagram (lesson-14-manual-2.png): three columns, one message, green/amber/red plus a text label so colour is not the only signal.
- Quiz questions 2, 3 and 4 ask for consequences in a scenario (apply/analyse), not names.
- Alternatives (camera fed between phases, 64 B margins, diag frees before logging) are accepted: real autonomy.
- The heap chart (lesson-14-manual-4.png) shows a slope, which is the actual skill: "a leak is a slope".

## Findings

### L14-1 (high, ui/lesson) The first crash is not interpretable on the chart
- where: `lesson-14-fail.png`, timing chart and serial monitor; `flight-readiness-review.js` `evidence`: `if (K.crash) return [];`
- problem: After the watchdog reset at 319 ms there is a red line and the cut-off label "watchdog reset at 319 ms: the run en...", but no evidence bracket on the task that tripped. The serial monitor (3 lines high) shows only "Rebooting..." and the result block; the line `E (318) task_wdt ... camera` that the whole stage depends on is scrolled out of view. The mission-control text says "The serial monitor names the task", but the learner cannot see it without scrolling. The camera row has no mark at all.
- principle: Productive failure needs an interpretable failure; feedback must be where the player is looking (spatial contiguity, signalling).
- change: Do not change what is measured. Present it differently: (a) scroll the serial monitor so the first error line is visible after a crash (or pin the first `E (...)` line above the result block); (b) on a watchdog crash, draw a labelled bracket on the named task's row from its last reset to the reset line ("camera: no esp_task_wdt_reset() for 300 ms"); (c) shorten the chart label to "watchdog reset, 319 ms" so it is not clipped. The existing `evidence` function already knows how to build such brackets for non-crash cases.
- effort: M

### L14-2 (high, copy/theory) The manual spoils the failure the stage is built on
- where: `lesson-14-manual-0.png`, section 1, the diagram footers ("finding 1: camera trips at 318 ms", "NULL at 637 ms", "0 to 20 B spare") and the paragraph "the first run resets at 318 ms (watchdog), the second ends at 637 ms (heap)...".
- problem: The theory opens by itself before the mission and states what the first, second and third run will show, including which task trips. The learner then knows the answer ("camera") before the broken-first experience, and the briefing's "The first failure will tell you where to look" loses its point. The figures also disagree: the manual says 318 ms, the chart label says 319 ms.
- principle: Productive failure (encounter the problem before the explanation); desirable difficulty; consistency.
- change: In the section 1 diagram, replace the three "finding N: ..." captions with the question each tool answers: "which task is stuck?", "does free heap come back?", "how close to the edge?". Rewrite the paragraph: "The review team has already hardened the firmware in the naive way. Flash it and read what fails. Fixing one finding often reveals the next, because a crash hides everything that would have happened after it." Keep the exact numbers for the post-mission sections, and use one figure (318 or 319) everywhere.
- effort: S

### L14-3 (medium, lesson/copy) Hints and reference note push one fix, the stage rewards another
- where: `hints[2]` "A task that legitimately waits longer than the timeout should not be subscribed", `reactions.watchdog[1]`, `solutionNote[0]` "a 300 ms timeout is the wrong check for them"; versus `alts` "camera kept on the watchdog, fed between phases" (3 stars) and manual section 3.
- problem: The hint ladder nearly gives the answer at rung 3 and closes off the better engineering option the stage itself accepts. A learner who finds the feed-between-phases solution is told by the solution note that it was the "wrong check". The reaction text says "cannot stay subscribed in its current form", which is the only correct statement.
- principle: Scaffolding ladder (nudge to near-answer), autonomy and several valid solutions; feedback that matches the assessment.
- change: Hint 3: "Two ways out for a task whose work is longer than the timeout: stop watching it, or feed the dog between its phases. Which keeps the protection?" Solution note: "My version stops watching camera and science. Feeding camera between its two phases also works, and keeps the protection. Either way, the longest gap between resets must stay under 300 ms." Hint 4 should still end with "plus 32 bytes" but ask first: "Read the unused-stack line; add what is missing."
- effort: S

### L14-4 (medium, ui) The objectives panel is cut off and the dialogue covers it
- where: `lesson-14-briefing.png` and `lesson-14-fail.png`, top right: the 5th objective ("Diagnostics: at least 6 snapshots...") is clipped and the other six are off-screen; the mission-control box sits over the panel's lower edge.
- problem: This stage has 11 objectives. Only the first four and a half are visible, with no sign that there are more or that the list scrolls. The Diagnostics goal is unreadable. After a crash the learner cannot see which of the regression objectives went red without scrolling.
- principle: Visual hierarchy and signalling; goals must be clear before play; cognitive load.
- change: Group the seven "Still working from stages ..." lines under one collapsed row ("Stages 1 to 13 still pass: 7 checks") that expands and turns red when any fails; let the objectives panel use the space above the dialogue box; add a scroll fade or "+7 more" indicator. Do not drop the checks.
- effort: M

### L14-5 (medium, lesson/copy) Four ideas in the briefing; the loop teaches one thing per run only after the first
- where: `briefing` paragraphs 1 to 3 and the goals (watchdog, heap, stack, diagnostics, plus 7 regression goals).
- problem: The briefing lists watchdog, heap, stack margin, snapshots and priority in one go ("What must work: ..."). Since the stage reveals them in order (watchdog, heap, stack, diag timing), the learner is told three goals they cannot act on yet. The "diagnostics at least 6 snapshots within 100 ms" goal has no link to the priority idea until the regression fails.
- principle: One new concept per step; segmenting; progressive disclosure.
- change: Cut paragraph 3 to: "What must work: the rover must survive the whole test, and stages 1 to 13 must still pass. The objectives list the rest." Name diag's priority as a trade-off in a hint or in the `diagHog` reaction, which already does it. Keep the objectives as they are.
- effort: S

### L14-6 (medium, theory) Section 3 and 5 are dense; production detail crowds the core idea
- where: `lesson-14-manual-2.png` bullet "From a helper that does not check the work" (about 11 lines including `esp_task_wdt_reset_user()` / `ESP_ERR_NOT_FOUND` detail) and `lesson-14-manual-4.png` bullet "What happens when it runs out" (`CONFIG_HEAP_ABORT_WHEN_ALLOCATION_FAILS`, `heap_caps_register_failed_alloc_callback`, `StoreProhibited`).
- problem: A learner at the end of a 14-stage course still has to parse long bullets with four or five API names each, in light grey text at small size over a long line (about 110 characters). The key rule (feed after the work, from the task's own loop) is in bold but the follow-on detail drowns it. Non-native readers will struggle.
- principle: Segmenting, coherence (remove extraneous material), line length and short paragraphs.
- change: Keep the one-line rule per bullet and move the API detail to a "Real ESP-IDF detail" collapsible or a short list below the widget. For example: "A helper that feeds for the task hides hangs: the dog keeps being fed while the task is stuck." Limit each bullet to two sentences.
- effort: M

### L14-7 (low, theory) The heap chart label is struck through by the curve
- where: `lesson-14-manual-4.png`, text "next allocation returns NULL" sits on top of the line segment between 450 and 600 ms; the "0" label sits just above the axis line.
- problem: The annotation is hard to read, and it is the label for the one point that matters.
- principle: Spatial contiguity and legibility; diagram labels must not overlap.
- change: Move the label below-left of the red marker (or above the line) with a short leader, and give it a background of the panel colour.
- effort: S

### L14-8 (low, theory/ui) Reference-solution screen is a long table with little interpretation
- where: `lesson-14-solved.png`: stars, 71% and "43416 B" tiles, then a 20-row stack table that continues below the fold.
- problem: The screen shows the numbers but not what they teach. 71% and 43416 B are not tied to a goal, and the table does not highlight the four stacks that changed (800, 800, 1100, 1300) or the 32 B margin column that is the lesson. I cannot judge from stills how the real result screen celebrates a player's own pass.
- principle: Feedback that says what to look at next; signalling; worked example.
- change: Highlight the "never used" cells that are exactly the margin, mark the four tasks that were changed, and add one line above the table: "Every stack now has at least 32 B unused. Compare with your own run." Sort changed rows to the top.
- effort: S
