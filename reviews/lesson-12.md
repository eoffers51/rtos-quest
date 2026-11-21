# Review: lesson 12, Pathfinder (priority inversion and inheritance)

## Verdict
The stage has a strong idea (a real incident, a stall that only some exchanges show, a measured before/after) and the manual is accurate about the cost of each cure. Its weakest points are in how the learning is staged: the first failure report names the cause and the fix before the learner has diagnosed anything, the fix is a single dropdown change that stage 6 already taught, and the manual's opening diagram is partly unreadable and contradicts its own caption. Presentation problems (clipped labels, a clipped table row, hidden crowd rows in the chart) sit exactly on the evidence the stage asks the learner to read. Screenshots are still frames: animation, sound and the stepping widgets could not be judged.

## Keep
- The broken-first start (binary lock) with the stall only in some slots, and the briefing line "Flash it as it is and read the chart before you change anything".
- The measured numbers in the widgets (53 ms vs 13 ms; the 5 / 19 ms motor gaps) and the "cures" widget showing that a big priority breaks the motor.
- The wrong-answer cases and their reactions (bmTooLow, sleepsHolding, hog, forgotGive): each is a specific, cause-based message.
- Consistent state colours with the chart: red outline = blocked on a lock, cyan = running (lesson-12-manual-2.png, kindDia).
- Solution note that ends on a question ("Does the exchange stay within 30 ms with the binary lock still in place?").

## Findings

### L12-1 (high, theory) Diagram annotations are near-invisible and clipped
- where: `pathfinder.content.js` pathDia; seen in `reviews/shots/lesson-12-manual-0.png`, the first diagram.
- problem: The text labels "high waits for the lock", "medium runs: nobody needs the lock for this", "low takes the lock" and "low gives the lock; high runs, far too late" render as dark text on the dark panel and are almost unreadable (I enlarged the area to check). "low: weather data" is cut off at the left edge ("w: weather data") and the last label runs off the right edge. The diagram's own message is carried by exactly these labels. The CSS (`.dia .at`) says light fill, so verify live whether this is a capture-time effect; the clipping is real either way.
- principle: Signalling and spatial contiguity (Mayer); readability and contrast.
- change: Make sure `note()` text in these SVGs uses the light fill. Shorten row labels to fit ("high: bus", "low: weather") or move the label column right by 20 px. Keep each annotation within the 720 px width (shorten the last to "low gives lock: high runs, too late" and anchor it 'end').
- effort: S

### L12-2 (medium, theory) The opening diagram contradicts its caption
- where: pathDia, `lesson-12-manual-0.png`; caption "the low task is Ready but loses to the medium task".
- problem: The "Ready" box on the low row is drawn at 5 to 10, when nothing else is running, and there is no Ready bar for 10 to 35, when the medium task actually runs. The learner sees low idle in the wrong place and cannot see the one fact the picture is for: low is Ready and starved. A stray zero-height bar is also in the code.
- principle: Coherence; one message per diagram, and the picture must show the mechanism.
- change: Draw low as Running 0 to 10 (it holds the lock), Ready 10 to 35 (pale cyan, under the medium bar), Running 35 to 40. Start "high waits" at 5 as now. Delete the empty `bar(... 0)` call.
- effort: S

### L12-3 (high, lesson/copy) The first failure explains itself; the diagnosis is pre-empted
- where: `reactions.inversion` ("A binary semaphore has no owner ... Which object type records who holds it?") and `lesson-12-fail.png`, where the dialogue already says "weather is the task that must finish, but nothing lifts it". Start code line `bus_lock = xSemaphoreCreateBinary(); xSemaphoreGive(bus_lock)` is a dropdown with exactly two options.
- problem: After the first flash the learner is told the cause (inversion), the object (binary semaphore) and nearly the answer (a type that records the holder). The fix is one dropdown change, and stage 6 already said "use a mutex for a lock", so the learner can solve it by recall without ever interpreting the chart. The briefing asks them to read the chart first, then the reaction does the reading for them. Hints 1 to 3 repeat the same step.
- principle: Productive failure; scaffolding and fading (hints should climb from nudge to near-answer, the first reaction should be a nudge); retrieval practice (let the learner retrieve stage 6, do not tell them).
- change: Split the reaction by effort. First failure: observe only, e.g. "One exchange ended 53 ms late. In the bus_mgr row, what was it waiting for, and who had that? Check weather's row in the same window." Move the cause ("a binary semaphore has no owner") to hint 2 and the type change to hint 3. Rename the dropdown option so it does not shout the answer, or add a third distractor (e.g. a counting semaphore) so the learner has to choose. Keep `reactions.inversion` as the text for the second failed attempt.
- effort: M

