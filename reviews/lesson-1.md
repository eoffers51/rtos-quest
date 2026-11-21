# Review: Lesson 1, First Light

## Verdict
The core of the stage is strong: the learner meets a broken super loop first, the watchdog crash is interpretable, and the SOLVE button explains instead of skipping. The weak points are the amount and order of theory (a first-hour learner is offered eight dense sections with kernel internals), a hint ladder that starts at the near-answer, and a check-question set that mostly tests recall with a guessable answer pattern. Fix the load, the ladder and the questions and this stage is a good onboarding. Visual points marked "needs a visual check" could not be judged from markup alone.

## Keep
- Broken-first start (super loop, watchdog at 600 ms) and the specific watchdog reaction that points at the empty IDLE row.
- `check` shows measured intervals ("intervals seen: 700 ms"): feedback about the cause, not just red/green.
- SOLVE explains the design and invites the learner to change numbers and break it again.
- Declared simplifications (1 ms tick, 600 ms watchdog) in the manual, and the "what a correct chart looks like" paragraph.
- Chart legend is coded by shape (solid, faded, dotted, outline), not by colour alone.

## Findings (severity order)

### L1-1 high, owner theory: too much theory for stage 1, with kernel internals
Where: `first-light.content.js`, sections 1, 3, 5, 6 and the `createTask` and `ladder` diagrams (TCB, ready lists, delayed list, TWDT, core affinity, `esp_timer at 22`, priority 24, `CONFIG_ESP_MAIN_TASK_STACK_SIZE`).
Problem: A beginner sees about a dozen new terms before the first run. Only three ideas are needed here: a task, the Blocked state, the idle task.
Principle: One new concept per step; intrinsic and extraneous cognitive load; no unexplained jargon in the first two stages.
Change: Keep the section order but mark each section "Core" or "Go deeper" and collapse the deeper bullets. Move to a collapsed "Go deeper" block: core affinity and handle uses (section 3), the rounding trap and precision (section 5), TWDT config names (section 6), `esp_timer at 22` and "priority 24" (ladder). Simplify the ladder to three rungs: "Interrupts", "Your tasks (priority 1)", "Idle (priority 0)".
Effort: M

### L1-2 high, owner copy: hint ladder starts at the near-answer
Where: `hints[0]` "esp_rom_delay_us() is a busy-wait: it keeps the task Running... vTaskDelay() puts the task in the Blocked state instead."
Problem: The first hint already names the fix. There is no nudge level, so a learner who asks once gets the answer to the first objective without reasoning.
Principle: Scaffolding as a ladder from nudge to near-answer.
Change: Insert a new first hint: "Open the timing chart. Which row is full, and which row is empty? What would the empty one need in order to run?" Keep the current hint 1 as the second. Hint 2 ("Press + TASK...") is fine as the third. Add the target to the star hint: "...aim for 1024 bytes or less per task" (state the actual threshold of `B(5, 2048)` so the star is a known goal; check it matches).
Effort: S

### L1-3 medium, owner theory: quiz is recall-heavy and the correct answer is nearly always option 2
Where: `quiz` array: `a` values 1,1,0,1,2,1,1; Q1, Q3, Q4 ask for names or facts.
Problem: A learner can guess "the middle option" and pass; most questions ask what something is rather than what happens. Q5 asks about 100 Hz rounding, which the game never exercises (it runs at 1 ms ticks), so it tests a side fact. Section 8 has no question.
Principle: Retrieval practice with Bloom apply and analyse questions; constructive alignment with the activity.
Change: Shuffle correct positions (0,2,1,1,0,2,1). Replace Q4 with a consequence question: "BEACON's task calls `vTaskDelay(500)` and nothing else is running. What does the IDLE row look like?" Replace Q1 with: "You delete the `vTaskDelay` call from `heart_task`. Which symptom do you expect first?" (watchdog naming IDLE0). Keep Q5 but label it "On real hardware at default settings" so the gap is explicit. Add a section-8 question about passing a pointer to an `app_main` local.
Effort: S

### L1-4 medium, owner theory: chart-reading guide comes last but is needed first
Where: section 7 "Reading the task timing chart" (7th of 8); briefing says "watch what happens".
Problem: The core loop is flash, observe the chart, diagnose. The learner must interpret the chart on the first run, but the legend and the "correct chart" description are at the bottom of the manual.
Principle: Pre-training (Mayer): key terms and the tool come before the explanation that uses them.
Change: Move section 7 to second place (after section 1), or show a three-line legend permanently next to the chart ("solid = running, dotted = blocked, empty IDLE row = starved"). Needs a visual check whether the chart already has such a legend.
Effort: S

