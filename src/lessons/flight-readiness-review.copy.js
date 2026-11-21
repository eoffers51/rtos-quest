// Stage 14 in-game text: Flight Readiness Review. Voice: mission control on the radio.

export const briefing = [
  'Engineer, the rover is on the pad for its flight readiness review. The review team added one task to the firmware: diag. Every 150 ms it allocates a frame buffer, logs the status and writes a snapshot to flash.',
  'They also subscribed motor, camera and science to the task watchdog. A subscribed task must call esp_task_wdt_reset() on every pass, or the chip resets when the timeout passes. The timeout in this game is 300 ms, not the 5 s default of ESP-IDF.',
  'What must work: the rover survives the whole test, and stages 1 to 13 still pass. The objectives list the rest.',
  'Flash the code as it is. Read the chart and the serial monitor before you change anything. The first failure will tell you where to look.',
];

export const reactions = {
  coreFull: [
    'This reset is the other kind of watchdog trip: no subscribed task is named, the idle task of one core is. That core had no spare time for 600 ms. The chart marks the core and what filled it.',
    'Compare the load of the two cores. Housekeeping work belongs on the core that has time to spare, at a low priority.',
  ],
  watchdog: [
    'Task watchdog. A subscribed task went longer than the timeout without feeding the dog, so the chip reset. The serial monitor names the task. Check how long that task waits between its reset calls.',
    'Compare its sleeps and hardware waits with the 300 ms timeout. A task that legitimately waits longer than the timeout cannot stay subscribed in its current form.',
  ],
  crash: [
    'The rover rebooted. The serial monitor at the bottom says why. Read the first line of the message before anything else.',
  ],
  fail: [
    'Not there yet. Work through the objectives in order and fix the first one that is red. The chart shows which task is involved.',
  ],
  pass: [
    'Flight ready. The motor is watched and fed, the heap ends where it started, and every task keeps at least 32 bytes of spare stack. The rover now tells you when something is wrong, and why.',
  ],
  noWatch: [
    'Nothing is subscribed to the task watchdog, so a hung task would go unnoticed. The watchdog only protects the tasks you subscribe. Look at the motor first: it must step every 8 ms.',
  ],
  neverFeeds: [
    'A task subscribed to the watchdog must also reset it. Subscribing without resetting means the timeout will pass on every run. Look at what runs on each pass of a watched loop.',
  ],
  doubleFree: [
    'The heap ends higher than it started. More memory was given back than was taken, which corrupts the heap. Count the allocations and the frees in diag, one for one.',
  ],
  thinStack: [
    'Some tasks have less than 32 bytes of unused stack. A stack with no spare bytes is one bad path away from an overflow, even when this run did not overflow. The stack table lists the peak use of each task.',
    'Size each stack at its peak plus a margin. Do not size it at exactly the peak, and do not size it by guessing.',
  ],
  fewLogs: [
    'Diag wrote fewer than six snapshots, or some came more than 100 ms after their slot. Check how often diag wakes and how long each snapshot takes to reach flash.',
  ],
  diagHog: [
    'The hazard path misses its deadlines while diag runs. Diag is housekeeping and can wait for the CPU. Compare its priority with the priority of vision and fusion.',
  ],
  regress: [
    'An earlier stage broke. Find the task whose row changed in the chart, then read the objective of the stage that owns it. Fix that first, then return to this stage.',
  ],
  stack: [
    'The stack overflow message names the task. Read its peak use and its stack size in the stack table, then give it the peak plus a margin.',
  ],
  heap: [
    'pvPortMalloc returned NULL, so the heap is empty. Something allocates and never frees. Find the task whose allocations outnumber its frees, and watch heap_caps_get_free_size() fall over several passes.',
  ],
};

export const hints = [
  'Read the first line of the crash. Which task does the watchdog name, and how long does that task take on each pass of its loop?',
  'Diag allocates a frame on every pass. Read its list of calls and find the call that gives the frame back.',
  'Two ways out for a task whose work is longer than the timeout: stop watching it, or feed the dog between its phases. Which keeps the protection?',
  'For the RAM star: each stack is its peak use plus a margin of at least 32 bytes. Up to 256 bytes of spare stack per task are not counted. Beacon and heart use only the 768 byte base, so 800 bytes gives them margin. Diag has a 2168 byte peak.',
];

export const solutionNote = [
  'My version stops watching camera and science. Feeding camera between its two phases also works and keeps the protection. Either way the longest gap between resets must stay under 300 ms. Diag frees its frame on every pass, and each stack is its peak use plus 32 bytes.',
  'Try diag at priority 2 and read the worst delay of vision against its 25 ms limit. Then explain to yourself why a low priority protects the hazard path.',
];
