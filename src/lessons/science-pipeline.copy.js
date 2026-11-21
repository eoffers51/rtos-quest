// Stage 5 copy: Science Pipeline (queues). Mission control voice, per specs/stage-05.md.

export const briefing = [
  'Good news, engineer. The science team has mounted a mass spectrometer on the mast. It produces a burst of five samples, 20 ms apart, and it keeps only the newest one. An unread sample is overwritten inside the instrument.',
  'The radio team supplied transmit(x). It blocks for 45 ms. Right now a single task reads a sample and then transmits it, so the instrument writes over the samples that arrive while the radio is busy. Only six of the ten samples reach Earth.',
  'Your job is a queue called samples between the two. The reader must never wait for the radio. The radio drains the backlog at its own speed. The earlier goals still apply: the motor, telemetry, the lights and the mapper must keep working.',
  'Flash the code as it is and read the chart before you change anything. Watch where the science row stops reading while transmit() runs.',
  'The queue object already exists but nothing uses it. Check its length against the burst.',
];

export const reactions = {
  watchdog: [
    'Task watchdog. A task ran without giving the CPU back, and the rover reset. Look for a loop that never reaches a delay or a blocking queue call.',
    'Find the task whose row is solid from end to end in the chart. A task that waits on a queue shows gaps where it is blocked.',
  ],
  crash: [
    'The rover rebooted. The serial monitor names the task that overflowed its stack. That task needs more room in its stack size.',
  ],
  fail: [
    'Not there yet. Compare the chart with the five goals, change the code, and flash again.',
  ],
  pass: [
    'Ten of ten samples, in order, nothing overwritten and nothing dropped. The reader never waits for the radio, and the radio drains the queue at its own pace. That is the producer and consumer pattern, built on a queue.',
  ],
  oneTask: [
    'Still one task. The reader calls transmit() itself, so it is blocked inside transmit() for 45 ms (the dotted part of its row), and the instrument overwrites what arrives in that time.',
  ],
  lowPrio: [
    'The reader is not above the camera. At the same priority the camera shares the CPU with science, and the reader misses its window. Compare the priority of the reader with the priority of the camera.',
  ],
  shortQueue: [
    'The queue is too short for a burst. Samples arrive 20 ms apart and the radio needs 48 ms per packet, so the backlog grows past one slot. Look at the length of the samples queue and count how many samples must wait at once.',
  ],
  backlog: [
    'Samples are lost while the queue still fills. The radio is not draining it fast enough. Look at the radio row: where does it sleep between packets, and for how long?',
  ],
  dropped: [
    'Samples go missing without being overwritten. The queue is full and the send call gives up instead of waiting for room. The reader should wait for space, not throw the sample away. Check the timeout on the send call.',
  ],
  empty: [
    'The radio sends packets with nothing in them. Its transmit() call gets no sample, because the radio never takes one from the queue. Look at what the radio task does before it calls transmit().',
  ],
  hog: [
    'An earlier goal broke. Something new is taking CPU time from the motor or the telemetry, and their gaps grew past the limit.',
    'Check the priority of radio against the motor. The radio is slow but not urgent, so it must stay below the tasks with the tightest deadlines.',
  ],
};

export const hints = [
  'Flash it and look at the science row. It sits in a dotted blocked line for about 45 ms each time transmit() runs. What does the instrument do to samples that arrive meanwhile?',
  'Two jobs need two tasks: one that reads the instrument and one that sends. What must the reader never wait for? Think about what the queue is for.',
  'The radio has nothing to do until a sample exists: which timeout lets it wait without using CPU? And the reader must not give a sample up: which timeout waits for room?',
  'Priority decides who runs when two tasks are ready. The reader has the tighter deadline, so it belongs above the camera. The radio is slow but not urgent, so it belongs below the motor.',
  'For the RAM and CPU stars: a task needs its own 768 bytes plus the deepest function it calls, so the reader needs about 1170 and the radio about 1970. A queue of length 3 holds one burst with a spare slot. Blocking on the queue, instead of polling it, keeps the CPU star.',
];

export const solutionNote = [
  'My version: the reader only reads a sample and puts it in the queue, so it never waits for the 45 ms radio. The radio does the slow part on its own. The queue holds the backlog of one burst, and both tasks block on it, so neither spends CPU waiting.',
  'Try this on your own build: set the queue length to 1 and flash it. Find the first red mark in the faults row, and note the time. Then set the length back to 3.',
];
