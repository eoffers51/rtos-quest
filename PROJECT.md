# RTOS Quest: project guide for agents

This file is for an agent (or a person directing agents) who will refactor or extend the project. It says how the parts fit, what must stay true, how to split work between agents, and which mistakes have already been made once. `CLAUDE.md` holds the short rules loaded into every session; `README.md` is for someone who wants to run the game. Read this file before any change that touches more than one stage.

## 1. What must stay true

These are the invariants. A change that breaks one is wrong even if every check is green.

1. **One journey.** Every stage starts from the player's own firmware of the stage before (`start(prev)`), adds hardware, and keeps the older behaviour as "Still working from stage N" objectives.
2. **Theory first.** Each stage is step 1 THEORY (paged manual, widgets, check questions) and step 2 MISSION. Every theory section has a diagram or a widget and a check question; every check question explains each wrong option.
3. **ESP-IDF only.** All code the player sees is ESP-IDF C (`app_main`, `xTaskCreate`, `gpio_set_level`). Never Arduino. Player-facing text never uses internal helper names (`tk()`, `gv()`, `lightSleep`): it uses the real API names.
4. **Deterministic simulator.** No `Math.random()` and no wall-clock time in `src/kernel.js` or in lesson files. The same program always gives the same run.
5. **No build step.** Plain ES modules, Three.js from a CDN import map. The project must run with `python3 tools/serve.py` and nothing else.
6. **A pass must mean the design is right, not that this run was lucky.** If a wrong design passes because nothing happened to collide, add a check for the design (see section 6). Examples already in place: lock order (stage 11), calls on a shared record without its lock (stage 13), a ready bit set before its work (stage 10), a safety stop left to a low-priority task (stage 7).
7. **Every failure is explained in three places:** mission control names the cause, the chart brackets where it happened, and the serial monitor shows the real error text.
8. **The checks are the definition of done** (section 3). Never weaken an objective, delete a wrong-answer case, or edit a check to get to green.

## 2. Architecture

```
index.html            page shell, HUD markup, import map
src/kernel.js         simulator + rover function library F          (no DOM)
src/lessons/*.js      one file set per stage                         (no DOM)
src/timeline.js       timing chart, evidence markers, readability    (canvas only in drawTimeline)
src/editor.js         firmware editor; defaultInstruction() is DOM-free
src/widgets.js        diagram kit (svg, box, arrow, note) + shared theory widgets
src/world.js          Three.js scene
src/main.js           game loop, save, theory pages, result screen
tools/verify.js       stage verifier (runs under gjs or node)
tools/diagrams.sh     diagram layout check (headless Chromium, uses tools/diagram-audit.html)
tools/shots.sh        screenshots for visual review
tools/demo-helper.js  plays a stage through the real page controls
```

Dependency direction: `kernel` ← `lessons` ← `main`; `timeline`, `editor`, `widgets` depend on `kernel` only. Nothing in `kernel.js` or a lesson file may touch the DOM, because the verifier imports them outside a browser.

### Data model

- **Program**: `{ objs: { name: {type, ...} }, units: [ {kind: 'task'|'isr'|'timer', name, prio, stack, core, code: [instruction]} ] }`. Plain JSON, saved in `localStorage` and handed from stage to stage.
- **Instruction**: `{ op, ... }`. The list of ops is `OPS` in `tools/verify.js`. Each op needs: execution in `kernel.js`, a rendering in `editor.js` (`line()`), a default in `defaultInstruction()`, and an entry in `OPS`.
- **Run result `K`** from `runSim(L, prog)`: `K.ev` (events), `K.w` (world facts: starts and ends of rover functions, lock order, bits set, reports), `K.stats`, `K.m` (cpu, ram, average current), `K.crash` (`{t, msg, unit}`), `K.units[].tr` (per-millisecond state: 1 running, 2 ready, 3 blocked on object, 4 ran under 1 ms, 5 blocked on delay, 6 deep sleep), `K.coreTr`.
- **Lesson object**: see `.claude/skills/build-stage/reference/lesson-contract.md`. The key functions are `start(prev)`, `solution()`, `check(K)` (one row per goal), `evidence(K)`, `diagnose(K, res)`, plus the declared `wrong` and `alts` cases.

