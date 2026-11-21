// Stage 7 copy: Bump in the Night. In-game text only (briefing, reactions, hints, solution note).
export const briefing = [
  'Engineer, the safety team bolted a bumper switch onto the front of TICK-1. Their handler is already in the firmware as an interrupt service routine called onBump. It works, but it is too slow.',
  'Right now onBump stops the motors and then runs checkThermals() on the spot. That check takes 8 ms, and nothing else can run while an interrupt is busy. Every bump costs the motor a step and telemetry a packet.',
  'Your job: the motors must stop within 3 ms of every bump, and the thermal check must follow within 100 ms. Decide what stays in the interrupt and what moves out. The binary semaphore bump_sem is already delivered.',
  'Flash the code as it is and read the chart before you change anything. The first bump is at 150 ms. Watch the motor row and the onBump row. The chart puts the onBump row at the top.',
];

export const reactions = {
  watchdog: [
    'Task watchdog. A task ran for too long without giving the CPU back, so the rover was reset. Check that every loop still has a blocking call, such as vTaskDelay().',
    'The chart shows one row that stays solid from end to end. That row is the task or interrupt that never let go.',
  ],
  crash: [
    'The rover rebooted. The serial monitor at the bottom says why, and the chart marks the time of the crash.',
  ],
  fail: [
    'Not there yet. Compare the chart with the objectives, change the code and flash again.',
  ],
  pass: [
    'Bump handled. The motors stop at once, and the thermal check follows in the task. The interrupt does the urgent part, the task does the rest, and the earlier promises still hold.',
  ],
  isrBlock: [
    'The serial monitor says a blocking call ran inside an interrupt. An interrupt can never wait, so the give has to use the FromISR version. Look at the give call in onBump.',
  ],
  isrFlash: [
    'The rover panicked with a cache error at the first bump. onBump calls logToFlash(), and a flash write cannot run while an interrupt holds the CPU. Flash writes belong in a task.',
  ],
  stack: [
    'The serial monitor reports a stack overflow in task bumper. The task needs room for its own frames plus checkThermals(), which uses 400 bytes. Check the stack size you gave it in xTaskCreate().',
  ],
  busyLoop: [
    'The task watchdog fired near 600 ms, and the chart shows the CPU pinned at 100 percent. bumper never blocks, so it spins and starves every other task. Let it sleep inside its take call instead of polling.',
  ],
  slowIsr: [
    'The chart still shows the thermal check inside onBump. Those 8 ms stall the motor row and push telemetry late. Ask which part of a bump has to happen right now, and which part can wait.',
  ],
  noStop: [
    'The thermal check still runs after each bump, but the stop delays on the chart stay at -1. The motors keep going after the bump. The stop has to happen inside onBump, before the give.',
  ],
  lateStop: [
    'The stop now runs in a task, and a task has to wait for its turn. The chart shows the bump where it waited behind busier tasks and the motors kept turning for too long. A safety action must not depend on the scheduler: keep stopMotors() inside onBump, before the give.',
  ],
  neverWakes: [
    'Nobody wakes up. The chart shows no thermal check after the bumps, so the semaphore is given or taken wrongly. Check that onBump gives bump_sem and that bumper takes the same semaphore.',
  ],
  hog: [
    'The motor or telemetry breaks its gap, so bumper is sitting too high in the priority order. The rover is already 98 percent loaded, so deferred work has to wait behind the timing-critical tasks.',
  ],
  regress: [
    'Bump handling runs, but an earlier promise broke. Look at the rows for the lights, the IMU, the samples and the mapper. The bump work must not change what those tasks do.',
  ],
};

export const hints = [
  'Flash it and read the chart. Find the long solid bar that starts at the first bump. What is running inside the interrupt that could wait until later?',
  'The interrupt has to stop the motors and then hand the rest over. A binary semaphore can carry that hand-over. Which call gives it from an interrupt?',
  'Use xSemaphoreGiveFromISR() in onBump, and let bumper wait on bump_sem before it runs checkThermals(). Choose the priority of bumper from the three tasks already on the rover, keeping the 98 percent load in mind.',
  'For the RAM star: bumper needs 768 bytes for its own frames plus the 400 bytes that checkThermals() uses. Give it a stack a little above that total and check the RAM figure in the stats.',
];

export const solutionNote = [
  'My version: onBump does only what cannot wait, which is stopping the motors. It then gives bump_sem with the FromISR call. On a real ESP-IDF build you would also pass the woken flag to portYIELD_FROM_ISR(); the simulator does that yield for you inside the give, so you never write it here. Because bumper runs at priority 1, it never outranks the interrupted task, woken stays pdFALSE and no switch happens on exit. The 8 ms thermal check moves into bumper at priority 1, the lowest level in use, so it never delays the motor or telemetry.',
  'Try a counting semaphore instead of the binary one, with xSemaphoreCreateCounting(8, 0). The mission bumps are far apart, so the result is the same. Then give onBump two quick gives with no bump in between, and count how many thermal checks follow.',
];
