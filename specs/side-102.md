# Side mission 102: Mode Control (state machines)

Stand-alone side mission (like 101 Martian Night). Lesson logic is DONE and tested: `src/lessons/mode-control.js`. Do not edit it, `src/kernel.js`, `src/editor.js` or any other shared file.

## 1. What the player does
The rover gets a mode manager. One task, `mode` (priority 3), waits on a queue named `events` and handles each event with a state machine. The player edits the **transition table** of that machine in the editor. A row says: in state S, on event E, run action A (or none) and go to state N. The editor shows the table as the C `switch (state)` it stands for. The player can also change the stack size and queue length in `app_main()`.

- States (fixed): `IDLE`, `DRIVING`, `SAMPLING`, `SAFE`. Initial state `IDLE`.
- Events (fixed): `CMD_DRIVE`, `CMD_STOP`, `CMD_SAMPLE`, `CMD_RESUME` (commands from Mission Control), `HAZARD` (bumper or tilt sensor), `DRILL_DONE` (sent by the drill driver when a sample is finished).
- Actions (rover functions, one per row, or none):
  - `startMotors()` 1 ms CPU. Fault if the drill is down or a hazard is not cleared.
  - `stopMotors()` instant.
  - `startDrill()` 1 ms CPU, returns at once; the drill works by itself and `DRILL_DONE` arrives 400 ms later. Fault if the wheels turn or a hazard is not cleared.
  - `drillSample()` the blocking version: the call blocks 400 ms until the drill is back up, then `DRILL_DONE` arrives. While it blocks, the task cannot receive any event.
  - `retractDrill()` 1 ms CPU: pulls the drill up at once and cancels the sample (no `DRILL_DONE`).
  - `sendReport()` 3 ms CPU, 1100 B of stack: reports one drilled sample. Fault if there is no new sample.
- A `HAZARD` stays active until `CMD_RESUME` arrives from Mission Control. Until then nothing may move.
- An event with no row for the current state is ignored (the serial monitor prints `state X: no transition for Y, event ignored`).

## 2. Test script (3200 ms)
| ms | event | correct behaviour |
|---|---|---|
| 100 | CMD_DRIVE | start wheels, DRIVING |
| 400 | CMD_SAMPLE | ignore: wheels are turning |
| 500 | HAZARD | stop wheels, SAFE |
| 650 | CMD_DRIVE | ignore: hazard not cleared |
| 800 | CMD_RESUME | IDLE |
| 900 | CMD_SAMPLE | start drill, SAMPLING |
| 1050 | CMD_DRIVE | ignore: drill is down |
| 1300 | DRILL_DONE | send report, IDLE |
| 1400 | HAZARD | (rover is idle) SAFE |
| 1500 | CMD_DRIVE | ignore |
| 1600 | CMD_RESUME | IDLE |
| 1700 | CMD_DRIVE | DRIVING |
| 1900 | CMD_STOP | stop wheels, IDLE |
| 2000 | CMD_SAMPLE | SAMPLING |
| 2200 | HAZARD | retract drill, SAFE (sample lost) |
| 2350 | CMD_SAMPLE | ignore |
| 2500 | CMD_RESUME | IDLE |
| 2600 | CMD_SAMPLE | SAMPLING |
| 3000 | DRILL_DONE | send report, IDLE |

## 3. Objectives (index: text)
0. Drive: the wheels start within 20 ms of every CMD_DRIVE the rover may obey and stop within 20 ms of CMD_STOP
1. Hazard: 10 ms after every HAZARD the wheels are stopped and the drill is up
2. Safe mode: after a hazard nothing moves until CMD_RESUME
3. Drill safety: the drill is never down while the wheels turn
4. Science: 2 samples drilled and reported, no empty report
5. Responsive: every event is handled within 10 ms of its arrival

Stars: 1 = all objectives. 2 = "Deliberate": every event that arrives finds a row, even if the row only says "stay" (no action, same state). 3 = "Lean": at most 2200 bytes of RAM (the 4096 B starting stack must come down; the task needs 768 + 1100 = 1868 B, 2048 is a good choice).

## 4. Starting code (fails)
A table with no real states: five rows, all in `IDLE`, all staying in `IDLE`: CMD_DRIVE→startMotors, CMD_STOP→stopMotors, CMD_SAMPLE→drillSample (blocking), DRILL_DONE→sendReport, HAZARD→stopMotors. Measured: the drill goes down at 400 ms while the wheels turn; the HAZARD at 500 ms waits 301 ms because the task is blocked inside drillSample(); movement while a hazard is active; the HAZARD at 2200 ms does not raise the drill.

## 5. Reference solution (3 stars), 12 rows, stack 2048
```
IDLE:     CMD_DRIVE  -> startMotors,  DRIVING      CMD_SAMPLE -> startDrill, SAMPLING     HAZARD -> (none), SAFE
DRIVING:  CMD_STOP   -> stopMotors,   IDLE         HAZARD     -> stopMotors, SAFE         CMD_SAMPLE -> (none), DRIVING   [stay]
SAMPLING: DRILL_DONE -> sendReport,   IDLE         HAZARD     -> retractDrill, SAFE       CMD_DRIVE  -> (none), SAMPLING  [stay]
SAFE:     CMD_RESUME -> (none),       IDLE         CMD_DRIVE  -> (none), SAFE [stay]      CMD_SAMPLE -> (none), SAFE [stay]
```
Measured: all objectives met, slowest event 0 ms, CPU 0 %, RAM 2272 B (2092 B counted for the Lean star). Without the four "stay" rows it still passes, with 2 stars.