### Stage file set

`<slug>.js` (logic: goals, start, solution, check, evidence, diagnose, wrong, alts), `<slug>.content.js` (manual, quiz, realCode, widgets), `<slug>.copy.js` (briefing, reactions, hints, solutionNote). Stages 1 and 2 keep their copy inline. Stages are registered in `src/lessons/index.js` (`LESSONS`, `JOURNEY`, `SIDE`).

## 3. Definition of done

Run both after every change, and before reporting anything as finished:

```bash
gjs -m tools/verify.js        # or: node tools/verify.js   (add a stage number for one stage)
tools/diagrams.sh             # add a stage number for one stage
```

- `verify.js` must end with `All green.` It proves, per stage: shape, theory and quiz complete, starting code fails, reference solution earns 3 stars with no faults, every declared wrong answer fails what it claims and gets the declared reply, every declared crash is marked on the chart, every declared alternative earns its stars, every offered instruction can be added in the editor, and the chart is readable.
- `diagrams.sh` must end with `DIAGRAMS: 0 problem(s)`.
- Anything visible in the page (editor, result card, chart, widgets) also needs a look in a browser. The verifier cannot see the DOM. Use `tools/demo-helper.js`:

```js
const H = (await import('/tools/demo-helper.js')).H;
await H.enter(); await H.theory(); await H.briefing();
const out = []; await H.go('label', out, ['taskName']); out.join('\n');
```

  `H.theory()` operates every widget control and answers every check; `H.go()` flashes the current code and reports unmet objectives, the reply, the chart evidence and the result. Keep one call under about 40 seconds.

## 4. Agents and how to split work

Agent definitions are in `.claude/agents/`. Each runs on the cheapest model that does its part well; accuracy comes from the checks, not from the model.

| Agent | Model | Does | Must not |
|---|---|---|---|
| `stage-designer` | sonnet | Writes `specs/stage-NN.md` with numbers measured on the simulator | Write lesson code |
| `stage-builder` | sonnet | Lesson logic, kernel additions, registration; loops on the verifier | Write theory or copy |
| `theory-author` | sonnet | `<slug>.content.js`: manual, widgets, quiz with per-option explanations, ESP-IDF example | Change objectives |
| `copy-writer` | haiku | `<slug>.copy.js`: briefing, reactions, hints | Invent mechanics |
| `fact-checker` | sonnet | Read-only check of theory against ESP-IDF and FreeRTOS sources | Edit files |
| `stage-verifier` | haiku | Runs the checks and reports the output verbatim | Judge or fix |
| `learning-reviewer` | sonnet | Teaching and visual review from screenshots, with proposals | Edit files |

Workflows in `.claude/workflows/`: `build-stage` (one stage), `build-all` (design chain, parallel content, build chain), `review-game` (capture, review, apply, verify). Skills in `.claude/skills/`: `build-stage` (with the lesson contract) and `embedded-learning-game` (how to build this kind of game for another topic).

Rules for parallel work, learned the hard way:

- **Split by file, never by topic.** Give each agent a list of files it alone may edit. Two agents in one file overwrite each other.
- **Give the agent the check that proves its work**, and tell it to run it. "Fix every line `tools/diagrams.sh N` prints" converges; "improve the diagrams" does not.
- **Read-only agents report, the lead applies.** Fact checks and reviews return a list with exact replacement text.
- **Briefs name what is already known and what not to touch.** An agent starts with no context beyond its brief.
- **An agent's report is a claim.** Re-run both checks yourself before telling anyone it is done.

## 5. How to extend

**A new stage.** Use the `build-stage` skill or workflow. Order: spec → lesson logic until the verifier is green → theory and copy in parallel → fact check → both checks → play it once through the page.

**A new instruction (op).** `kernel.js` (execution, and whether it may run in an ISR or timer callback), `editor.js` (`line()` and `defaultInstruction()`), `OPS` in `tools/verify.js`, the lesson contract. The verifier fails if the editor cannot add it.

**A new kernel object type.** Kernel object creation and reset, the startup-code rendering in `editor.js` (`appMain`), `names()` filters, the contract. The player cannot add objects, so every object a solution needs must be in `start()`; an unused one must be deletable (it costs RAM and the Lean star).

