# Review: lesson 4, Every Byte Counts

## Verdict
The stage has a strong core: a broken-first mission where the learner sees a crash, a result table with a "never used" column that makes stack sizing measurable, and a manual that is honest about game numbers versus real ESP-IDF. It is weakened by three things. The theory hands over the exact answer numbers before the mission, so the "measure, do not guess" lesson is read, not done. Several manual diagrams clip their text. The objectives panel hides three of the eight objectives, including the 128 B headroom one that the sizing task depends on. The stage also teaches too many ideas at once (stack, TCB, heap, leak, fragmentation, canary, watchpoint, poisoning, tracing, static allocation).

Limits: I reviewed still frames only (no animation, sound or timing). The shots cover manual sections 1, 3 and 5, so I did not see the `stacklab` (section 4) widget and only the top of `leaklab` (section 5), and I make no claims about their behaviour.

## Keep
- The broken-first start: the learner flashes the 4096/4096 code and meets a real crash with a plain serial message (`lesson-4-fail.png`, mission control "pvPortMalloc returned NULL...").
- The result table with `stack / peak use / never used` (`lesson-4-solved.png`): it is the measurement tool the manual describes, and it is shown with real numbers.
- Declared simplifications ("The game simplifies the numbers", 768 B base, 8 KB heap) and the bytes-versus-words note.
- Reaction wording for `leak`, `headroom`, `budget`: each names the cause and the figure to read next.
- Pass/fail objectives use a tick and a cross as well as colour.

## Findings

### L4-1 (high, owner: theory): diagram text is clipped or overflows its boxes
- where: `every-byte-counts.content.js`, `memmap`, `canary` and the inline leak/fragmentation SVG. Seen in `lesson-4-manual-0.png`, `lesson-4-manual-2.png`, `lesson-4-manual-4.png`.
- problem:
  - In `manual-0` the "free heap: 8192 B left ... (game number)" label spills past both ends of its bar, and the two notes under it are cut at the right edge ("Stack and TCB ar", "so that mistakes").
  - In `manual-2` all the right-hand detection lines are cut ("...no longer the pattern: overf", "***ERROR*** A stack overflow in task nav has been detecte"). The "end of stack: guard word / canary" label overflows its red box, and the second arrow points at nothing.
  - In `manual-4` "in use" overflows the small fragmentation boxes.
  - The learner loses the panic message, the one thing the diagram exists to show.
- principle: Spatial contiguity and readability. A clipped label is no label.
- change:
  - Widen the canary right-hand column or split it into two lines per item (about 55 characters each).
  - Move the long notes in `memmap` below the diagram as ordinary paragraph text.
  - Shorten the box labels ("free heap 8192 B (game)", "guard word").
  - Use "use" and "free" in the 44 px fragmentation boxes.
  - Point the `memmap` arrow at the TCB and stack blocks, not at the "free heap" bar.
  - Give the second canary arrow a label ("pattern intact") or remove it.
  - In `budget`, fix "3328 + 1536 B of stack = 13120 B total": it is 4864 B, and 13120 is the whole firmware, including 8256 B for the other tasks.
  - Keep one colour per meaning. Cyan is the heap in `memmap` but "mapper" in `budget`, and green is "stack of nav" and also "mapper's stack".
- effort: S

### L4-2 (high, owner: theory): the manual gives away the mission's answer, so there is no independent problem
- where: `memmap` ("stack of nav 3328 B", "stack of mapper 1536 B"), section 2 ("768 + 2400 = 3168", "768 + 600 = 1368"), `budget` ("3328 + 1536"), `realCode` (`STACK_NAV 3328`, `STACK_MAPPER 1536`), and then hint 4 again.
- problem: The learner reads the final stack sizes four times before the mission. The mission then reduces to copying numbers; "read the never used column and size from the peak" is never required. The measure-it-yourself skill is not practised. That is weak constructive alignment between the objective (size stacks from measured peaks) and the activity.
- principle: Worked example, then completion problem, then independent problem; the "expertise reversal" and "fading" ideas. The theory should show the method on a different case.
- change:
  - In the theory diagrams and section 2 use a neutral example, for instance a `logger` task with peak 1900 B, stack 2112 B, and a 10 percent margin worked out. Keep 3168 and 1368 out of the manual.
  - In `realCode` use placeholder macros with a comment ("measure, then fill in") or the logger example.
  - Keep hint 4 as the last rung only.
  - Let the `stacklab` widget keep the game numbers, since it is interactive, but add a one-line prompt "find them yourself first, then check in the mission".
