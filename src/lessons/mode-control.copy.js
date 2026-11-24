// Side mission 102: Mode Control (state machines). In-game copy only (briefing, reactions, hints, solution note).
// Voice: a calm senior engineer on the radio.

export const briefing = [
  'Good morning, engineer. This is side mission 102, Mode Control. The rover now has a mode manager: one task called mode, at priority 3. It waits on a queue called events, and it handles each event with a state machine.',
  'Added to your firmware: the transition table of that machine. There are four states, IDLE, DRIVING, SAMPLING and SAFE. There are six events, CMD_DRIVE, CMD_STOP, CMD_SAMPLE, CMD_RESUME, HAZARD and DRILL_DONE. Each row says: in this state, on this event, run this action and go to the next state.',
  'What must work: the wheels start and stop on time. A HAZARD stops the wheels and raises the drill within 10 ms. Nothing moves until CMD_RESUME arrives. Two samples are drilled and reported, and every event is handled within 10 ms of its arrival.',
  'Flash the firmware as it is first, and watch the state row of the chart. Then edit the table. Do not change the table before you have seen how the rover fails.',
];

export const reactions = {
  watchdog: [
    'Task watchdog. The mode task ran without giving the CPU back, so the chip reset itself. The task never blocked. Look at the loop: a call to xQueueReceive() with timeout 0 returns at once, even when the queue is empty.',
    'Find the mode row in the chart. A solid bar from end to end means the task never waited. The receive call should wait for an event, not return at once.',
  ],
  crash: [
    'The rover rebooted. The serial monitor at the bottom shows the reason. Read the first error line before you change anything else.',
  ],
  fail: [
    'Not there yet. Find the red objective in the list and start there. The chart and the serial monitor show which event was ignored or handled late.',
  ],
  pass: [
    'All objectives are met. The mode task handles every event in the test script. To earn the stars, check that every event finds a row in every state, and that the stack of the mode task is not larger than the task needs.',
  ],
  stack: [
    'Stack overflow in the mode task. Its deepest call is sendReport(), which needs 1100 B, on top of 768 B of task overhead. The stack you gave the task in app_main() is too small for that call.',
  ],
  noTable: [
    'The mode task has no table rows at all. Every event is ignored, so the state row of the chart stays at IDLE. The serial monitor prints a line for each ignored event. Add rows to the transition table, one for each state and event pair you need.',
  ],
  stateless: [
    'Every row stays in its own state. The state row of the chart never leaves IDLE, so the machine answers each event the same way, whatever the rover is doing.',
    'A state machine must move to a new state when it starts something. Compare the next-state column of each row with the state the rover really reaches.',
  ],
  forgotNext: [
    'A row starts the wheels or the drill, but its next state is the same state. The machine does not know it is moving, so a later event is handled as if the rover were still idle. Check the next state of each row that calls startMotors() or startDrill().',
  ],
  blockingAction: [
    'drillSample() blocks for 400 ms. While it blocks, the task cannot receive any event, so a HAZARD waits in the queue. In the test script the HAZARD at 500 ms waits about 300 ms. Look at the action of the CMD_SAMPLE row.',
  ],
  slow: [
    'An event waited more than 10 ms for another reason. The task spends time in a delay inside its loop, so the next event is read late. Look for vTaskDelay() or any other wait in the mode task loop.',
  ],
  drillAndWheels: [
    'The drill and the wheels ran together. A state accepted CMD_SAMPLE while the wheels were turning, or CMD_DRIVE while the drill was down. Check the rows of DRIVING and SAMPLING, and ask which states can be reached while the wheels turn.',
  ],
  hazardNoRow: [
    'A HAZARD arrived in a state with no HAZARD row, so it was ignored. The serial monitor prints state X: no transition for HAZARD, event ignored. Every state needs an answer to HAZARD, even if the answer is to go to SAFE with no action.',
  ],
  hazardWrongAction: [
    'The HAZARD row exists, but its action does not make the state safe. In SAMPLING the drill must come up before the rover is safe. Check the action of the HAZARD row in SAMPLING, and compare it with the drill in the chart at the time of the test HAZARD.',
  ],
  safeLeak: [
    'Something moved while the hazard was not cleared. Either SAFE obeyed a command, or a HAZARD in IDLE did not lead to SAFE. Look at the rows of the SAFE state, and at the HAZARD row of IDLE.',
  ],
  driveIgnored: [
    'A legal CMD_DRIVE did not start the wheels. Either the state has no CMD_DRIVE row, or the row does not call startMotors(). Check the state row of the chart at the time of the command, and the CMD_DRIVE row of that state.',
  ],
  stopIgnored: [
    'CMD_STOP did not stop the wheels. The chart shows the wheels still on after the command. Check that the state DRIVING has a CMD_STOP row, and that its action is stopMotors().',
  ],
  noReport: [
    'A sample was drilled, but no report was sent. DRILL_DONE needs sendReport() as its action. After the drill finishes, the rover must send one report. Check the DRILL_DONE row of SAMPLING.',
  ],
};

export const hints = [
  'Flash it, and compare the state row of the chart with what the rover does. Find the first event where the two disagree. Then read the serial monitor for that event.',
  'A row that starts something must also change the state. For each row, check which state the rover is in after the action runs.',
  'Drilling takes 400 ms. Do not wait for it inside an action. Start the drill, go to a state that waits, and let DRILL_DONE move the machine on.',
  'Go through the four states one at a time. In IDLE and DRIVING, a HAZARD must stop the wheels and lead to SAFE. In SAMPLING, the drill must come up. In SAFE, nothing needs to happen, and the commands are refused.',
  'For the second star, add a stay row for each command that a state refuses. The row has no action and the same state as its next state. For the third star, lower the stack of the mode task to 2048 bytes.',
];

export const solutionNote = [
  'The reference has four real states. Each row that starts the wheels or the drill moves the machine to DRIVING or SAMPLING. The HAZARD row in each state moves the rover to SAFE. startDrill() returns at once, so the task goes back to the queue and waits in SAMPLING for DRILL_DONE.',
  'Experiment: change the HAZARD row of SAMPLING from retractDrill() to no action. Predict the drill in the chart at the time of the test HAZARD at 2200 ms, then run the test. The drill stays down, and the hazard objective should turn red.',
];
