// Stage 3 (Steady Pulse) in-game text: mission control briefing, reactions, hints and solution note.
// Voice: calm senior engineer on the radio. Written from specs/stage-03.md.

export const briefing = [
  'Engineer, the science team has bolted a spectrometer onto the mast. It must be sampled at exactly 50 Hz, one sample every 20 ms, or the spectra smear together.',
  'Their task is in your firmware now, after the stage 2 tasks. It is called spectro. It runs sampleSpectrometer() and then vTaskDelay(20), at priority 1 with a 1280 byte stack.',
  'Watch the chart for a few seconds. The spectro task does not wake every 20 ms, and it falls further behind the clock on every lap. Work out why before you change anything.',
  'Flash the code as it is first. Then change only the spectro task and flash again.',
];

export const reactions = {
  watchdog: [
    'Task watchdog. The spectro loop never blocks, so it starves the idle task and the watchdog fires. Every task loop needs a delay in it.',
    'Find the spectro row in the chart. It stays solid from end to end with no gap where a delay should be.',
  ],
  crash: [
    'The rover rebooted. The serial monitor names the cause in its first error line. Read that line before you change the code.',
  ],
  fail: [
    'Not there yet. Compare the chart with the five objectives, and change one thing at a time before you flash again.',
  ],
  pass: [
    'Sampling at exactly 50 Hz, and the motor, telemetry and lights are still on time. You kept the period fixed while the work changed. Some starts are still a few ms off the grid: that is jitter, allowed up to 25 ms. Drift would keep growing.',
  ],
  drift: [
    'The spectrometer count is low and the samples arrive later and later. Each sample starts later than its slot, and the gap is always more than 20 ms because the delay is counted from the end of the work, so each lap adds the 3 to 7 ms of sampling. Shortening the number only fits one average; the work takes 3 to 7 ms. Look for a call that waits until a fixed time instead.',
    'Keep the 20 ms period. Only the way the wake-up time is counted needs to change.',
  ],
  hog: [
    'Sampling is steady now, but the motor or the telemetry miss their deadlines. The spectro task was given a priority above work with tighter slack.',
    'A drift of 25 ms is allowed, so the spectro task does not need to be on top. Look at where it sits in the priority list.',
  ],
  lights: [
    'The lights are off the beat. They wake on time but then wait behind a busier task. Check which task sits above them and how much CPU it takes.',
  ],
};

export const hints = [
  'Look at the gaps between spectro starts in the chart. Each gap is longer than 20 ms, so every sample starts a little later than its slot. Ask what the delay is counted from.',
  'The sample call takes 3 to 7 ms. vTaskDelay(20) counts 20 ms from the moment it is called, which is after that work. Which call counts the period from a fixed starting time instead?',
  'Keep a variable that holds the last wake time, started from xTaskGetTickCount(). Each lap, wait until that time plus 20 ms, so the work time is taken out of the wait.',
  'For the RAM star, a big stack is not needed. Give spectro the 768 byte base plus the 500 bytes that sampleSpectrometer() needs, with a small margin. The CPU star is harder: the spectrometer adds about a quarter of the CPU, so the rest of the work decides it.',
];

export const solutionNote = [
  'My version samples on a fixed grid. vTaskDelayUntil wakes the task at the last wake time plus 20 ms, so the work time is absorbed by the wait and the period never drifts. The spectro task stays at priority 1 on purpose, because a higher priority pushes the telemetry and motor deadlines out.',
  'Predict first, then set the spectro priority to 3 and flash. Which objective fails first, and what is the worst motor gap now?',
];