### L1-5 medium, owner copy: terms used before they are defined, and the briefing delays play
Where: `briefing` ("super loop", "app_main() at the top creates the tasks"), `reactions.watchdog` ("idle task starved", "Blocked").
Problem: The first run is explained with words the learner has not met. Four briefing paragraphs precede the first action, and the objective is in the third.
Principle: Prior knowledge; pre-training of key terms; narrative must not delay the task.
Change: Briefing line 4 becomes: "The last engineer left one endless loop that does everything in turn (a 'super loop'). Flash it once and watch the chart. Then fix it." Watchdog reaction: add short glosses: "...the idle task (the task that runs when nothing else wants the CPU) never got a turn..." and "Blocked means asleep and costing no CPU". Cut line 1 to one sentence and merge lines 2 and 3.
Effort: S

### L1-6 medium, owner copy: failure feedback is generic for several wrong paths
Where: `diagnose`: returns `rhythm` or the generic `fail` ("Not there yet. Compare the logic analyzer with the objectives...").
Problem: Wrong answers such as swapped periods, correct rhythms with a busy task still above 50% CPU, or an undersized stack get no cause-specific message beyond a crash line.
Principle: Feedback is specific, about the cause, and says what to look at next.
Change: Add cases: periods swapped ("BEACON should be the slow one: 500 ms. Check which task gets which number."); rhythms right but CPU over 50% ("The lights are right, but the CPU is still busy. Which task has no vTaskDelay?"); stack crash ("A task ran out of stack. Look at the serial monitor, then raise the size in that xTaskCreate line"). Do not change `check`; only extend `diagnose` presentation.
Effort: M

### L1-7 low, owner theory: delay timing diagram misleads on two points
Where: `delayTiming`: tick marks every 20 ms; label "Running: the CPU sleeps here" on the idle row; `ladder` label "starved for 5 s? task_wdt fires" versus 600 ms in game.
Problem: Ticks are 1 ms in the game but drawn every 20 ms; "Running" and "sleeps" in one label sends mixed signals; the 5 s in the diagram differs from what the learner sees at 600 ms.
Principle: Coherence; one message per diagram, stated in the caption; simplifications declared where they are seen.
Change: Add to the caption: "Tick marks are not to scale: the real tick is 1 ms here." Relabel idle bar: "Idle task runs: nothing else is ready". Ladder note: "starved too long (5 s on a default chip, 600 ms in this game)". Needs a visual check for density at phone width.
Effort: S

### L1-8 low, owner copy: pass message has no takeaway or bridge to hardware
Where: `reactions.pass`: "That is how firmware should look. Nice work, engineer."
Problem: Confirms success but not why it worked or what carries over; the stack value in the game (1024) and the manual code (2048) differ without comment.
Principle: Transfer; feedback says what to look at next.
Change: "Both lights steady, CPU asleep: each task blocks, so the idle task gets the core. On a real board the same code runs with a 10 ms tick unless you set CONFIG_FREERTOS_HZ to 1000. Next: more tasks than the CPU can serve at once." In `realCode`, add a comment on the `2048` line: "(the game accepts less; 2048 leaves room for ESP_LOGx)".
Effort: S

---

# Visual pass

Based only on the screenshots in `reviews/shots/` (1440 x 900 stills plus the 400 px phone still). Animation, sound and timing cannot be judged from stills. The text-level findings above are not repeated.

## Verdict
The look is coherent and the next action (orange FLASH & RUN) is the strongest element on screen, and pass and fail are told apart by shape (X and tick), not only colour. The weakest points are that code lines are clipped at the right edge of the editor (including the comments that explain the busy-wait), that the failure evidence is small and unmarked, and that the phone layout pushes the objectives and the Flash button far below the 3D view. The result screen sends a mixed message about stars.

## Keep
- Orange primary button, cyan accents, one dark panel style across editor, objectives, chart and manual.
- X / tick / hollow-circle objective states (`lesson-1-fail.png`, `lesson-1-solved.png`).
- Booth-style world labels "BEACON GPIO 2" and "HEART GPIO 4" tied to the rover parts with leader lines.

## Visual findings

### L1-V1 high, owner ui: code lines are clipped at the right edge of the editor
Where: `lesson-1-briefing.png`, left panel: the startup comment "// tasks: function, name, stack (bytes), ha" and the xTaskCreate line end in "NU" and "1 , N"; the task lines end in "!gpio_get_level(BEACON_GPIO)" cut off, and "// busy-wait: spins the CPU" is cut after "CPU". The same cut happens in `lesson-1-solved.png`. `game-phone.png` shows the same clipping at "GPIO_MODE_IN".
Problem: The learner cannot read the end of the line that holds the key clue (the busy-wait comment) or the closing arguments of xTaskCreate, and nothing shows that the line scrolls sideways. It looks like a bug.
Principle: Readability (no truncated text); signalling (the clue must be visible); split attention.
Change: Let each code row wrap (or put long comments on their own line above the call) instead of clipping. If horizontal scroll stays, show a visible scroll bar and a fade at the edge. Widen the editor column a little: `lesson-1-briefing.png` has about 90 px of unused space between the editor and the scene at the bottom and a large empty block under the code.
Effort: M

