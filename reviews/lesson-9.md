# Review: lesson 9, Fold the Antenna

Scope: `src/lessons/fold-the-antenna.js`, `.content.js`, `.copy.js`, and the six screenshots `lesson-9-*.png` in `reviews/shots/`. Screenshots are still frames at 1440 x 900. I cannot judge animation, sound or timing, and the 400 px layout is not part of this scope.

## Verdict
The stage teaches one clear idea well (a delay is not a timeout, a reset-able one-shot timer is) and its failure is interpretable: the numeric evidence "packet delays 29, 10, 194, 377 ms" is specific and the reactions are accurate. The weak points are that the manual hands over the complete answer before the mission, so the mission is a one-line swap, that the screen does not show the failing evidence, and that the stage carries more concepts than the mission exercises. Two manual diagrams also have clipped or colliding labels.

## Keep
- The broken-first design with a realistic failure: the start firmware sleeps in `vTaskDelay(250)`, and the objective line shows the delays as numbers ("packet delays 29, 10, 194, 377 ms (-1 = never)", `lesson-9-fail.png`).
- Objective status uses a check and a cross as well as colour (`lesson-9-fail.png`), so pass and fail are readable without colour.
- The wrong-answer set: each plausible mistake (period 50, 150, 260, auto-reload, reset in the ISR, blocking callback) has its own reaction, and the solution note ends with two experiments (period 150 and 260, then auto-reload) that teach.
- Sections 6 and 7 are gated "after you pass" (fading, and they avoid load before the mission). The manual declares that the simulator does not model the shared service task.
- The restartable-timeout diagram (section 3, `lesson-9-manual-2.png`) has one message, a caption that states it, and the dotted cyan blocked-on-time style that matches the chart legend.

## Findings

### L9-1 (high, owner ui) The failed evidence is not on screen after FLASH
- where: `lesson-9-fail.png`, chart panel; `evidence` in `fold-the-antenna.js` (a bracket on the `antenna` row from the packet at 500 ms).
- problem: After flashing the start code the chart is showing the last ~120 ms of the run (about 880 to 1000 ms) and only the lower rows (radio to HEART). The packet that waited 194 ms is at 500 ms, so the learner sees no bracket and no label. What they see are two thin solid red lines on the `bumper` and `antenna` rows (both are just waiting on an object) and a single marker on `onPacket`. The briefing says "read the chart before you change anything", but the part of the chart that answers the question is off screen.
- principle: Feedback must be where the learner is looking (spatial contiguity, signalling); a failure must be interpretable.
- change: On a failed run, scroll the chart to the first evidence bracket (centre it with a small margin, switch the zoom so the whole interval fits) and scroll the row list so the evidence row (`antenna`) and `onPacket` sit together, with the label text "packet at 500 ms waited 194 ms: antenna was asleep, not at xQueueReceive" drawn next to the bracket. Leave the current numbers in the objectives panel.
- effort: M

### L9-2 (high, owner theory) The manual gives away the whole answer before the mission, which then becomes a one-line swap
- where: `fold-the-antenna.content.js`, section 3 code block ("xQueueReceive ... deploy_antenna(); xTimerReset(stow_tmr, 0); handle_packet(&pkt);") and section 1 bullet ("the packets at 500 ms and 580 ms wait 194 ms and 377 ms"); the start code only needs `d(250)` and `stowAntenna` replaced by one `xTimerReset`, because `stow_tmr` is already created with period 200 and `onStow` already exists.
- problem: The learner reads the exact corrected task, in the right order, then reproduces it. The measured failure numbers are also stated in section 1, so the fail screen confirms what the text already said. The mission then checks recall of a snippet, not the ability to design a timeout (apply and analyse).
- principle: Productive failure; worked example then completion problem, with fading (not a finished example then a copy). Constructive alignment: the activity should demand the skill the objectives name.
- change: Keep section 3 but make its code block a different instance of the pattern (for example a display backlight: `xQueueReceive(key_q, ...); xTimerReset(backlight_tmr, 0);` with a 10 s period), and leave the antenna order (reset after receive, before handling) to the hint ladder. In section 1 replace the two measured numbers with a general statement ("a packet that arrives while the task sleeps waits for the rest of the sleep") and let the fail screen supply 194 and 377. Keep the full antenna code in the "Complete ESP-IDF example", which is read after the mission.
- effort: S

