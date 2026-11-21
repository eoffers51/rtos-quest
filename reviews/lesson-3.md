# Review: lesson 3, Steady Pulse

Scope: lesson 3. Read `steady-pulse.js`, `.copy.js`, `.content.js` and the goals of stage 2. Visuals judged from SVG code only; items marked "visual check" need a person.

## Verdict
The stage is well built. It uses "broken first" (the supplied vTaskDelay(20) fails in a visible way). The objectives, the six wrong-answer cases and the reactions line up, and earlier behaviour is kept as regression goals. The main weaknesses are one misleading description of the failure (gaps vs lateness), a quiz that can be gamed by answer position, a manual that carries too many ideas at once, and a few feedback gaps.

## Keep
- Broken-first start: the learner sees the drifting spectro task before any explanation, and the briefing says "Work out why before you change anything".
- The solution note ends with a prediction question about priority 2, which is retrieval and transfer from stage 2.
- Drift vs jitter is separated explicitly, and the reason the 25 ms limit is set that way is explained (raising a priority is not free).
- Declared simplifications: 1 ms tick vs ESP-IDF default 100 Hz, the game stack size, and the rounding of `pdMS_TO_TICKS`.
- Quiz questions ask for consequences (apply/analyse), not names.

## Findings

### L3-1 (high, owner: copy, effort S)
- where: `steady-pulse.copy.js`, hints[0]: "The gap is never exactly 20 ms, and it grows." and reactions.drift: "The gaps in the spectro row grow on every lap."
- problem: With vTaskDelay(20) the gap between starts is a roughly constant 23 to 27 ms. What grows is the lateness against the 20 ms grid (k x work). A learner who looks at the chart for growing gaps will not find them and may conclude they misread it. This contradicts manual section 3.
- principle: Feedback must be accurate about the cause and the observable; the failure must be interpretable.
- change: Hint 1: "Look at the gaps between spectro starts in the chart. Each gap is longer than 20 ms, so every sample starts a little later than its slot. Ask what the delay is counted from." Reaction: "The spectrometer count is low and each sample starts later than its slot. The gap between samples is always more than 20 ms: the delay is counted from the end of the work, so each lap adds the 3 to 7 ms of sampling. Look for a call that waits until a fixed time instead."

### L3-2 (medium, owner: theory, effort S)
- where: `steady-pulse.content.js`, `quiz`: every question has `a: 1`; the correct option is also the longest and most explained; the array ends with a `null` entry.
- problem: A learner can pass by always picking the second option, or by picking the most detailed one, with no understanding. The trailing `null` is unexplained (confirm it is intended).
- principle: Assessment validity; retrieval practice needs real recall. Also no question recalls stage 2.
- change: Shuffle the correct positions (for example 1, 2, 0, 2, 1, 0) and make distractors the same length and equally specific. Add one retrieval question that links to stage 2: "The spectrometer is raised to priority 3. Which earlier deadline is now at risk, and why?" (answer: the motor, because a 3 to 7 ms sample can delay a 10 ms motor loop). Remove the `null` if it is not needed.

### L3-3 (medium, owner: theory, effort M)
- where: `manual`, sections 1, 5, 6, 7; `tickDia`.
- problem: The stage is about one fix (vTaskDelayUntil vs drift) but the manual adds tick-rate rounding, 49.7 day wrap-around, jitter, dual-core pinning, overrun and pdFALSE, watchdog timeout, esp_timer and light sleep. A learner at stage 3 is likely to read the first screen, lose focus and never reach the fix in section 4. `tickDia` also carries two messages (where a tick comes from, and why a delay is n-1 to n ticks) plus two lines of prose written inside the SVG.
- principle: Cognitive load, one new concept per step; segmenting and pre-training; one message per diagram.
- change: Order for the objective: sections 2, 3, 4 first, then ticks as short "what you need to know" (rate, rounding) with the wrap-around and a dual-core aside moved to a "Going further" part. Mark sections 5 to 7 as "After you pass" (or collapsed). Split `tickDia` in two: (a) tick wakes tasks, (b) delay granularity; move the two prose lines out of the SVG into a caption. Move light sleep and `esp_timer_get_time()` to a short "Real hardware" list.

