# Review: lesson 5, Science Pipeline (queues)

Scope: `science-pipeline.js`, `.content.js`, `.copy.js`, the stage 4 goals for continuity, and the six screenshots `lesson-5-*.png` (newer than the sources). Screenshots are still frames, so animation, sound and timing are not judged.

## Verdict
The stage has a strong core: a bug with no error code, a single clear mechanism (producer faster than consumer), a mission that is the skill itself (split, queue, size, prioritise), and feedback that names the cause. What weakens it is presentation: the objectives panel hides three of seven goals, several diagrams have overlapping or clipped labels, and the hints and reactions point at chart features ("solid" row, "instrument row") that are not on screen. The manual also carries more detail than one new concept needs.

## Keep
- Broken-first start: flashing the starting code shows a bracketed evidence band in the science row and a mission-control reaction that names the cause (`lesson-5-fail.png`).
- Objectives with a tick or cross plus a measured detail line ("4 samples overwritten", "6 of 10 delivered"): pass and fail are readable without colour.
- Wrong-answer reactions (`oneTask`, `shortQueue`, `lowPrio`, `dropped`, `empty`, `hog`) each name the cause and the next thing to look at.
- Stack sizing from stage 4 returns as a retrieval task (science 1280, radio 2048) and the radio-above-motor trap revisits stage 2.
- `solutionNote` ends with a "set the length to 1 and find the first lost sample" experiment, and `realCode` declares the 100 Hz versus 1000 Hz tick difference.

## Findings

### L5-1 (high, ui) Objectives panel hides 3 of 7 goals
`lesson-5-fail.png` and `lesson-5-briefing.png`, top right: the list is cut off in the middle of "Still working from stage 4: mapper..." and the stage 3, 2 and 1 goals are not visible; there is no scroll cue. The `hog` reaction says "an earlier goal broke", but the learner cannot see which one.
Principle: goals clear and progress visible; signalling.
Change: show the four regression goals as one collapsed row, "Stages 1 to 4 still pass (4 checks)", that turns red and expands on failure, or make the panel scroll with a visible "3 more" cue. Do not change what is measured.

### L5-2 (high, theory) Diagram labels overlap or are clipped, including the central concept diagram
- `lesson-5-manual-2.png` (section 3): in the blocking diagram the arrow labels "queue empty, timeout > 0" and "item arrives or timeout" run over the box text; "task calls xQueueRecei" is cut off in the skewed Running box. This is the diagram that explains what a queue call does.
- `lesson-5-manual-0.png`: both caption lines under the timeline end at the right edge ("keeps", "6 of 10 over th").
- `lesson-5-manual-4.png`: the top caption "science is Ready but waits for the 60 ms frame, th..." is clipped.
- Diagram notes are about 10 px against 16 px body text.
Principle: spatial contiguity; readability.
Change: widen the gaps in `blocking` (put the two arrow labels below the arrows, or shorten to "empty, timeout > 0" and "item arrives / timeout"); wrap the long captions to two lines of 60 characters or fewer in `problem` and `prio`; raise the note size or move the long sentences out of the SVG into a normal caption under it.

### L5-3 (high, copy) Hints and reactions refer to chart features that are not there
- `hints[0]`: "Which task row is solid while the instrument row shows overwritten samples?" The chart (`lesson-5-fail.png`) has no instrument row, and the science row inside the bracket is a dotted "blocked on a delay" line, not solid.
- `reactions.oneTask`: "the science row is solid where transmit() runs". transmit() blocks 45 ms and uses 3 ms CPU, so the row is mostly dotted. `solutionNote` also says "in the instrument row". The `watchdog` reaction uses "solid" correctly, so the word means two different things.
The learner who follows the advice looks for something that does not exist and may conclude they misread the chart.
Principle: feedback must be specific and match what is on screen; split attention.
Change: hint 1: "Flash it and look at the science row. It sits in a dotted blocked line for about 45 ms every time transmit() runs. What does the instrument do to samples that arrive in that time?" `oneTask`: "...so it is blocked inside transmit() for 45 ms (the dotted part of its row) and the instrument overwrites what arrives in that time." `solutionNote`: "Find the first red mark in the faults row." Optional (lesson owner): add an "instrument" row of sample ticks to the chart so the manual diagram and the chart match.

