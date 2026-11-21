# Review: lesson 10, All Systems Go (event groups)

## Verdict
The stage is well built: one new idea (a bit per fact, wait on a mask), a broken-first start that fails in an interpretable way, specific mission-control reactions, and a manual with a widget per section. What holds it back is presentation. The player cannot see on the chart which fact arrived when, the objectives panel hides most of its list, and the manual explains the failure before the player has met it and then runs past the one idea into ISR, rendezvous and deletion detail. Screenshots are stills at 1440 x 900, so animation, sound and timing are not judged here.

## Keep
- The start firmware (one semaphore, three givers) as the "broken first" state, and the `diagnose` reactions that name the specific mistake (sendsEarly, anyBit, oneBit, oneWindow).
- The evidence bracket on the uplink row (`lesson-10-fail.png`, red box at the first rejected packet) and the log line "missing: time sync".
- Hint 4: deleting the unused `ready_sem` for the RAM star rewards engineering, not grinding.
- The tool-choice tree and table in manual section 5 (`lesson-10-manual-4.png`): one message, consistent colours.
- The `solutionNote` closing prompt (change the wait, flash, read the row): it turns SOLVE into an experiment.

## Findings

### L10-1 (medium, owner: lesson) The chart shows the failure but not the cause
- where: `lesson-10-fail.png`, chart rows `radio_link`, `time_sync`, `gps_fix`, `uplink`; `evidence()` in `all-systems-go.js`.
- problem: The player has to work out "which fact was missing" from a log line. On the chart the bring-up rows are thin dotted "blocked on delay" lines with a few orange blocks, and nothing says "radio is up here, clock here, fix here". The only label is on the uplink bracket, and it is cut off at the right edge ("missing time sync, p").
- principle: Spatial and temporal contiguity; feedback that is specific about the cause; the chart is where the player is looking.
- change: Return additional short brackets from `evidence` on the three bring-up rows at the moment each fact became true, labelled "radio up", "clock ok", "fix ok", in the same colour as the uplink bracket's neighbours. Shorten the uplink label to fit (about 28 characters): "rejected: no clock, no fix". The packet time is already in the objective detail.
- effort: M

### L10-2 (medium, owner: ui) The objectives panel hides what matters
- where: `lesson-10-briefing.png` and `lesson-10-fail.png`, top-right objectives panel.
- problem: There are 11 objectives, 8 of them "Still working from stage N". Only about 3.5 fit; the fourth is cut off mid-line ("stowed once per pass 180 to 250 ms") and the new objective detail lines are partly hidden below the fold of the panel. The two objectives of this stage compete with the regression list for attention.
- principle: Signalling; extraneous load; goals clear before play.
- change: Show the new objectives in full, and collapse all "Still working from stage N" rows into one line, "Earlier stages still pass (8 checks)", that expands on click and turns red with a count when one fails. Keep the expanded text as it is.
- effort: M

### L10-3 (medium, owner: lesson) Objective 2 fails on a count, but its detail reads like a pass
- where: `lesson-10-fail.png`, objective 2 detail: "7 packets, accepted at 693, 876 ms, delays 26, 22 ms (-1 = never)"; the `check` strings in `all-systems-go.js`.
- problem: The objective is red, but the numbers shown (two accepted packets, short delays) look fine. The reason (7 packets sent, 2 allowed) is only the first number, and "(-1 = never)" is simulator jargon.
- principle: Feedback that says what is wrong and what to look at next; constructive alignment (the wording should show which of the two skills, "one per window" or "on time", failed).
- change: Detail string, same measurements: `${up.length} packets sent, 2 expected. Accepted at ${okU.join(' and ')} ms, ${upLat.join(' and ')} ms after the last fact was ready.` Show "never" instead of -1 when a window had no packet. Do not change what is measured.
- effort: S