- effort: M

### L4-3 (high, owner: ui): the objectives panel hides objectives, and the briefing never states the 128 B headroom rule
- where: `lesson-4-briefing.png`, `lesson-4-fail.png`, `lesson-4-solved.png`, objectives panel top right.
- problem:
  - The panel shows only 5 of the 8 objectives. The last visible line, "Memory budget ... 14500 bytes of RAM", sits cut at the panel edge with no scroll cue. In `solved` the final visible ✓ is also clipped.
  - "Stack headroom: nav and mapper keep at least 128 bytes unused" and the three regression objectives are out of view.
  - The briefing and hints never state the 128 B figure. A learner who sets 3200 or 1400 passes the budget, fails headroom, and only then learns the rule from the `headroom` reaction.
- principle: Goals are clear before play; signalling. The next action should be visible, and the assessment criteria known up front.
- change:
  - Let the objectives panel grow, or scroll with a visible fade and a "+3 more" label. Collapse the three "Still working from" objectives into one line "Stages 1 to 3 still pass (3 checks)".
  - Add to briefing paragraph 4: "Keep at least 128 bytes of each stack unused at its peak."
- effort: S for the briefing copy; M for the panel.

### L4-4 (medium, owner: theory): too many new ideas for one stage
- where: manual sections 2 to 7; for example the `configMINIMAL_STACK_SIZE` paragraph in section 2, canary versus `_PTRVAL` versus watchpoint in section 3, fragmentation in section 5, poisoning, heap tracing and `xTaskCreateStatic` in section 7. Section 3 and section 7 fill most of a page with config names.
- problem: The mission uses three ideas: heap leak, stack peak plus margin, a RAM budget. The manual adds fragmentation (never tested or played), watchpoints, `_PTRVAL`, `_NONE`, poisoning levels, heap tracing and static allocation. A learner has no way to tell which of these they must keep. The extra detail competes with the core ideas.
- principle: One new concept per step; intrinsic versus extraneous load; segmenting.
- change:
  - Move fragmentation, the watchpoint and `_PTRVAL`/`_NONE` details, the `configMINIMAL_STACK_SIZE` paragraph, poisoning and tracing into `<details>` blocks titled "Going deeper (not needed for the mission)".
  - Keep in the main text: stack = base + deepest call, canary catches overflow late, high-water mark, free every malloc, margin.
  - Give section 7 a short top list of the 3 functions the mission uses (`uxTaskGetStackHighWaterMark`, `esp_get_free_heap_size`, `free`).
- effort: M

### L4-5 (medium, owner: lesson): the leak is not visible before the crash, and the first run does not show the cause
- where: `lesson-4-fail.png` serial monitor and chart; `evidence` in `every-byte-counts.js`.
- problem:
  - The first flash shows only the crash line, "(1179) pvPortMalloc returned NULL", and the result line. The heap draining, which is the productive-failure story ("1 frame per lap, nothing given back"), is never on screen.
  - The mapper row in the chart is blank apart from a tick at the crash, and all objectives, including the budget, show ✕, so the cause cannot be told from the effects.
  - The labelled evidence bracket exists only when the run completes (the slow-loop wrong answer). In the crash case there is none.