### L9-3 (medium, owner copy) The objectives panel hides most objectives, and "pass" is never defined
- where: `lesson-9-briefing.png` and `lesson-9-fail.png`, objectives panel (about 3.5 of 10 lines visible; the "Mast" line is cut mid-sentence, and the 6 "Still working from..." lines are below the fold); `goals` and `briefing` in the source.
- problem: Ten objectives are listed, and only the first three or four are visible without scrolling, with no scroll cue. The third (the mast) is visible only half. Four of the ten are regression lines that the learner has seen before. The new objectives use the words "pass" and "the last packet of each pass", but the briefing only says "a ground-station pass starts" and never says how packets map to a pass (the evidence code uses a gap of more than 150 ms; the manual says the gaps inside a pass are 80 ms). "(2 unfolds)" is also unexplained.
- principle: Extraneous load and signalling: the new goals should be the most prominent. Prior knowledge: define terms before using them.
- change: (ui) Collapse the "Still working from stage N" lines into one row, "Earlier stages (6 checks): all still pass", expandable, with a failing regression expanded automatically. (copy) Add to briefing paragraph 3: "A pass is a burst of packets less than 150 ms apart; a packet with a longer gap starts the next pass. Today's test has two passes." Reword the mast goal: "Mast: unfolds once per pass and stays out until the pass ends (2 unfolds in total)".
- effort: S

### L9-4 (medium, owner theory) Too many ideas sit between the learner and the mission
- where: manual sections 2 to 5 (`fold-the-antenna.content.js`): the five-argument `xTimerCreate` signature, one-shot vs auto-reload, the five control calls, the tick rate, the service task, four `CONFIG_FREERTOS_TIMER_*` names in one bullet, callback rules and the ISR variant.
- problem: The mission needs one idea (a timer is a restartable timeout). Sections 4 and 5 (service task, callback rules, `xTimerResetFromISR`) are dense bullet lists of five items each, and the simulator cannot show the main consequence of section 4 (a slow callback delaying another one; the text admits this). The learner has 4 checks of recall before they can try anything, and the manual has 7 sections plus the example.
- principle: One new concept per step; segmenting and pre-training; intrinsic versus extraneous load.
- change: Required before the mission: sections 1 to 3 only, with section 2 cut to the object, the dormant start and one-shot vs auto-reload (move the control-call list and the tick-rate remark to the code example). Mark sections 4 and 5 "after you pass" like 6 and 7, but keep the crash experiments in the solution note ("put `vTaskDelay(10)` in `onStow` and read the message") so they are met in the game first. Move the four `CONFIG_` names into one table in the ESP-IDF example.
- effort: M

### L9-5 (medium, owner theory) Two diagrams have clipped or colliding labels
- where: `lesson-9-manual-0.png`, first diagram: the red caption "packet 500 waits 173 ms; packet 580 waits 346 ms (idealised: the game measured 194 and 377)" runs off the right edge ("(idealised..." is cut at "(ideal"); the two red "waiting" bars overlap each other. `lesson-9-manual-4.png`, callback diagram: the "give" label is crossed by the dotted line, "read sensor: 40 ms, in a task of your choice" is jammed against "short callback", and "next timer on time" floats with no marker of what it points to.
- problem: The learner must decode overlapping text. The first diagram also shows 173 and 346 where the game shows 194 and 377, and the caption half-explains the difference. Two sets of numbers for one fact is split attention.
- principle: Coherence and spatial contiguity; one message per diagram; readable text.
- change: Section 1 diagram: use the game's real numbers (194 and 377), drop the "idealised" remark, stack the two waiting bars on separate lines, shorten the label to "packet 500 waits 194 ms, packet 580 waits 377 ms" and anchor it at the left. Callback diagram: give each of the three rows (long callback, short callback, worker task) its own band with 12 px spacing, move "give" above the dotted line start, and state the message in the caption: "A long callback makes the next timer late; a short one hands the work to a task".
- effort: S