### L10-4 (medium, owner: theory) Theory pre-empts the failure
- where: `manual` section 1, "1. Waiting for more than one thing" (`lesson-10-manual-0.png`): "...Five packets are rejected and two are accepted", "Counting the gives does not repair it...". Also the briefing's second paragraph.
- problem: The player is told the semaphore design fails, how often, and that counting does not fix it before they flash. The surprise and the diagnosing, which is the point of broken-first, are already spent. Section 1's widget (`semstep`) does let them discover the effect, but the bullets state the answer first.
- principle: Productive failure; pre-training (key terms first, explanation after the experience).
- change: Cut section 1 to the situation, the diagram and a question: "Predict: at 456 ms the radio gives. What does uplink send?" (this is quiz Q1). Move the numbers (seven gives, five rejected) and the "counting does not repair it" bullet to section 5, after the player has flashed the start code. Keep the briefing, which already says "read the uplink row before you change anything".
- effort: M

### L10-5 (medium, owner: theory) One new idea, but the manual and checks go past it
- where: `manual` section 6 (seven bullets: never poll, set after work, timeout, FromISR via timer service task, several waiters, `xEventGroupSync`, delete); `quiz` Q5 and Q6.
- problem: The mission needs: set a bit, wait for all, clear on exit. Section 6 adds ISR deferral, rendezvous and deletion; Q6 asks about `xEventGroupSetBitsFromISR` and the timer service task, which the player never uses here. Q5 describes "three binary semaphores", a design they never build. No check question recalls an earlier stage (for example "an ISR must wake uplink when the bumper fires: which of the four tools from section 5, and why?"). Q1's right answer is also the longest option.
- principle: One new concept per step; cognitive load (intrinsic vs extraneous); retrieval practice and spacing; checks at apply or analyse level.
- change: Keep three bullets in section 6 (never poll, set the bit after the work, a timeout is a decision) and put the rest under a collapsed "Going further". Replace Q6 with an apply question tied to the mission: "uplink waits with pdFALSE for the all-flag. Which packet is rejected?" Replace Q5 with a retrieval question from stages 7 and 8 (ISR plus one waiter: semaphore or notification; why not an event group?). Shorten Q1's correct option to match the others.
- effort: M

### L10-6 (medium, owner: theory) The key code comments are cut off
- where: `lesson-10-manual-2.png`, the `xEventGroupWaitBits` listing: "// pdTRUE: clear the mask bits when the call re", "// pdFALSE: all mask bits must be set, pdFALSE:", "// portMAX_DELAY: block until the condition is". The `.manual pre` rule is `overflow-x: auto`, and nothing shows that the line scrolls.
- problem: The explanation of the three easy-to-swap arguments, the point of section 3, is the part that is hidden. The player has to scroll sideways to read it, or does not.
- principle: Text legibility; split attention (the label must sit with the thing it describes).
- change: Put the comments above each parameter, one short line each, for example `// pdTRUE: clear the mask bits on return`, `// pdTRUE: wait for ALL bits, pdFALSE: ANY one`, `// portMAX_DELAY: sleep until true`. Keep each line under about 60 characters.
- effort: S

### L10-7 (low, owner: theory) The first diagram is crowded and its labels collide
- where: `lesson-10-manual-0.png`, diagram under section 1: red labels "rejected: no clock, no fix" and "rejected: no fix" run into each other; the "ready so far" row staggers "radio" at two heights; the axis is labelled only in 60 ms steps.
- problem: The three rejected packets are the message but they read as one red line. The diagram also shows 4 of the 7 gives, and the text does not say it is a window.
- principle: Diagrams have one message and a caption that states it; Coherence; Signalling.
- change: Number the three rejected packets 1, 2, 3 under their boxes and put the "no clock, no fix" text in a short list below the diagram, or stack the labels at two heights. Add to the caption: "First window only: 4 of the 7 gives".
- effort: S

### L10-8 (low, owner: ui) The result screen does not show the stage's own result
- where: `lesson-10-solved.png`: reference-solution card shows CPU 99%, RAM 30030 B and the stack table for 19 tasks.
- problem: The numbers the stage is about (two packets accepted at 693 and 874 ms, 0 rejected, delays 26 and 25 ms) are only in the objectives behind the card. The card is the same shape for every stage, so a player who solves it sees the RAM table first. The grey stars on a reference solution also read as "not earned" without a reason.
- principle: The result screen should celebrate and inform; mastery visible.
- change: Add a line to the result card from the `check` details: "Uplink: 2 packets, 0 rejected, 26 and 25 ms after the last fact". Keep the stack table, but fold it by default below this line. Leave the stars as they are for SOLVE, since the caption already says stars are saved only for the player's code.
- effort: S
