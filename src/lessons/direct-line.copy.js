// Stage 8 (Direct Line) in-game copy: mission control briefing, reactions, hints and solution note.
// Voice: calm senior engineer on the radio. Source: specs/stage-08.md.

export const briefing = [
  'Good news, engineer. The safety team swapped the bumper switch for a strip sensor. It raises one interrupt per impact, so a double hit now shows up as two interrupts.',
  'Your firmware from stage 7 is still in place. The impact handler onBump() stops the motors and then gives bump_sem to the bumper task. bump_sem is a binary semaphore, and it holds only one give. The second impact of a pair is lost.',
  'The goal: all four impacts stop the motors within 3 ms, and each impact gets its own thermal check within 150 ms. The stage 6 and earlier checks are regression checks now, so they must still pass.',
  'Two stars come from passing the checks. The third star is a lean build: at most 19896 B of RAM, not counting up to 256 B of spare stack per task. A kernel object you no longer use still costs RAM, so keep the footprint in mind whichever fix you choose.',
  'Flash the code as it is and read the chart before you change anything. Count the thermal checks on the bumper row against the impacts on the onBump row.',
];

export const reactions = {
  watchdog: [
    'Task watchdog. A task never gave up the CPU, so the rover reset itself. Find the row that stays solid from end to end in the chart.',
    'Look at the timeout argument of the task wait. A wait with no delay on an empty count never sleeps, and it starves every task below it.',
  ],
  crash: [
    'The rover rebooted. The serial monitor at the bottom says why, and the chart marks the moment of the crash.',
  ],
  fail: [
    'Not there yet. Compare the chart with the objectives, count the thermal checks against the impacts, change one thing and flash again.',
  ],
  pass: [
    'Four impacts, four stops, four checks. If the bumper task counts its own wake-ups, that is a task notification and the semaphore is gone. If you kept a counting semaphore, it works too, but the 96 bytes of the semaphore stay in RAM, which is the saving a notification gives you. Check the RAM figure on the result screen against 20900 B.',
  ],
  isrBlock: [
    'The rover crashed with a message that an interrupt handler cannot block. The handler called a notify function that may wait. Inside an interrupt, use the version of the notify call that ends in FromISR.',
  ],
  isrFlash: [
    'The rover crashed with a cache error. The impact handler wrote to flash, and flash cannot be reached from an interrupt. Keep logging out of onBump(). A task can log later.',
  ],
  stack: [
    'A stack overflow in the bumper task. It calls checkThermals() and needs more room than its stack size gives it. Check the stack argument of the bumper task.',
  ],
  busyLoop: [
    'Task watchdog near 600 ms, and the CPU sits at 100 percent. The bumper task polls for its notification and never sleeps.',
    'Look at the timeout argument of the take call in the bumper task.',
  ],
  slowIsr: [
    'The stop is in time, but onBump() runs for about 8 ms, and the motor and telemetry rows lose their rhythm. The handler is doing the thermal check itself.',
    'The interrupt should only stop the motors and wake the bumper task. The check belongs in the task.',
  ],
  noStop: [
    'The impact is seen, but the chart shows no stop after it. The motors keep running after every impact.',
    'The handler must stop the motors first, before it wakes anyone.',
  ],
  lateStop: [
    'stopMotors() does run, but 2 to 18 ms after the impact, not within 3 ms. The stop waits its turn in the bumper task.',
    'The stop has to happen inside the interrupt handler, before the notify call.',
  ],
  neverWakes: [
    'The bumper task never runs. The chart shows no thermal check after any impact.',
    'Check that the interrupt wakes the bumper task, and that the bumper task waits for a notification and not for the semaphore.',
  ],
  clearsCount: [
    'Two impacts 2 ms apart give one thermal check. The task wakes once for the burst and clears the count.',
    'Check the clear argument of the take call. It decides whether the count is cleared or only decremented by one.',
  ],
  lostImpacts: [
    'Four impacts, but fewer thermal checks. The chart shows no check after the second impact of each pair.',
    'Something holds only one pending give, and the extra give is merged away.',
  ],
  hog: [
    'The bumper task is at or above the motor or telemetry priority, and they miss their deadlines. The rover runs at about 98 percent load, so the bumper stays at priority 1.',
  ],
  regress: [
    'An earlier stage check broke. Your change touched the handler or the bumper task, and the other tasks share the CPU with them. Look for the row that lost its rhythm in the chart.',
  ],
};

export const hints = [
  'Read the chart from the top. Find the impacts on the onBump row, then count the thermal checks on the bumper row after each one. Where do the two counts differ?',
  'A binary semaphore holds one give. A second give that arrives before the task has run is merged and lost. Which mechanism can count the gives for you without a kernel object?',
  'Inside the interrupt, the notify call must end in FromISR. The bumper task takes the notifications with a clear flag of 0, so each notification counts once. Those two lines are the whole fix.',
  'For the RAM star, a semaphore you no longer use still costs 96 bytes. Remove it from the objects list. For the CPU star, check how many checks the bumper runs and whether any delay is added after them.',
];

export const solutionNote = [
  'My version: the impact handler stops the motors, then notifies the bumper task directly. The task keeps its own count of notifications with the clear flag at 0, so every impact gets a check. No kernel object sits between them, and the 96 bytes of the semaphore are gone.',
  'Try a counting semaphore instead of the notification on the start code, and count the checks. Then set the clear flag to 1 and count them again. Which change keeps every impact, and which one merges a burst into one check?',
];