### L3-4 (medium, owner: copy, effort S)
- where: `solutionNote[1]`: "Set the spectro priority to 2 and watch the telemetry row. Which of the five objectives fails first...", versus manual section 5: "anything above 2 pushes telemetry past its 105 ms limit".
- problem: The manual says problems start above priority 2 (3 or higher), but the note asks the learner to test priority 2, which equals telemetry's priority and may not fail at all. The learner may see no failure and be confused. I cannot run the simulator; ask the verifier or fact-checker to confirm which value fails.
- principle: Constructive alignment; a prediction exercise must have a visible, interpretable result.
- change: Use the priority that is known to break an objective (probably 3): "Before you flash, predict it: set the spectro priority to 3. Which of the five objectives fails first, and what is the worst motor gap? Then flash and check." Add the word "predict" so it works as retrieval.

### L3-5 (medium, owner: copy, effort S)
- where: `reactions.pass`: "That is the whole lesson." and `reactions.drift` for the fudge case (`d(15)`).
- problem: (a) The pass message says the lesson is finished, while the manual says jitter remains and is a different thing; the learner is not told that the late starts they still see are expected. (b) A learner who shortens the delay (`d(15)`) gets the same drift message as one who has not changed anything, and nothing tells them why the fudge is wrong, which the manual says is a key trap.
- principle: Feedback specific to the cause; says what to look at next.
- change: Pass: "...You kept the period fixed while the work changed. Some starts are still a few milliseconds off the grid: that is jitter from higher-priority tasks, and it is allowed up to 25 ms. Drift would keep growing." Drift reaction, add one sentence: "Shortening the number only fits one average. The work takes 3 to 7 ms, so a fixed shorter delay still wanders."

### L3-6 (medium, owner: theory, effort S)
- where: `content.js`: section heading "4. vTaskDelayUntil: count from a fixed mark", lesson `topic` and hints say "vTaskDelayUntil" while `realCode` and the example use `xTaskDelayUntil`.
- problem: A learner searching the ESP-IDF docs or the Hints sees two names in the same page before the aliasing is explained in the fourth bullet. The editor's op is `until`, which adds a third name.
- principle: Prior knowledge: terms introduced before they are used; consistent vocabulary.
- change: Introduce it once, at the top of section 4: "In ESP-IDF v5 the function is called xTaskDelayUntil (the older name vTaskDelayUntil still works). This manual uses xTaskDelayUntil." Then use that name in headings, quiz and hints.

### L3-7 (low, owner: copy, effort S)
- where: `hints[3]`: "give spectro the 768 byte base plus the 500 bytes that sampleSpectrometer() needs... The CPU star is harder: ... the rest of the work decides it."
- problem: The fourth hint is about the optional stars, but it sits in the same ladder as the hints for the main goal, uses "base" and "star" without introduction, and the CPU part gives no action. After hint 3 (near-answer) a stuck learner on the main goal has no further hint; a learner after stars gets vague advice. Also no hint covers the "hog" case (priority).
- principle: Scaffolding ladder from nudge to near-answer; autonomy.
- change: Add a hint between 2 and 3 for priority: "If the motor or telemetry start missing deadlines after your change, check the spectro priority. 25 ms of lateness is allowed, so it does not need to be on top." Label the star hint "For the stars (optional):" and give a concrete CPU action, for example "Fewer idle wake-ups use less CPU: check the delays of the tasks you did not change."

