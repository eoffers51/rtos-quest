// Stage 11 copy: Deadly Embrace. Written from specs/stage-11.md.
// Voice: calm senior engineer on the radio. No exclamation marks, no emoji, no Arduino terms.

export const briefing = [
  'Engineer, the photo session is the next job. The drive team added two tasks under your firmware in app_main(): arm and focus. Both need the arm and the camera, so both take the same two mutexes, arm_mtx and cam_mtx.',
  'The arm task moves the arm with positionArm() and then takes the picture with photograph(). The focus task calibrates the camera with calibrateCamera() and then checks focus with checkFocus(). Each task runs two sessions in the 1 second test.',
  'The goal: no task waits for ever for a lock, at least two photographs and two focus checks finish, and every older check still passes. Your beacon, heart, motor and uplink work must keep its timing.',
  'Flash the firmware as it is and read the chart before you change anything. Find the rows that stop moving, and the lock each of those tasks is holding.',
];

export const reactions = {
  watchdog: [
    'Task watchdog. The idle task got no turn for 600 ms, so something holds the CPU and never blocks. Find the task whose row is solid from end to end in the chart.',
    'Check the loop in that task for a vTaskDelay() or a blocking take. A wait that spins never gives the CPU back.',
  ],
  crash: [
    'The rover rebooted. The serial monitor at the bottom says why. Read its first line before you change any code.',
  ],
  fail: [
    'Not there yet. Compare the chart with the objectives one by one, change the code and flash again.',
  ],
  pass: [
    'Both sessions finished, nothing waited for ever, and the older stages still pass. In a rover, the order in which tasks take their locks decides whether the photos happen at all.',
  ],
  deadlock: [
    'The chart shows two flat "blocked" rows that never move again, and the log names a circular wait. Each task holds one lock and waits for the one the other holds. Compare the order in which arm and focus take arm_mtx and cam_mtx.',
  ],
  orderLuck: [
    'Nothing hung in this run, but two tasks still take the same two locks in opposite orders. The chart marks both places. Only timing kept them apart: move one task by a few milliseconds and they lock each other for ever. Pick one order for arm_mtx and cam_mtx and use it everywhere.',
  ],
  keepsLock: [
    'One row is blocked on a lock, but the task that owns it is asleep, not waiting, so the log has no deadlock line. The owner never gave its lock back.',
    'Look at what your code does when a wait gives up. Which lock is still held at that point, and who is waiting for it?',
  ],
  forgotGive: [
    'The log says a task waits for a mutex it already holds itself. Its row goes flat right after its own take. Count the xSemaphoreTake() and xSemaphoreGive() calls for each lock in that task, and make sure every take has a give on the same path.',
  ],
  noLocks: [
    'The log shows a driver call that ran without its lock: "ran without holding". Each call in the spec sheet needs particular locks. A call with no lock runs unprotected, and the chart flags it as a fault.',
  ],
  oneLock: [
    'The fault names a call that needs cam_mtx, but the task holds arm_mtx. Check the lock table for each function: photograph() and checkFocus() need both locks, not one.',
  ],
  releasedEarly: [
    'The fault names checkFocus() running without holding cam_mtx. The camera lock was given before the call that still needs it. A give belongs after the last call that uses that lock.',
  ],
  giveNotHeld: [
    'The serial monitor says a task gave a mutex it does not hold. Find that give line and the take that should match it. A give has to follow a take on the same path, once.',
  ],
  stack: [
    'Stack overflow in arm or focus, straight after the start. The stack has to hold the task itself plus the deepest rover function it calls. The comment next to each call gives that number. Add them up for each task.',
  ],
  busyLoop: [
    'task_wdt fires at the last tick. A task spins while it waits for a lock and never yields, so the idle task starves. A task that waits for a mutex has to block, not spin.',
    'Look at the wait in the task that is solid in the chart. Does it block the task, or keep it running?',
  ],
  hog: [
    'The motor, telemetry and beacon rows lost their timing. The photo session now runs above tasks with a deadline and delays them. Compare the priority of arm with the older tasks, and ask whether a photo session needs to go first.',
  ],
  regress: [
    'An older objective fails now. Compare the failing line in the objectives with the chart, and check which of your new tasks changed the timing of those rows.',
  ],
};

export const hints = [
  'Flash it and read the chart. Two rows go flat from the same moment. Which two tasks are they, and what is each one waiting for?',
  'Both tasks need both locks, but they do not take them in the same order. Write down the order for arm, then the order for focus. Is it the same?',
  'Pick one order for both tasks, arm_mtx first and cam_mtx second, and use it everywhere. Only one task has to change its take lines. Give the locks back in reverse order.',
  'For the RAM star: each task needs its own stack, sized to its frame plus the deepest rover function it calls, and the comments give those numbers. Oversized stacks cost RAM, and each mutex costs 96 bytes. The CPU star does not change for a correct design, so do not chase it.',
];

export const solutionNote = [
  'My version: both tasks take the locks in one order, arm_mtx first and cam_mtx second, and hold both for each session. With one order, no task can hold a lock while waiting for a lock that a task further along holds, so the circular wait cannot form. Timing, priorities and stacks stay as they were.',
  'Experiment: keep the reference lock order, but move focus to priority 3 and run it again. Then take cam_mtx first in focus and run it with the same priority. Does the priority remove the deadlock, or only shift the timing of the two sessions?',
];
