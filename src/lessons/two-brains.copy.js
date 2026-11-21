// Stage 13 copy: Two Brains. Text only; the lesson logic lives in two-brains.js.
// Voice follows wheels-and-eyes.js: calm, second person, present tense, short sentences.

export const briefing = [
  'Flight to engineer. Overnight the vision team bolted a hazard pipeline onto TICK-1: two new tasks, vision and fusion, both at priority 2, sharing one hazard record.',
  'What must work: vision publishes a frame every 50 ms, fusion reads the record every 50 ms, and every older objective from stages 1 to 12 still passes, the bus, the arm and the camera included.',
  'Their code was copied from the other tasks and pinned to core 1, where the rover already runs at 95 percent. Flash it as it is before you change anything, and read the chart and the serial monitor first.',
];

export const reactions = {
  watchdog: [
    'Task watchdog. One core never gave its idle task a turn. The message names it: IDLE1 (CPU 1) means core 1 is full, IDLE0 means a task on core 0 never blocks.',
    'Find that core in the chart. Ask which tasks are pinned there, how long each one runs every 50 ms, and whether any of them can move to the other core.',
  ],
  crash: ['The rover rebooted. The serial monitor at the bottom says why.'],
  fail: ['Not there yet. Compare the chart with the objectives, change the code and flash again.'],
  pass: ['Both brains are working. Vision and fusion run side by side on core 0, the hazard record is read only when it is complete, and the older tasks did not notice. Two cores only help when the work is kept apart.'],
  race: [
    'The chart shows vision and fusion running in the same milliseconds on core 0, and the serial monitor logs a torn read in every cycle. Nobody takes hz_lock. Two calls touch the same record at the same moment.',
    'Look at what surrounds publishHazard() in vision and readHazard() in fusion. Which lock should guard them?',
  ],
  hiddenRace: [
    'No read was torn in this run, but nothing guards the record. The two calls stayed apart only because of when each task happens to run. Change a period, a priority or a core and they meet. The serial monitor names the calls made without hz_lock.',
    'Timing is not protection. Take hz_lock around publishHazard() in vision and around readHazard() in fusion.',
  ],
  outsideLock: [
    'Both tasks take hz_lock, but one of them touches the record when it does not hold the lock. The chart marks the call. Nothing collided this time, by timing only.',
    'The give belongs after the call that uses the record, and the take before it.',
  ],
  halfLocked: [
    'The lock is in one task only. A lock protects the record only when both sides take it, so the other side still walks in while the first one writes.',
    'Check the take and give lines of both tasks. Which side has none?',
  ],
  longSection: [
    'The torn reads are gone, but fusion waits a long time for hz_lock. Vision holds the lock through the whole analysis, not just the publish. Which calls really touch the record?',
  ],
  delayNotLock: [
    'The overlap is gone, but only because fusion now sleeps before it reads. That read finishes late and misses its 15 ms window. A delay moves the timing; it does not stop two calls from meeting.',
  ],
  readerStarved: [
    'The record is clean, but fusion runs late. Vision now outranks fusion, so fusion waits behind the whole analysis. Priority decides who goes first; it does not keep two calls apart. Which task has the shorter deadline?',
  ],
  forgotGive: [
    'Vision took hz_lock and never gave it back, so fusion waits forever and the chart shows a long flat wait on the lock. Look for the give that should follow the publish.',
  ],
  noVision: [
    'Fusion reads the record every 50 ms, but nothing new is ever published. Vision is not doing its job. Read the vision task body from its first line to its last.',
  ],
  regress: [
    'An older objective broke when you changed the hazard tasks. Compare the bus, arm and camera rows with the last passing flash. Which task from stage 12 did your change touch?',
  ],
};

export const hints = [
  'Flash it and read the serial monitor. The watchdog message names an IDLE task, IDLE0 or IDLE1. That tells you which core is starved.',
  'That core is full. Add up how much of each 50 ms the tasks pinned there need. Does the total fit on one core?',
  'The last argument of xTaskCreatePinnedToCore() is the core. Change it to the other core for both new tasks, vision and fusion.',
  'On the other core the two tasks now overlap in time and the record is torn. A mutex keeps their calls apart. Which lines in each task should it wrap, and which should stay outside?',
  'For the RAM star: a task stack is its own base plus the deepest rover call it makes. Vision reaches visionStep and publishHazard, fusion reaches readHazard and fusionStep. Size each stack to its deepest path plus a little margin.',
];

export const solutionNote = [
  'The reference puts both tasks on core 0, where nothing else runs, and wraps only the copy in hz_lock: take before publishHazard() or readHazard(), give straight after. The 10 ms analysis stays outside the lock, so the lock is held only for the 4 ms copy.',
  'Experiment: wrap visionStep() in the same lock too, flash it, and watch the worst read delay on the chart go past the 15 ms window. Then ask which part of the work really needs the lock.',
];