### L3-8 (low, owner: theory, effort M)
- where: SVG diagrams (`delayDia`, `driftDia`, `untilDia`, `jitterDia`, `overDia`) and `realCode`.
- problem: Bar colours (`c`, `d`, `a`, `g`, `r`) are never given a legend in the manual, so the meaning of the colours is learnt by guessing; some bars have no text label, so colour is the only signal (visual check needed). Annotation text is placed in the diagram in long lines, which can shrink to a hard-to-read size on a narrow panel (visual check needed). `realCode` has very long lines (comments after code of more than 100 characters) that force horizontal scrolling.
- principle: Signalling; a consistent visual vocabulary; colour never the only signal; text line length.
- change: Add a one-line legend to the first diagram of the lesson ("blue = task working, grey = sleeping, green = wake-up, red = overrun" using the actual colours), label every bar type with text, move the explanatory sentences from inside the SVG into the figure caption, and wrap comments in `realCode` above the line they describe.

---

## Visual pass

Scope: the six lesson 3 screenshots in `reviews/shots/` (1440 x 900 stills, taken after the latest content edits). Not judged: animation, sound, timing, and the phone layout (no lesson 3 phone shot exists; `game-phone.png` is a game-level screen).

### Verdict
The screen has a clear hierarchy: the orange FLASH & RUN button and the red/green objective rows draw the eye first, and the manual is readable. The weak points are visual: the objectives list is cut off by the chart panel, the stage's core idea (a fixed 20 ms grid) is not drawn on the chart, and two manual diagrams clip their own labels. The reference-solution dialog shows a CPU figure that disagrees with the HUD behind it.

### Keep
- Red cross plus orange text plus a "worst drift 1197 ms" sub-line on failing objectives (`lesson-3-fail.png`): pass and fail differ by symbol and colour, and the number is next to the objective.
- Task colours are consistent between code panel names, chart rows and the 3D labels (`lesson-3-briefing.png`).
- Manual section headings and body text have good size and contrast (`lesson-3-manual-0.png`), and the first diagram has direct labels with a visible "period 25 ms, not 20" caption.

### Findings

#### L3-V1 (high, owner: ui, effort S)
- where: `lesson-3-briefing.png` and `lesson-3-fail.png`, right panel "OBJECTIVES" at y 450 to 485: the last visible row ("Efficient: CPU load at most 85%") is cut in half, and in the fail shot "Still working from stage 1: BEACON every 500 ms and HEART every 200" is cut mid-sentence. At least two rows (the optional star goals) are not visible at all.
- problem: The player cannot see all of the goals, and nothing shows that the list scrolls. The star targets, the mastery reward, are hidden. A first-time player will think there are five objectives.
- principle: Goals clear before play; visibility of progress and mastery; signalling (nothing may look finished when it is cut off).
- change: Let the objectives panel use the height it needs (reduce the chart panel height or the mission-control box) or give it a visible scrollbar plus a fade at the bottom edge. Alternatively fold the four regression objectives into one line "Earlier stages still pass 4/4" that expands on click; this frees three rows for the new objectives and the stars.

#### L3-V2 (high, owner: ui, effort M)
- where: `lesson-3-fail.png`, chart panel (y 570 to 765) and objectives "Spectrometer: sample k starts within 25 ms of k x 20 ms (no drift)".
- problem: The lesson is about start times against a fixed 20 ms grid, but the chart shows the spectro row as a dense strip of cyan bars that looks the same in the failing run (`lesson-3-fail.png`) as in the solved run behind the dialog (`lesson-3-solved.png`). Drift is only readable as text ("worst drift 1197 ms"). The learner cannot see the failure, so the "diagnose" step of the loop has nothing to look at in the main view. In `lesson-3-briefing.png` the chart already shows data while the HUD says T+0000 ms and all objectives are unchecked, which makes it unclear whether the chart is a result or a leftover.
- principle: Productive failure needs an interpretable failure; signalling; spatial contiguity (evidence should sit where the player looks); clear run state.
- change: When the objective is selected or failing, draw faint amber tick marks at k x 20 ms on the spectro row (the same amber as the manual diagrams), and mark the worst-drift start with a small label. Show an empty chart with the text "Press FLASH & RUN" before the first run, and grey the chart out when the code has changed since the last run.