### L12-4 (medium, lesson) Evidence label is cut off and the chart hides the rows the story is about
- where: `evidence` label "bus exchange 53 ms late: bus_mgr waited for bus_lock" in `lesson-12-fail.png` (chart, right of the red bracket); chart rows visible only from `radio_link` down to `IDLE task`.
- problem: The label is cut at the panel edge after "waited for", so the key word (bus_lock) is lost, and it never says who held the lock. The chart is scrolled so that camera, spectro, nav and motor, the "crowd" that the reaction and manual both name, are off-screen; the learner sees only a thin purple weather row with ticks. The three-task picture from the manual cannot be matched to the chart. The regression objectives are also cut off at the bottom of the objectives panel (`lesson-12-briefing.png`: the fifth item is clipped), so the later "hog" failure lands on an objective the learner cannot see.
- principle: Spatial contiguity; signalling; feedback must point to what to look at next.
- change: Shorten the label to "53 ms late: waiting for bus_lock (weather holds it)" and name the holder in the evidence code, as the stalled-at-end branch already does. Ask `ui` to scroll the chart so the bracket row and the higher-priority task rows it competes with are all visible, or add the line "Scroll up in the chart: camera, spectro and nav are running while weather waits" to the second reaction. Let the objectives panel scroll to the first failing item.
- effort: M

### L12-5 (medium, lesson/copy) The hand-made fix earns the same result as the lesson's idea
- where: `alts` "fix it by hand: weather at priority 2" (3 stars), and `reactions.pass`.
- problem: The manual calls this cure fragile and the objectives cannot tell it from inheritance, so a learner who bumps a priority gets three stars and a pass message that praises "you have just fixed a priority inversion". The stage concept (inheritance) can be skipped without anyone saying so.
- principle: Constructive alignment; feedback about the cause. (The simulator measurement is fine; this is about what the result says.)
- change: Add a pass variant used when `bus_lock.type !== 'mutex'`: "It works here because weather now sits at priority 2. Add another task at 2 or 3 and the stall returns. The mutex fixes it for any priority. Try it." Show it in the result screen under the stars.
- effort: S

### L12-6 (medium, theory) Sections 5 and 6 carry too many new ideas for one stage
- where: manual sections 5 and 6 (`lesson-12-manual-4.png` shows the first of five dense bullets running past the fold).
- problem: The mission needs one idea (the lock must record its owner). The manual also introduces priority ceilings, `portENTER_CRITICAL` and spinlocks, `vTaskList` and its Kconfig switches, `xSemaphoreGetMutexHolder`, timed takes, the task watchdog API, SMP behaviour and the 100 Hz default. Several are paragraph-length and forward-reference stage 13.
- principle: Cognitive load (one new concept per step); segmenting and pre-training.
- change: Keep the table, shorten each bullet to one sentence with the cost, and move critical sections, vTaskList options, the two-core caveat and the tick note into a closing "Going further" block (or the ESP-IDF example comments). Section 6 should keep: read the states, name the holder, use a timed take.
- effort: M

### L12-7 (medium, theory) The cures table overflows in its last row
- where: cureDia in `lesson-12-manual-4.png`, last row.
- problem: "critical section / disable interrupts" is cut off at the left ("ical section / disable interru..."), "blocks other tasks and most ISRs" overlaps the next cell, and "a few instructions, never a call that blocks" is clipped at the right. The row that matters (the one that is dangerous to use) is the one that cannot be read.
- principle: Readability; no overlapping or clipped labels.
- change: Use shorter cell text ("critical section", "blocks tasks and ISRs", "a few instructions only") or widen columns and use two-line boxes with `|`. This also removes the duplicate of the `cures` widget below it.
- effort: S

### L12-8 (low, theory) Check questions are easy to guess
- where: `quiz` (correct answer index 1, 1, 1, 0, 1, 0).
- problem: The correct option is usually the longest and most detailed, and sits in the second position in four of six questions. Q1 and Q3 can be answered from the section's bold phrases. No question asks the learner to predict the bmTooLow case (a mutex with bus_mgr at priority 1) or to choose between cures, which is what the mission asks.
- principle: Retrieval practice at apply/analyse level; assessment aligned with the skill.
- change: Shuffle correct positions and equalise option length. Replace Q3 with: "bus_lock is a mutex but bus_mgr runs at priority 1, the same as weather. Will the 53 ms stall go away?" (No: the holder is lifted only to the waiter's priority.) Add one cure-choice item: "weather sleeps 60 ms while holding the mutex. Which fix applies?"
- effort: S