## 6. Reaction keys (copy-writer: every key must exist in `reactions`; each is an array of 1 to 3 strings)
Required by the game: `watchdog`, `crash`, `fail`, `pass`.
- `stack`: stack overflow. The task's deepest call is sendReport() (1100 B) on top of 768 B of task overhead.
- `noTable`: the task has no table rows at all.
- `stateless`: every row stays in its own state, so the machine never leaves IDLE and answers each event the same way whatever the rover is doing.
- `forgotNext`: a row starts the wheels or the drill but the next state is the same state, so the machine does not know it is moving.
- `blockingAction`: drillSample() is used as an action; it blocks 400 ms and events (the HAZARD) wait in the queue. Use startDrill() and a SAMPLING state that waits for DRILL_DONE.
- `slow`: an event waited more than 10 ms for another reason (for example a vTaskDelay in the task loop).
- `drillAndWheels`: drill and wheels together. Some state accepts CMD_SAMPLE while driving or CMD_DRIVE while sampling.
- `hazardNoRow`: a HAZARD arrived in a state that has no HAZARD row, so it was ignored. Every state needs an answer to the emergency event.
- `hazardWrongAction`: the HAZARD row exists but its action does not make that state safe (in SAMPLING the drill must come up: retractDrill()).
- `safeLeak`: something moved while the hazard was not cleared: SAFE obeys a command, or a HAZARD in IDLE did not lead to SAFE.
- `driveIgnored`: a legal CMD_DRIVE did not start the wheels.
- `stopIgnored`: CMD_STOP did not stop the wheels.
- `noReport`: a sample was drilled but not reported: DRILL_DONE needs sendReport().

Hints (4 to 5, from gentle to nearly the answer): (1) flash it and compare the `state` row of the chart with what the rover is really doing; (2) give the rover real states: a row that starts something must also change the state; (3) drilling takes 400 ms: do not wait for it inside an action, start it and wait in a state for DRILL_DONE; (4) go through the four states and ask for each what HAZARD must do there; (5) for the second star add "stay" rows for the commands you refuse, and for the third trim the stack.
`solutionNote`: two strings (what the reference does; what to notice in the chart).
`briefing`: 4 lines (what was added: the mode manager task, the event queue, the table; what must work; advice: flash first, watch the state row).

## 9. Theory outline (theory-author)
Target reader: knows tasks, queues and ISRs from the main journey; has never built a state machine. 6 core sections plus one "(Go deeper)" section. Problem first, then the model, then the C, then the RTOS side, then the two classic mistakes.

1. **The problem: flags that disagree.** Without states, firmware keeps booleans (`driving`, `drilling`, `safe`). Three flags give 8 combinations; only 4 are legal. Every handler must check every flag, and one forgotten check drills while driving. Diagram: the 8 flag combinations with the illegal ones marked, next to the 4 states. Use the starting code of the mission as the example.
2. **States, events, transitions, actions.** Definitions with rover examples. The state diagram of the mission (4 nodes, the reference transitions). A state machine is in exactly one state; an event either has a transition in that state or is ignored. Interactive widget (write it in your content file): the rover's state diagram where the reader clicks an event button and sees the transition taken, the action run, or "ignored in this state".
3. **From diagram to C.** `typedef enum` for states and events; the nested `switch (state)` / `if (ev == ...)` form (this is what the game's editor shows); the table-driven form (`static const transition_t table[]` with a lookup loop) and when each is better. The `default:` branch must at least log the unhandled event.
4. **One task, one queue.** The machine lives in one task: `xQueueReceive(events, &ev, portMAX_DELAY)` then dispatch. Events come from ISRs (`xQueueSendFromISR`), software timers and other tasks; all of them only post. Because only this task reads and writes `state`, no mutex is needed. Blocked on the queue it uses no CPU. Each event is handled completely before the next is read (run to completion). Diagram: sources → queue → mode task → actuators.
5. **Actions must not block.** While an action runs, the queue is not read. `drillSample()` blocks 400 ms, so a HAZARD waits up to 400 ms. The fix is to turn the wait into a state: `startDrill()` returns at once, the machine sits in SAMPLING, and the driver posts DRILL_DONE. Timeline diagram of both versions with the HAZARD marked. Rule of thumb: an action takes microseconds to a few milliseconds; anything longer becomes a state plus a completion event.
6. **Every state answers the emergency, and ignoring is a decision.** The state × event matrix (4 × 6): go through every cell. HAZARD needs a row in every state, with a different action in each (stop wheels, raise drill, nothing). A cell left empty means "ignored": make the important ones explicit rows so a reviewer sees it was decided. Diagram: the matrix of the reference solution.
7. **Timeouts, entry actions and bigger machines (Go deeper).** A timeout is an event too: a one-shot software timer that posts `EV_TIMEOUT`, or the timeout of `xQueueReceive`. Entry and exit actions; guards; hierarchical state machines in one paragraph; the ESP-IDF `esp_event` loop library as a ready-made dispatcher.

Game time is 1 ms ticks. `realCode`: a complete ESP-IDF v5 file `main/mode_manager.c` with the enum types, the event queue, an ISR that posts HAZARD with `xQueueSendFromISR`, the `mode_task` with the switch form of the 12 reference rows, and `app_main`.

## 10. Open risks
None blocking. The editor part (table shown as a switch) is built by the lead, not by the content authors.
