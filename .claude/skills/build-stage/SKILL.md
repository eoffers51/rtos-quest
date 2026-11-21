---
name: build-stage
description: Build the next stage (lesson) of the RTOS Quest game with a team of specialised, cheaper-model agents and a simulator-backed verifier. Use when asked to "add stage 3", "build the next level", "continue the journey", or to repair a stage that fails tools/verify.js.
---
# Build one RTOS Quest stage

The stage to build is the first entry of `JOURNEY` in `src/lessons/index.js` that is not yet in `LESSONS`, unless the user names one. Build stages in order: each starts from the firmware of the one before.

## Why this is cheap and still correct
Correctness comes from `tools/verify.js`, not from a strong model reading the code. It runs the real kernel simulator and proves that the starting code fails, the reference solution earns three stars, and every declared wrong answer fails the way the spec says. That lets Sonnet and Haiku do the work. Opus is used only if a repair loop stalls.

| Step | Agent | Model | Writes |
|---|---|---|---|
| 1 Design | `stage-designer` | sonnet | `specs/stage-NN.md`, numbers measured on the simulator |
| 2a Theory | `theory-author` | sonnet | `<slug>.content.js` |
| 2b Dialogue | `copy-writer` | haiku | `<slug>.copy.js` |
| 3 Build | `stage-builder` | sonnet | `<slug>.js`, kernel and world additions, registration |
| 4a Verify | `stage-verifier` | haiku | nothing; runs the verifier |
| 4b Facts | `fact-checker` | sonnet | nothing; lists wrong claims with sources |
| 4c Teaching | `learning-reviewer` | sonnet | `reviews/lesson-N.md`; prioritised proposals on learning design and presentation |
| 5 Repair | builder or theory-author | sonnet, then opus on round 3 | fixes |

## Two ways to run it
- **Workflow** (when the user asks for a workflow or multi-agent run): `Workflow({ name: 'build-stage', args: { stage: N } })`.
- **By hand** with the Agent tool, following the steps below. Use this when the workflow tool is not available or the user wants to steer between steps.

## Steps
1. **Design.** Spawn `stage-designer` with the stage number. Read only its five-line summary and section 10 (open risks) of the spec. If a risk changes the puzzle, settle it with the user before building.
2. **Content.** Spawn `theory-author` and `copy-writer` in the same message so they run in parallel. They touch different files.
3. **Build.** Spawn `stage-builder`. It loops on the verifier itself.
4. **Check.** Spawn `stage-verifier`, `fact-checker` and `learning-reviewer` (scope: lesson N) in the same message.
5. **Repair.** Send verifier failures to `stage-builder` and blocking or should-fix facts to `theory-author`, quoting the lines exactly. Send the reviewer's high and medium findings to their owner once (lesson and copy to `stage-builder`, theory to `theory-author`); `ui` findings come back to you. Do not re-review after applying: one round, then verify. Re-run step 4. After two failed rounds, run the third with the stronger model. After three, stop and report what is still red.
6. **Look at it once.** Start the preview server, open the stage, flash the starting code and the solution (SOLVE button), open the field manual and click each widget. The verifier cannot see layout.
7. **Report** to the user: what the stage teaches, verifier result, facts fixed, anything unverified.

## Rules
- Hand agents the spec path, not its contents. Ask for short replies. Do not read generated files into your own context unless a check fails.
- Never accept "done" from an agent without a green `stage-verifier` run after its last edit.
- Nobody edits `tools/verify.js` or weakens an objective to pass. If the verifier itself is wrong, stop and tell the user.
- A new kernel op or object type is a design change: confirm with the user, then extend `tools/verify.js`'s op list, the editor (`src/editor.js`) and the contract together.
- If the `embedded-agents:idf-librarian` agent is available, use it to settle disputed ESP-IDF facts instead of arguing from memory.

To review and improve stages that already exist, or the game as a whole, run the `review-game` workflow: `Workflow({ name: 'review-game', args: { lessons: [1, 2, 3] } })`.

Contract details: [reference/lesson-contract.md](reference/lesson-contract.md).