#### L3-V3 (medium, owner: ui, effort S)
- where: `lesson-3-fail.png`, mission-control box (y 256 to 467) compared with `lesson-3-briefing.png` (y 325 to 467).
- problem: The reaction box grows to six lines of 18 px text and moves upward over the rover and the HEART/BEACON labels, so the 3D scene, where the player sees the result of the code, is half hidden by text. The text is also far from the failing objective it explains (top right) and from the code (left). The briefing box already covers the lower half of the rover.
- principle: Coherence (text should not compete with the scene); split attention; segmenting.
- change: Cap the box at three lines with a "more" control, or dock it at the bottom of the scene with a fixed height so it never covers the rover. Put the first sentence (what you see) in the box and move the cause sentence to the hint button.

#### L3-V4 (medium, owner: theory, effort S)
- where: `lesson-3-manual-2.png`, diagram under section 3: the label "last (mar" is overprinted by the "last=0" chip, "sleeps 12" is followed by a cut-off "slee", and the caption line "On every call the kernel does: last += 20; sleep until tick "last". The work time never enter" is cut at the right edge of the figure. `lesson-3-manual-4.png`: the caption lines are long monospace sentences inside the SVG that nearly touch the edges.
- problem: The key diagram of the stage, the one that shows the fix, has clipped and overlapping labels, so the fixed-mark idea is partly unreadable exactly where it matters.
- principle: Readability and spatial contiguity; one message per diagram, with the caption outside the drawing.
- change: Widen the SVG viewBox or shorten the third lap so no bar crosses the right border; move the "last (mark)" label above the chips or shorten it to "last"; take the two caption sentences out of the SVG and set them as normal text under the figure (proportional font, wraps).

#### L3-V5 (medium, owner: ui, effort S)
- where: `lesson-3-solved.png`: HUD top bar behind the dialog says "CPU 100%" with a red bar, the dialog card says "81% CPU LOAD". The closing prediction ("Predict first, then set the spectro priority to 3 and flash...") is the same small grey text as the stars note.
- problem: Two different CPU numbers on one screen look like an error (the HUD value is probably the last frame or the post-run state; the learner cannot tell). The one piece of text that asks the learner to do something is visually the weakest line of the dialog, below the table, and the celebration (three stars) is much larger than the next action.
- principle: Consistency (one number, one meaning); signalling for the next action; feedback that says what to look at next.
- change: Make the HUD show the same measured value as the result card, or label the card "average over the 3 s test". Set the prediction as a highlighted "Try next" block with an accent border above the buttons, and keep the quote shorter so the table and the task fit without the eye travelling.

#### L3-V6 (low, owner: ui, effort S)
- where: `lesson-3-manual-0.png`, `-2.png`, `-4.png`: the section tab chips wrap into three rows (about 100 px of the 800 px dialog), and section headings are rendered in capitals ("1. VTASKDELAY COUNTS FROM NOW", "3. XTASKDELAYUNTIL: COUNT FROM A FIXED MARK").
- problem: The tab rows push the text down on every screen, and the long labels with "(prerequisite)" and "(after you pass)" make the navigation itself a reading task. Capitals destroy the camel-case of vTaskDelay and xTaskDelayUntil, so the learner sees VTASKDELAY and cannot tell it from the real, case-sensitive identifier that they type in the editor.
- principle: Segmenting with low navigation cost; text and code clearly distinct; transfer (code names must look like the real names).
- change: Use short chip labels (numbers plus one or two words) and put the "(after you pass)" marking as a small badge or a divider before sections 5 to 7. Turn off `text-transform: uppercase` for headings that contain an identifier, or wrap the identifier in a code span that keeps its case.
