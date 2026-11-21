# Architecture

Plain ES modules, no build step. Each layer only knows the one below it through a small contract.

| Layer | File here | Contract |
|---|---|---|
| Simulator | `src/kernel.js` | `runSim(lesson, program) -> K` |
| Verifier | `tools/verify.js` | imports lessons and simulator; exit code 0 = green |
| Lessons | `src/lessons/*.js` | the lesson object, see the build-stage skill's `lesson-contract.md` |
| Editor | `src/editor.js` | renders `program` as source code with inputs; mutates it |
| Chart | `src/timeline.js` | draws `K`; `describe(K, L, t)` for the hover read-out |
| World | `src/world.js` | `setStage(n)`, `setPin`, `pulse(kind)`, `crash()`, `celebrate()` |
| Theory | `src/widgets.js` | diagram kit + `WIDGETS[name](el)` |
| Game loop | `src/main.js` | title, dialogue, run, playback, result, journey, save |

## The trace contract (what every simulator must return)
```js
K = {
  T, end,                 // planned and actual length in time steps
  units: [{ name, kind, tr: Uint8Array(T) }],   // per actor, one state code per step
  ev: [{ t, k, ... }],    // ordered events: 'pin', 'fn', 'log', 'mark', 'crash'
  crash: null | { t, msg },                     // msg is the real error text
  stats: { ... }, w: { ... },                   // counters and driver-side state for objectives
  m: { cpu, ram, ... },   // headline metrics for the stars
}
```
State codes map to chart styles. Keep them few: active, ready or pending, waiting on time, waiting on an object, idle.

A simulator is a pure function of `(lesson, program)`. It loops over time steps: inject scheduled external events, advance timers, decide who runs, execute instructions until time is consumed or the actor blocks, record the trace. It must end for any program, including empty or spinning ones: cap instantaneous instructions per step.

## Programs are data
The learner's firmware is JSON: actors (tasks, ISRs, callbacks) with a list of instructions, plus configured objects. That gives you saving, carry-over between stages, reference solutions, mutation-based wrong answers and headless testing for free. The editor renders it as real source code (`app_main()` creating the objects, then one function per actor).

## The verifier is the product's backbone
For each stage it proves: shape is valid; the start fails; the solution passes with all stars; each wrong answer fails the stated objectives or crashes with the stated message; the stage composes with the previous solution; runs are deterministic; degenerate programs do not hang or throw. Write it before the second stage exists. Find a headless runtime that is already installed (`node`, else `gjs -m`, else a browser test page).

## Playback
Simulate instantly, then replay the event list against the world and move a cursor over the chart. The world never contains game logic; it only shows events.
