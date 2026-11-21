# Lesson design

## Shape of one stage
1. **Briefing** (three or four lines from a mission-control voice): what was added to the device, what must work, "flash it before you change it".
2. **First run fails** visibly: the device misbehaves, the chart shows why, the serial monitor prints the real message.
3. **The learner edits** real API calls. Reactions after each failed run name what the chart shows and point toward the cause without giving the answer.
4. **Pass**: one star. The result screen shows the metrics and what the other two stars need.
5. **Field manual** available throughout, with a progress counter for its check questions.
6. **SOLVE** loads the reference solution and runs it, without awarding stars.

## Designing the puzzle
- Start from a real failure you have seen or that the platform documents. Work backwards to the smallest program that shows it.
- The starting code must look reasonable. "Another team delivered this" explains why it is there.
- Aim for one concept per stage. If the fix needs two new ideas, split the stage.
- Write at least four wrong answers a learner will actually try. Each must fail an objective or crash, and each needs a reaction. If a wrong answer passes, the objectives are too loose.
- Keep one objective per earlier subsystem as a regression check. Breaking old behaviour while adding new is the most realistic bug there is.
- Set thresholds from simulator measurements with margin. Never from mental arithmetic.

## Journey
- Stage 1 is a bench dummy with the least hardware that shows life (an LED). The last stage is a production review: return values checked, watchdog fed deliberately, stack and heap margins measured, diagnostics kept in.
- Each stage's "device gains" is something visible in the world; each "you learn" is one mechanism.
- The firmware that passed a stage is the next stage's starting code. If the learner used SOLVE, hand over the reference instead.

## Theory sections
A section answers, in order: what problem does this mechanism solve, how does it work inside (data structures, who runs when), what does the platform do specifically (defaults, option names, units, limits), what goes wrong.
- Diagrams: boot flows, state machines, memory layouts, timing diagrams, priority or bus diagrams. Draw them with the diagram kit so they stay in the visual system.
- Widgets: the reader changes an input and the consequence updates. Good kinds: a state machine driven by events, a calculator with a trap value, a "create until it fails" resource builder, a live mini-simulation driven by the game's own simulator, a step-through sequence player.
- Check questions: one per section, three options, about a consequence ("what happens if..."). The explanation shown after a right answer adds something the section did not say outright.
- End with a complete example file in the real framework, and a pitfalls list phrased as symptom then cause.

## Accuracy
- Every default value, signature, option name and error string is checked against primary documentation by a separate fact-check pass.
- State where the simulation differs from hardware (tick rate, instantaneous instructions, simplified drivers).
- Error messages are quoted in the form the real toolchain prints them.

## Evidence must be readable by a person
A chart that is technically correct but looks like a solid band teaches nothing. Treat readability as a testable property, not a matter of taste:
- Define a measure (here: state changes per 100 px in the busiest row) and a limit, and compute it in the verifier for the starting code and the solution.
- Let the game choose the default zoom from the same measure, so what the verifier checked is what the learner sees first.
- Size each test so the failure fits in one visible window; long tests only for sparse activity.
- Mark the evidence: bracket the stretch an unmet objective refers to, label it with the measured value, and scroll to it after a failed run.
- Confirm with a screenshot after a failed run. Numbers can pass while labels overlap.
