// Stage 9 copy: Fold the Antenna. Text only, written from specs/stage-09.md.

export const briefing = [
  'Engineer, the comms team fitted a high-gain antenna on a folding mast. It unfolds when a ground-station pass starts and must fold again after the pass ends.',
  'The comms team added the packet queue rx_q, the packet interrupt onPacket, the antenna task and a software timer stow_tmr with its callback onStow. Nothing starts the timer yet.',
  'What must work: every packet handled within 60 ms of arriving, the mast stowed once per pass 180 to 250 ms after the last packet, and unfolded once per pass. The earlier stages must still pass: bump stop, thermal checks, IMU, mapper, spectrometer and telemetry.',
  'A pass is a burst of packets less than 150 ms apart. Today\'s test has two passes.',
  'Flash the firmware as it is and read the chart before you change anything. The chart shows which task holds the packets back.',
];

export const reactions = {
  watchdog: [
    'Task watchdog. A task ran for too long without blocking, and the idle task never got the CPU. Check every loop that spins without a delay or a wait.',
    'Find the row that stays solid from start to end in the chart.',
  ],
  crash: [
    'The rover rebooted. The serial monitor at the bottom says why, and the chart shows where it happened.',
  ],
  fail: [
    'Not there yet. Compare the chart with the objectives, change the code and flash again.',
  ],
  pass: [
    'Packets are handled on time, and the mast folds once after each pass and stays out during it. The timer does the waiting, so the antenna task never sleeps.',
  ],
  isrBlock: [
    'xTimerReset() was called inside onPacket, and an ISR can never block. Keep the interrupt to putting the packet on the queue, and let the antenna task reset the timer.',
  ],
  timerBlocks: [
    'A timer callback tried to block. Callbacks run in the timer service task, and every other timer waits behind them. Keep onStow to one short call that never waits.',
  ],
  stack: [
    'A stack overflow in the antenna task. The task calls more than one function, and its stack must hold the deepest of them. Compare the stack size in the task line with the stack need in the comments.',
  ],
  heavyCallback: [
    'The watchdog fired after onStow ran. The callback does work that is not a fold, so it holds the timer service task too long. The callback should only fold the mast, and long work belongs in a task.',
  ],
  busyLoop: [
    'The watchdog fired while the antenna task was spinning. Polling the queue with a zero wait keeps the task on the CPU. Let the receive wait for the next packet instead.',
  ],
  blocked: [
    'Some packets wait in rx_q for hundreds of milliseconds. Look at the antenna row in the chart around the packet marked late: what is that task doing while the packet waits?',
  ],
  phantom: [
    'handlePacket() ran when no packet had arrived. A packet is only there after xQueueReceive() returns one, so handlePacket() belongs in the antenna task, right after the receive. Keep onStow to the one short call that folds the mast.',
  ],
  foldsMidPass: [
    'The mast folds in the middle of a pass. Either the timeout is too short or the mast is stowed twice. Count the stow events in the chart: the goal is one stow per pass.',
  ],
  noDeploy: [
    'The mast never unfolds for the pass. stowAntenna runs, but the antenna task never calls deployAntenna. Check the list of calls in the task.',
  ],
  neverStows: [
    'The mast never folds. The timer never expires, so onStow never runs. Check that the antenna task resets stow_tmr, and that the timer is not stopped or left unstarted.',
  ],
  repeatStow: [
    'The mast folds more than once per pass. Either the timer reloads on its own, or the callback stows twice. Check the reload setting of stow_tmr and the calls in onStow.',
  ],
  stowTiming: [
    'The mast folds at the wrong time after the last packet. Measure the gap in the chart and adjust the period of stow_tmr until the stow lands 180 to 250 ms after the last packet.',
  ],
  hog: [
    'The antenna task is above the wheel or telemetry tasks in priority, and they miss their deadlines. The system is about 98 percent loaded, and a 3 ms packet handler belongs at priority 1.',
  ],
  regress: [
    'An earlier stage stopped working. The new antenna code must not change the bump stop, the thermal checks, the IMU or the telemetry. Find the objective that failed and check the task that owns it.',
  ],
};

export const hints = [
  'Flash it and read the chart. Which packet waits longest in the queue, and which task is asleep while it waits?',
  'The antenna task should never sleep. The mast needs a timeout that starts after each packet, not a delay inside the task.',
  'A software timer runs its callback when the period has passed. What happens to that period if you reset the timer each time a packet arrives?',
  'Near answer: replace vTaskDelay and the direct stowAntenna call with xTimerReset(stow_tmr, ...) right after the receive.',
  'For the RAM star, size the antenna stack to what the task really calls and add the queue and timer as they are. For the CPU star, the margin is tiny, so do not add work to the task.',
];

export const solutionNote = [
  'My version: the antenna task waits for a packet, deploys the mast, restarts the timer and then handles the packet. Nothing in the task sleeps, so the queue never fills. The timer is a restartable timeout: it expires only when no packet has come for the full 200 ms, so the mast folds once per pass.',
  'Your next experiment: set the period of stow_tmr to 150 ms, then to 260 ms, and read the stow gap against the 180 to 250 ms window. Then set the timer to auto-reload and count the folds in the chart.',
];