### L5-4 (medium, lesson) Evidence label is truncated and the bracket does not show the cause
`lesson-5-fail.png`, science row: the label "4 samples overwritten in the instrument: science was not at readSample() in time (first a..." runs off the panel, so the "first at N ms" part is lost. The bracket spans only the short stretch from the last `readSample` to the first loss, not the 45 ms transmit() window that causes it.
Principle: signalling; temporal contiguity of the explanation with the event.
Change in `evidence`: shorten the label to "4 samples lost (first at 553 ms): reader busy in transmit()" (under about 60 characters), and extend `to` so the bracket covers the whole blocked stretch. The measured values stay as they are.

### L5-5 (medium, theory) Priority diagram contradicts its own text
`lesson-5-manual-4.png`: the text says the reader at the camera's priority "shares the CPU round-robin" and "gets one tick in two", but the lower diagram draws the camera as one solid 60 ms bar and science as a hollow Ready bar for the whole time. The caption for each diagram also sits between the two diagrams, so it is unclear which one it belongs to.
Principle: coherence; signalling; spatial contiguity.
Change: draw alternating 1 ms slices for the equal-priority case, or change the text to match what is drawn. Put each caption directly under its own diagram and give each diagram one message.

### L5-6 (medium, theory) Manual carries more than one new concept per section
Sections 2, 3 and 6 stack many side details in one list: `xQueueCreateStatic`, `SendToFront`, `Overwrite`, `StaticQueue_t` size, wake order, `INCLUDE_vTaskSuspend`, queue sets, stream and message buffers. Section 6 also uses ISRs and `FromISR` calls before interrupts and semaphores are taught (stage 7), and nothing in the mission exercises them, yet one of the six checks asks about them. In `lesson-5-manual-2.png` the key points (timeout 0, N, forever, a blocked task costs nothing) are mixed with this trivia.
Principle: one new concept per step; intrinsic and extraneous load; segmenting.
Change: keep per section the three things the mission needs (create, send/receive, timeout meaning, sizing, priority). Move the rest into one closing "Beyond this stage" list marked optional. Cut section 6 to a short teaser ("an ISR cannot block, so it uses `FromISR`; stage 7") and replace its check question with one on blocking versus polling or back-pressure.

### L5-7 (medium, lesson) Starting code and hint ladder skip parts of the skill that section 2 and 3 teach
- `start()` already creates `samples` (length 1) and gives `science` priority 2, so the learner never creates the queue or chooses the reader's priority. Section 2's rule "create the queue before the tasks, check for NULL" and section 5's reader-above-camera rule are only met in the quiz. Only a deliberate mistake exercises them.
- The hints go from "two tasks" to priorities to numbers; none says what the reader's send and the radio's receive should wait for (timeout forever or not). The `dropped` reaction covers it only after a failure. Hint 4 then gives the reader and radio stack values and the queue length outright.
Principle: constructive alignment; scaffolding ladder from nudge to near-answer.
Change: add a hint between 2 and 3: "The radio has nothing to do until a sample exists: which timeout lets it wait without using CPU? And the reader must not give a sample up: which timeout waits for room?" Keep the pre-built queue (it keeps the broken-first diagnosis clean), but add to the briefing: "The queue object already exists but nothing uses it. Check its length against the burst."

### L5-8 (low, ui) Result screen: unexplained stars and clipped button
`lesson-5-solved.png`: three stars are shown with no line saying what earned them (RAM, CPU) and the key insight of the stage, how full the queue got, is absent; the table column "never used" is not explained; the "BACK TO THE CODE" button is cut off at the bottom of the 900 px viewport.
Principle: feedback and visible mastery; debrief.
Change: add one line per star criterion ("RAM: 16928 B of 17000 B"), add "queue peak: 2 of 3 slots" to the result, gloss "never used" as "free stack at the deepest point", and keep the button above the fold (reduce the table padding or make the dialog scroll).

## Not judged
Animation, sound, the interactive widgets (`states`, `queuelab`, below the fold in the manual screenshots) and the check-question UI. They are not visible in the stills. The 400 px layout was not part of this stage's screenshot set.
