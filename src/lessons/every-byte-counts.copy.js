// Stage 4 in-game text: mission control briefing, reactions, hints and the solution note.
// Source of truth: specs/stage-04.md. Voice: wheels-and-eyes.js.

export const briefing = [
  'Engineer, the navigation team and the mapping team have delivered their code. TICK-1 is on the stands. Their two tasks, nav and mapper, are added under your stage 3 firmware in app_main(). Both run at priority 1.',
  'Nav must plan at least 4 paths in 1.5 s, and the mapper must process at least 5 frames in the same time. The beacon, heart, motor, camera, telemetry and spectrometer tasks from the earlier stages must still hold their timing, so they are checked too.',
  'The mapper takes a 2048 byte frame buffer from the heap on every lap. The heap on this board has 8192 bytes for the application. Flash the code as it is and read the serial monitor before you change anything.',
  'The whole firmware must fit in 14500 bytes of RAM. Both teams copied the 4096 byte stack from the examples. Once it runs, read the never used figure for nav and mapper in the result table, and size each stack from its peak with some margin left over.',
];

export const reactions = {
  watchdog: [
    'Task watchdog. A task stopped giving the CPU back, and the whole rover reset with it. Check that every task loop still ends in a vTaskDelay().',
    'Find the task whose row in the chart stays solid from end to end. That is the one that never gives the CPU back.',
  ],
  crash: [
    'The rover rebooted. The serial monitor at the bottom says which call failed, and the chart shows the time of the panic.',
  ],
  fail: [
    'Not there yet. Compare the chart with the objectives, change the code and flash again.',
  ],
  leak: [
    'The heap is draining. Each mapper lap takes 2048 bytes and nothing gives them back, so the free heap falls by the same amount every lap. Read the B of heap free figure in the result line.',
    'Every allocFrame() needs a matching freeFrame(), which is free() on the frame. Look at what the mapper task does after processFrame() returns.',
  ],
  headroom: [
    'The stacks fit, but there is no margin. A stack sized exactly to the peak has no room left, so one more local variable or one more log call later on would overflow it and reset the rover.',
    'The result line shows the smallest free stack across nav and mapper. The check wants at least 128 bytes of it still free at the peak.',
  ],
  budget: [
    'Everything runs, but the RAM total is over the 14500 byte budget. Read the never used column for nav and mapper. Every unused byte there is RAM you pay for and do not use.',
    'The margin is the part of the stack you keep free on purpose. Check the RAM figure again after each change.',
  ],
  hog: [
    'The new tasks break the earlier stages. Motor, telemetry or the lights miss their timing, so one of the stage 1 to 3 checks now fails.',
    'Check the priorities of nav and mapper. A task above priority 4 starves the lights, and above 3 it starves the motor. The leak and the stack sizes are memory problems and do not change these checks, so keep nav and mapper at their original priority.',
  ],
  pass: [
    'Heap steady, stacks sized to the peak plus a margin, and the earlier stages still hold. Every buffer the mapper takes from the heap goes back to it, and both stacks keep their headroom.',
    'One note for later: some of the older stacks, such as the spectrometer, run with only a few spare bytes. They work today, so they stay as they are. The flight readiness review at the end of the journey will come back to them.',
  ],
};

export const hints = [
  'Flash it and read the serial monitor first. Which task reports the failure, and at what time does it stop?',
  'The mapper takes one buffer from the heap on each lap. Where in its code does that buffer go back?',
  'Once the leak is fixed, set each new stack from its peak use in the result table and keep a margin above it. A stack of 4096 bytes wastes RAM the budget needs.',
  'For the RAM star the limit is 13024 bytes, and up to 256 bytes of spare stack per task are not counted, so a margin costs nothing. Stack need is the 768 byte base plus the deepest rover function each task calls: about 3168 bytes for nav and about 1368 for the mapper.',
];

export const solutionNote = [
  'My version frees each frame in the same lap it was allocated, so the heap comes back to full every time. The stacks are sized from the measured peaks plus a small margin, so the rover fits the RAM budget and does not crash.',
  'Experiment: set both delays to 100 ms. Predict first: is the heap full at the end, and does the CPU load go up or down? Then read the result line and say which objective moves first and why.',
];
