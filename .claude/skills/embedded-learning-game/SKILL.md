---
name: embedded-learning-game
description: Create an interactive learning game for any embedded-systems topic (RTOS, interrupts, timers and PWM, UART, I2C, SPI, CAN, ADC, DMA, low power, bootloaders) in the style of RTOS Quest - the learner writes real firmware from code blocks, a deterministic simulator runs it, and a device visibly works or fails. Use when asked to make a game, interactive course or simulator-based lessons for embedded development, or to add a new topic track to an existing one.
---
# Embedded learning game

A game of this kind is five parts. Build them in this order, because each one is tested by the one before it.

1. **Simulator**: a deterministic model of the mechanism being taught, stepped in fixed time units, producing a trace.
2. **Verifier**: a headless script that runs lessons on the simulator and proves each one is solvable and that wrong answers fail.
3. **Lessons**: data files: starting code, reference solution, objectives, wrong answers, dialogue, theory.
4. **Editor and chart**: the learner assembles real API calls; a timing chart shows what the simulator did.
5. **World and journey**: a device that reacts, and stages that extend one growing firmware.

Parts 1 to 3 need no graphics. Get them green first.

## The design rules that make it teach
- **The learner constructs the answer.** No multiple choice in the lessons. They add, remove, reorder and parametrise real API calls, and more than one solution passes.
- **Broken first.** Every stage opens with plausible code that fails in a way real firmware fails, with the real error text (watchdog, stack overflow, framing error, NACK, bus-off).
- **Measure, do not judge.** Objectives are numbers read from the trace: a period, a latency, a count, bytes lost. Show the measured value next to each objective.
- **Three stars from engineering trade-offs**: correct, then efficient (CPU, power, bus time), then lean (RAM, code size).
- **One journey.** Each stage starts from the previous stage's passing code and keeps earlier behaviour as regression objectives. The device gains hardware as the firmware grows, from a bench dummy to a production-ready build. The final stage is a production review: error paths, watchdogs, diagnostics.
- **Theory is interactive and checked.** Each stage has a manual of 5 to 7 sections: how the mechanism works inside, platform specifics with real defaults, pitfalls, a complete compilable example. Every section has a diagram or a widget the reader operates, and one check question about a consequence.
- **Platform-true.** Use the vendor framework the learner will really use (for ESP32: ESP-IDF, not Arduino). State where the simulation simplifies reality.

## How to start a new game or topic track
1. Read [reference/topic-simulators.md](reference/topic-simulators.md) and pick the simulator model for the topic: what the state is, the time step, what the learner edits, what the chart shows.
2. Read [reference/architecture.md](reference/architecture.md). Reuse the existing engine when the topic fits task-level simulation; write a new simulator module with the same trace contract when it needs bit-level or register-level time.
3. Write the journey first: 8 to 12 stages as a table of "device gains" and "you learn", ending in a production review. Agree it with the user before building anything.
4. Build the simulator and the verifier, then stage 1 by hand to settle the lesson contract for this topic ([reference/lesson-design.md](reference/lesson-design.md)).
5. Build the remaining stages with the agent team and model routing in [reference/model-routing.md](reference/model-routing.md). In this repository that is the `build-stage` skill and workflow.
6. Show the user one stage before building the rest. Style and depth are theirs to judge.

## Non-negotiables
- The simulator and lessons are deterministic: no randomness, no wall-clock time. Variation comes from fixed schedules.
- Nothing ships without the verifier green and a fact check of the theory against primary documentation.
- No art assets and no build step are required: geometry and diagrams are generated in code, modules load natively. Add tooling only when the user has it installed.