- principle: Productive failure needs an interpretable failure; temporal contiguity (explanation appears with the event); feedback names the cause.
- change: Do not change what is measured. Present the evidence: have the simulated serial monitor print one line per allocation ("(250) mapper: heap free 6144 B", "(500) ... 4096 B", "(750) ... 2048 B", "(1000) ... 0 B") before the panic. Where the run crashes, add an `evidence` entry on the mapper row with the label "4 frame buffers allocated, none freed; heap 0 B left" from the first allocation to the crash.
- effort: M

### L4-6 (medium, owner: theory): the check questions are easy to guess and none asks for a calculation
- where: `quiz` in `every-byte-counts.content.js` (6 questions, `a` values 1, 1, 1, 0, 1, 1).
- problem:
  - The correct answer is option 2 in five of six questions, and it is almost always the longest, most qualified option. The wrong options are one-line absurdities ("the kernel grows the stack automatically"). A learner can pass by pattern.
  - Nobody has to compute a stack size, which is the skill the mission assesses. No question recalls an earlier stage.
- principle: Retrieval practice at the Bloom apply level; distractors based on real misconceptions; spacing.
- change:
  - Shuffle the positions of the correct answers.
  - Make wrong options similar in length, and base them on real misconceptions: "Stack depth is in words, so 2112 means 8448 bytes", "Allocate the buffer once outside the loop and the leak cannot happen".
  - Add a question like: "A task's deepest call uses 1900 B and its base is 768 B. Which stack size is right for the flight board? 2668 / 2900 / 4096". Note that the right answer includes the margin, and that 2668 is the exact-peak trap.
  - Add one stage-3 recall question: "nav at priority 1 runs 20 ms per 250 ms. What does that do to the spectrometer's 50 Hz?"
- effort: M

### L4-7 (medium, owner: copy): two reactions and the solution note mislead or leave the learner without a task
- where: `reactions.hog` and `solutionNote` in `every-byte-counts.copy.js`; `lesson-4-solved.png`.
- problem:
  - `hog` fires when the stage 1 to 3 checks fail (the wrong answer "nav above everything" does this) and then says "Changing priorities will not fix this. The leak and the stack sizes are memory problems." For the very cause that triggered it, a priority change is the fix, so the message points the learner away from it.
  - The solution note ends "Change the delay ... to 100 ms ... Then notice which check fails first." It gives no prediction to test and no hint what to look for. In `solved` it sits as a wall of text above the table.
- principle: Feedback names the cause and what to look at next; an escape hatch should teach.
- change:
  - Replace the second `hog` line with: "Look at the priorities of nav and mapper first. A task above priority 4 starves the lights, and one above 3 starves the motor. If they are at priority 1, check that no other task changed." Keep the first line.
  - Replace the solution-note second paragraph with: "Try it: set both delays to 100 ms. Before you flash, predict: will the heap still be full at the end? Will CPU load go up or down? Then read the result line. Which objective moves first, and why?"
- effort: S

### L4-8 (low, owner: theory): the result table contradicts the margin rule and does not point at nav and mapper
- where: `lesson-4-solved.png`, table: beacon and heart "never used 0", motor 20, spectro 12; manual section 6 "margin ... never zero"; `reactions.pass`.
- problem: The manual says a margin of zero is a crash waiting for the next change. The table, shown in the stage's own reference solution, has two tasks with 0 B and others at 12 to 56 B, with the rows of the two tasks the learner is sizing not marked. It reads as "the rule does not apply to the rest". The learner does not know whether to resize them.
- principle: Coherence and signalling; consistency between stated rule and shown evidence.
- change:
  - Highlight the nav and mapper rows in the result table, and add a "margin %" column.
  - Add one sentence to manual section 6: "The earlier tasks were sized exactly in stages 1 to 3 to keep those lessons simple. Real firmware would add a margin to each of them. In this stage only nav and mapper are checked."
- effort: S

## Not judged
Animation, sound, timing and the Instant-versus-Normal speed feel; the phone layout; the `stacklab` and `leaklab` widgets beyond their first lines.
