# RTOS Quest

A 3D programming game that teaches FreeRTOS on the ESP32. The player writes the rover's firmware from code blocks; a simulated kernel runs it.

## Rules that apply to every change
- **ESP-IDF only.** Code shown to the player and all examples use ESP-IDF (`app_main`, `xTaskCreate`, `gpio_set_level`, `ESP_LOGx`, `idf.py`). Never Arduino.
- **No build step.** Plain ES modules; Three.js comes from a CDN import map in `index.html`. The project must run without Node.js. Do not add npm dependencies.
- **The verifier is the definition of done.** Run `gjs -m tools/verify.js` (all stages) or `gjs -m tools/verify.js <n>`. A stage is not finished while it is red. Never edit `tools/verify.js`, loosen an objective, or delete a wrong-answer case to make it pass.
- **Diagrams are checked in a browser.** After any change to theory diagrams run `tools/diagrams.sh` (all stages) or `tools/diagrams.sh <n>`. It must print `DIAGRAMS: 0 problem(s)`: no text cut off, overlapping, or wider than its box.
- **One journey.** Every stage starts from the firmware of the stage before (`start(prev)`), keeps earlier behaviour as regression objectives, and adds hardware to the rover.
- **Theory first.** Every stage has two steps: 1 THEORY (the paged manual with widgets and check questions, which opens by itself the first time) and 2 MISSION. The theory is a main part of the game, not a help page: each section needs a diagram or widget and a check question.
- **The simulator is deterministic.** No `Math.random()` or wall-clock time in `src/kernel.js` or lesson files.
- Game time is 1 ms ticks (as if `CONFIG_FREERTOS_HZ=1000`); say so wherever real ESP-IDF defaults differ.

## Where things are
- `src/kernel.js` simulator and the rover function library `F` · `src/lessons/` one stage per file set, registered in `index.js`
- `src/widgets.js` diagram kit and interactive theory widgets · `src/world.js` 3D scene · `src/main.js` game loop · `src/editor.js`, `src/timeline.js`
- `tools/verify.js` stage verifier · `tools/diagrams.sh` diagram layout check (headless Chromium) · `tools/shots.sh` screenshots · `specs/` stage design specs · `.claude/` agents, skills and the `build-stage` workflow

## Before a larger change
Read `PROJECT.md`: invariants, architecture, data model, how to split work between agents, and known traps. After any change to theory diagrams or widgets also run `tools/diagrams.sh`.

## Adding a stage
Use the `build-stage` skill (or the `build-stage` workflow for a multi-agent run). The lesson contract is in `.claude/skills/build-stage/reference/lesson-contract.md`.

## Run the game
`python3 tools/serve.py` in this folder, then open http://localhost:8766. Use this server, not `http.server`: it disables browser caching, which otherwise serves stale lesson files after an edit.