**A new rover function.** Add it to `F` in `kernel.js` with `cost`, `stack`, `sig` and optional `wait`, `start`, `end` hooks. Record world facts in `K.w`, not in module variables.

**A new design check (invariant 6).** Record the fact in the kernel where it happens (`K.w.something.push({t, unit, ...})`), fail the objective on it in `check(K)`, bracket it in `evidence(K)`, give it its own reply in `diagnose`, update the goal text so the rule is stated, and declare a `wrong` case that passes without the check. Never call `K.bad()` for it if another row counts `K.stats.viol`.

**Another topic (protocols, timers, interrupts).** Follow `.claude/skills/embedded-learning-game/`. The topic needs its own deterministic simulator behind the same lesson contract; the game shell, verifier pattern and agent team carry over.

## 6. Traps that have already cost time

- **Inherited tasks are the player's.** Find them by what they do (`u.code.some(i => i.fn === 'motorStep')`), never by name, and wrap their code instead of replacing it. A `start(prev)` that throws on a renamed task stops the stage from loading.
- **Player firmware is not the reference chain.** The verifier builds each stage on the reference solution of the one before. A player's passing firmware differs (priorities, stack margins, names). When a regression objective can fail for an old task, the reply must name that task (see `lateLight` and `starved` in `timeline.js`).
- **Stars must not punish good practice.** The RAM star counts `leanRam(K)`: total RAM minus up to 256 B of spare stack per task. Set the limit to the reference value plus a small slack.
- **Index pairing breaks.** Never pair events by position (`a[i]` with `b[i]`) when the player can add an extra call. Pair each event with the next unused one after it.
- **Crash explanations need wiring.** `diagnose(K, [])` is called on a crash only if its source mentions `K.crash`; return a specific reaction there. The chart marks `K.crash.unit`, the task that never sleeps, or the full core.
- **Defaults teach.** A new instruction's default must not be the answer (a wait starts on one bit, not on "all"), and must point at the newest object of its kind.
- **A `//` comment in the middle of a long one-line statement comments out the rest of the line.** Use `/* */` inside one-liners. This broke the diagram checker once and the editor defaults once.
- **Browser caches lie.** Always serve with `tools/serve.py`. Timing-dependent checks are unreliable when the page is in a hidden or background tab.
- **Diagrams drawn by code** need a left margin for the longest row label and room for the axis unit; check other control values, not only the starting state.

## 7. Refactoring notes

Safe to do, with both checks as the net:

- `src/kernel.js` is written very densely (long lines, short names). Splitting it into scheduler, objects, power and the function library `F` is worthwhile, but keep the exported names and the event and trace formats: lesson files, `timeline.js` and the verifier read them.
- `src/main.js` mixes save handling, theory pages, the journey view, playback and the result card. Each is a candidate for its own module. `window.__game` is used by `tools/demo-helper.js`; keep `world, L, LESSONS, SIDE, runSim, prog`.
- The "Still working" rows are assembled per stage by indexing into earlier stages' `check()` or `detail()` results. A shared `regression(K, upTo)` helper would remove that coupling; `detail()` rows may only ever be appended.
- Evidence fallbacks live in `timeline.js` (`evidenceOf`). Lesson-specific evidence belongs in the lesson; shared rules belong there.

Do not do without a decision from the owner: add a build step or npm dependencies, change the save format without a migration (`sane()` in `main.js` only repairs shape), change star limits or objectives of existing stages, or replace the block editor with free text.

## 8. Known open items

- The complete ESP-IDF example of each stage has never been compiled with a real toolchain.
- The phone layout has been checked for stage 1 only.
- `tools/diagrams.sh` measures widgets in their starting state only; `H.theory()` in the page covers the other control values.
- No automated test plays a stage with a non-reference firmware. A second verifier pass with "player-like" firmware (lights at priority 1, stacks with margins, renamed tasks) would catch the class of problems found by hand in stages 5, 12 and 14.
- Two cells of the wake-up source table in the side mission (ext1 and ULP needing the RTC peripherals only when used) were not checked line by line against the ESP-IDF sleep documentation.