### L1-V2 high, owner ui: the failure evidence is small and the empty IDLE row is not marked
Where: `lesson-1-fail.png`, bottom panel: the red watchdog message in the serial monitor (about 11 px, pink on near-black, only two lines) and the chart rows `IDLE task` and `faults` (a tiny red triangle at about 600 ms). The mission-control dialogue is the biggest text and says "Swap the busy-waits".
Problem: The eye lands on the dialogue and the red CPU 100% bar, not on the cause. The learner is told the answer in words, while the chart that proves it (empty IDLE row while mainLoop is solid cyan) has no marker. Also the chart stops at 600 ms and the rest of the grid is blank, with no sign that the run ended there.
Principle: Signalling; spatial contiguity (the explanation should sit next to the event); productive failure needs an interpretable failure.
Change: On a watchdog fault draw a short label on the IDLE row, for example "IDLE never ran" in the fault colour, and a vertical band at the fault time labelled "watchdog reset". Raise the serial monitor text to the same size as the chart labels and make the first line of the failure message bold. Grey out the unused part of the chart after the run ends.
Effort: M

### L1-V3 medium, owner ui: result screen mixes celebration with "no stars", and the optional goals look unfinished
Where: `lesson-1-solved.png`: three large gold stars above "Stars are not saved for the reference solution"; behind the dialog the "Efficient" and "Lean" objectives show as blurred amber blobs without a tick, while the top bar stars are still hollow.
Problem: Three bright stars suggest an award that the text then withdraws. The blurred optional objectives cannot be read as met or not met. The dialog is a block of centred small text, with the next-stage button as the strongest element even though the text asks the learner to go back and change the code.
Principle: Feedback clarity; pass and fail distinguishable; celebrate real mastery only.
Change: For the reference solution show the stars as outlined and greyed with the caption "Reference solution: no stars", and show the stage title as "REFERENCE SOLUTION" with a distinct "viewing" badge. Give optional objectives a tick when met and a clear hollow ring when not, in the same size as the required ones. Make "BACK TO THE CODE" the primary button in this state and left-align the explanation text in two short paragraphs.
Effort: S

### L1-V4 medium, owner ui: phone layout puts the goal and the Flash button far below the fold
Where: `game-phone.png` (400 px): the 3D scene takes the top 380 px, then a four-row HUD (title, CPU, stars and BUILD LOG, FIELD MANUAL and SOUND), then the editor starting at about y=560, clipped on the right. The objectives, FLASH & RUN and the chart are not visible in the first screen of 860 px (what is below is not in the still).
Problem: The first screen shows scenery and menu buttons, not the task. A learner has to scroll to find what to do and then scroll back to see the result of a run, which breaks the edit, run, observe loop.
Principle: Hierarchy (the next action is the most prominent); contiguity of controls and what they affect.
Change: Shrink the scene to about 220 px on narrow screens, merge the HUD into two rows (title and CPU on one; icon-only buttons on the other), and pin a bottom bar with FLASH & RUN and a one-line objective counter (for example "2 / 4 goals") so the run button is always reachable. Collapse the objectives into a tap-to-open strip.
Effort: L

### L1-V5 medium, owner theory: state colours differ between chart, diagrams and widgets, and disabled choices are hard to read
Where: `lesson-1-briefing.png` legend (Running = cyan, Ready = grey-blue, Blocked = dotted) against `lesson-1-manual-4.png` (Running = green outline, Ready = orange, Blocked = brown) and `lesson-1-manual-2.png` (running tasks green, idle task grey, spinning = red). In `lesson-1-manual-4.png` the greyed-out buttons ("Task calls vTaskDelay(500)", "Tick: the delay has expired") are very low contrast.
Problem: The learner learns "Running is cyan" from the chart, then meets "Running is green" in the manual. Colour is the only difference between some states in the diagram, and the disabled choices are hard to read at all.
Principle: Consistent visual vocabulary; coherence; contrast (WCAG 4.5:1 for text).
Change: Use the chart's state colours (and dash style) in every diagram and widget: Running cyan, Ready blue-grey, Blocked dotted outline. Keep orange only for "current selection". Raise disabled button text to at least 4.5:1 and keep the disabled look only through a dashed border.
Effort: M

### L1-V6 low, owner ui: panels crowd the rover and the manual is a small window onto long content
Where: `lesson-1-briefing.png`: the objectives panel covers the right side of the rover and the HEART label sits on the rover body at the panel edge; the mission dialogue covers the bottom-left of the scene. `lesson-1-manual-0.png` and `-4.png`: nine tiny two-line section chips with "(Core)" and "(Go deeper)" in each, no highlight for the open section, and the check question cut off at the bottom edge of the dialog; diagram labels such as "power on / reset" float away from the arrow they describe.
Problem: The thing that blinks (the LED on the rover) is partly hidden by HUD panels, and in the manual the learner cannot tell where they are or how much is left.
Principle: Coherence; signalling; spatial contiguity.
Change: Offset the camera so the rover sits in the free centre between the editor and the objectives panel. In the manual highlight the open chip, number the chips with a progress marker, and move the Core and Go deeper tag to a small dot or icon; move "power on / reset" next to the first arrow.
Effort: M
