# Agent team and model routing

The goal is to spend strong-model tokens only where they change the outcome. Correctness is carried by the deterministic verifier and a sourced fact check, not by model strength.

| Work | Model | Why |
|---|---|---|
| Stage design with simulator-measured numbers | Sonnet | needs judgement, but every number is checked by running code |
| Lesson code against a written contract | Sonnet | pattern-following with a tight test loop |
| Theory, diagrams, widgets, example code | Sonnet | long, structured writing; facts checked afterwards |
| Dialogue, hints, short copy | Haiku | small, well-specified, low risk |
| Running the verifier and greps | Haiku | mechanical; output is quoted, not interpreted |
| Fact check against documentation | Sonnet | must read sources carefully; read-only |
| Learning-design review (game and each lesson) | Sonnet | judgement against named principles; read-only, proposals only |
| Repair rounds 1 and 2 | Sonnet | most failures are local |
| Repair round 3, or a new simulator | Opus | only after cheap attempts fail, or for genuinely new engine design |
| Orchestration | Sonnet session or the workflow script | control flow is deterministic; no reasoning needed |

## Tactics that save tokens without losing accuracy
- **Files are the hand-off.** The designer writes a spec file; other agents get its path. Agents reply with paths and a few lines, never with file contents.
- **Narrow reading lists.** Each agent definition names the two or three files it must read. Everything else is off limits unless a test fails.
- **Split by file so work runs in parallel**: lesson code, theory and copy live in separate files, so three agents never touch the same one.
- **Tests instead of reviews.** A model re-reading code to "check it" is expensive and unreliable. A simulator run is neither.
- **Wrong answers as tests.** Declaring the mistakes a learner will make, and proving each one fails, catches loose objectives that no reviewer would notice.
- **Staged escalation.** Two cheap repair rounds, then one strong one, then stop and ask. Never loop without a bound.
- **Re-check only what changed.** After a code-only fix, re-run the verifier but not the fact check.
- **Mark uncertainty at the source.** Writers tag unsure facts (`VERIFY:`) so the checker spends effort where it is needed.
- **Do not generate what can be extracted.** Move existing code with a script instead of having a model retype it.

## When not to use the cheap path
- A new op, object type or simulator: design it in the main session with the user, with the strongest model available, because every later stage depends on it.
- A verifier that seems wrong: stop. A cheap agent must never "fix" the test.

## The review loop is bounded on purpose
A reviewer always finds something. Apply high and medium findings once, verify, and stop. Low-severity findings are reported to the user, not applied automatically. Game-level findings that touch the game loop, layout or styles go to the main session, because every lesson depends on them.
