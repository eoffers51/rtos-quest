// Stage 6 copy: One Bus, Two Masters. Mission control voice, see wheels-and-eyes.js.
export const briefing = [
  'Engineer, two new tasks were added to the rover overnight. The imu task reads attitude every 20 ms, and the thermo task reads temperature every 100 ms. Both sit on the same I2C bus.',
  'The I2C bus runs one transaction at a time. Right now both tasks start their reads without asking each other. When they overlap, the serial monitor prints "I2C collision" and the faults row gets a red mark. The thermal team left a mutex called i2c_lock in app_main(), but no task uses it yet.',
  'Your job: stop the collisions without making either task late, and keep every earlier stage working.',
  'Flash it first and work out which two rows overlap.',
];

export const reactions = {
  watchdog: [
    'Task watchdog. A task never gave the CPU back, so the rover went down.',
    'Look for a task loop that waits on the lock with a zero timeout and never sleeps. Find the task whose row is solid from end to end in the chart.',
  ],
  crash: [
    'The rover rebooted. The serial monitor at the bottom says which task failed and why.',
  ],
  race: [
    'The faults row shows red marks and the serial monitor prints "I2C collision". Both tasks start a transaction while the other one is still on the wire. Neither task asks for i2c_lock first.',
    'Look at the first red mark: which two rows have a bar at the same moment?',
  ],
  oneSided: [
    'The collisions are still there because only one task takes i2c_lock. A lock protects the bus only when every user of the bus takes it.',
    'Check the thermo task as well as the imu task. Which one has no xSemaphoreTake() before its read?',
  ],
  neverReleased: [
    'The serial monitor reports a deadlock. A task is waiting for i2c_lock while it holds the lock itself, or the other task never gave the lock back.',
    'Find the xSemaphoreGive() that matches each xSemaphoreTake(). Every take needs a give on every pass through the loop.',
  ],
  heldTooLong: [
    'The lock is held across a delay. While the thermo task sleeps inside its critical section, the imu task waits, and its reads slip past the 40 ms limit.',
    'Compare the imu row with the thermo row on the chart. Where does the thermo task sleep, and where is the give?',
  ],
  missing: [
    'A read rate is too low, and the collisions are gone. Either a task is missing from app_main() or it does not run often enough.',
    'Count the reads each task makes in one second and compare them with the goals. Each task needs its own xTaskCreate() and a vTaskDelay() that matches its period.',
  ],
  hog: [
    'An earlier objective broke. A task is spinning on the lock, and the CPU time it takes is missing from the lower tasks.',
    'Check the timeout passed to xSemaphoreTake(). A zero timeout returns at once, so the task loops and burns CPU that the telemetry and motor tasks need.',
  ],
  fail: [
    'Not there yet. The bus objective is the first one to check. Compare the faults row with the goals, change the code and flash again.',
  ],
  pass: [
    'Bus clean, both devices on time, and the earlier stages still hold. One lock, held for one transaction, was all it took.',
  ],
};

export const hints = [
  'Flash it and read the faults row. The first red mark tells you when two transactions overlap. Which two rows are solid at that time?',
  'Both tasks share one bus, and i2c_lock exists in the start code but nobody uses it. Which call takes a mutex, and which call gives it back?',
  'Hold the lock for one transaction only. Put the take right before the read, and the give right after it, with no delay in between.',
  'For the RAM star: each new task needs 768 bytes plus 400 bytes for its i2c read, so the peak is 1168 bytes. Add a margin: up to 256 bytes of spare stack per task do not count against the star. Check the RAM counter on the screen after each change.',
];

export const solutionNote = [
  'My version: the bus is a shared resource, so each task takes i2c_lock before it starts a transaction and gives it back as soon as the transaction ends. The mutex starts available, so the first take succeeds at once. Neither task sleeps while it holds the lock.',
  'Try it on the reference: move the give to just before the delay and watch the imu gap on the chart grow past 100 ms. Then ask what the ESP-IDF i2c_master driver already does for you, and why the pattern is still worth learning.',
];