### L9-6 (medium, owner copy) The hint ladder skips the last rung, and the first fail reaction states the cause and the fix
- where: `fold-the-antenna.copy.js`, `reactions.blocked` ("The antenna task is asleep in vTaskDelay, so it cannot read the next packet. The delay is the problem, not the queue.") and `hints`.
- problem: The learner who flashes the start code is told the cause at once, before they have tried to read the chart, which removes the diagnose step of the loop. The four hints then go: observe, design idea ("a timeout that starts after each packet"), mechanism question, and a star hint. There is no near-answer rung (which call, where in the task), so a stuck learner has no step between hint 3 and "SHOW SOLUTION". Hint 4 is a different topic (stars), not a step up.
- principle: Scaffolding as a ladder from nudge to near-answer; feedback that points to what to look at next rather than only restating the failure.
- change: Reaction `blocked`: "Packets 3 and 4 waited 194 and 377 ms in rx_q. Look at the antenna row: what is the task doing while those packets wait?" Keep the cause for a second occurrence. Hints: 1 "Flash it and read the chart. Which task row is idle while a packet waits in the queue, and what was it blocked on?" 2 (as now) "The antenna task should never sleep..." 3 (as now) "...reset the timer each time a packet arrives?" 4 new: "Replace the `vTaskDelay` and the direct `stowAntenna` call with one `xTimerReset(stow_tmr, ...)` right after the receive, and let `onStow` do the stow." 5 (the current hint 4, labelled "For the stars").
- effort: S

### L9-7 (medium, owner ui) The code the learner must change is below the fold, and the chart is full before any run
- where: `lesson-9-briefing.png`, firmware panel and chart. The visible code is app_main with stage 1 to 8 tasks (beacon to radio); the new `antenna` task and the `onStow` callback are further down, out of view. The chart already shows a full set of task rows (with a red-outlined bar on the `imu` and `science` rows) while the serial monitor says "Nothing yet" and the HUD says `T+0000 ms`.
- problem: The briefing says "the comms team added rx_q, onPacket, the antenna task and stow_tmr", but only `rx_q` and `stow_tmr` are visible, and the learner has to find the antenna task among 15 task lines and the units below. The pre-run chart looks like a result and is not labelled as a preview, so the learner may read it as the outcome of their code.
- principle: Signalling (mark what is new); state must be obvious (stale or preview chart versus a result).
- change: Mark the lines added in this stage with a "NEW" tag in the gutter and scroll the editor so the first one is visible, or give the panel a "jump to what changed" control. Overlay "preview: stage 8 firmware, not yet flashed" on a chart that is not from the current code, or empty it until FLASH.
- effort: M

### L9-8 (low, owner ui) The result screen shows two numbers but not the targets, and the stars measure stack sizing rather than timers
- where: `lesson-9-solved.png`: "99% CPU LOAD, WHOLE RUN" and "22976 B RAM FOR STACKS"; `bonus: B(99, 23100)` and `alts` (stack 1668, 4096, 2048 and so on) in `fold-the-antenna.js`.
- problem: The learner is not told the limits (99 % and 23100 B), so the way to earn the third star is only in hint 4. The alternative solutions show that the RAM star depends on tuning the antenna stack, which is a stage 4 skill, so the mastery target does not reward better timer design. The result screen does not mention the timer at all (stow gap, number of stows).
- principle: Goals clear before play; optional mastery targets reward better engineering of the skill taught; intrinsic integration.
- change: Under each metric print the target ("3 stars: 23100 B or less") and a one-line tick. Add a third result tile from the lesson's own evidence: "Stow 202 ms after the last packet, 2 stows" so the result screen reflects the new concept. Do not change what the simulator measures.
- effort: S
