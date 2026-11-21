// Stage 101: Martian Night. In-game copy only (briefing, reactions, hints, solution note).
// Voice: a calm senior engineer on the radio.

export const briefing = [
  'Good evening, engineer. The rover is parked for the Martian night. Its only job now is the temperature report: every 10 seconds, the outside temperature goes to Mission Control over Wi-Fi.',
  'Added to your firmware: a night task called reporter at priority 2, with a 4096-byte stack. Each cycle it reads the sensor, connects Wi-Fi, sends the reading, and then waits 10 seconds with vTaskDelay().',
  'What must work: at least three readings in 30 seconds, one every 10 seconds, with no driver errors. The battery must last until sunrise, so the average current has to come down to 40 mA or less. Passing needs 40 mA. Two star targets sit below it: 3.5 mA and 2.8 mA. The stars are where the chip\'s sleep modes come in.',
  'Flash the firmware as it is and read the power numbers in the chart before you change anything. Then decide what the rover should do with the radio and the chip while it waits.',
];

export const reactions = {
  watchdog: [
    'Task watchdog. The reporter task ran without giving the CPU back, so the chip reset itself. Check that the loop still waits, and that no step spins in a busy loop.',
    'Find the reporter row in the chart. A solid bar from end to end means the task never yielded.',
  ],
  crash: [
    'The rover rebooted. The serial monitor at the bottom says why.',
  ],
  fail: [
    'Not there yet. Find the red objective in the list and start there.',
    'If reports are late or missing, look at the chart between reports: a wake-up timer that is too short or too long, or code after a deep sleep that never runs. If the reports are fine but the average is high, look at what is still switched on while the task waits.',
  ],
  nowake: [
    'The chart shows one report, then a long empty stretch. The chip went into deep sleep and nothing woke it.',
    'Look at what is armed before the sleep call. With no wake-up source, the chip sleeps until someone presses reset.',
  ],
  lostState: [
    'After a deep sleep the chip has reset. Wi-Fi is down, the reading is gone, and the task starts again from its first line.',
    'The serial monitor shows driver errors, or no reports reach Mission Control at all. Code after the sleep call never runs. Check what must happen before the sleep, and what the first lines after a wake must redo.',
  ],
  tooOften: [
    'Reports arrive far too often, with gaps of a few hundred milliseconds. The chip wakes far too often, and the boot and Wi-Fi cost more than the sleep saves.',
    'The wake-up timer in ESP-IDF takes microseconds, while this game counts milliseconds. Check the number you passed to the timer against the 10 second interval.',
  ],
  wifiOn: [
    'Light sleep is configured, but the radio is still on, so the chip never gets to sleep. The average stays near 100 mA.',
    'Stop Wi-Fi before the wait. In this simulator light sleep only happens while Wi-Fi is off. Real ESP32 modem sleep works with Wi-Fi connected, but it is a different setting, and this lesson leaves it out.',
  ],
  awake: [
    'Reports arrive on time, but the average current stays above 40 mA. Between reports the chip stays fully awake, and the CPU idles at 25 mA while it waits.',
    'Check the radio first, then check whether the chip is allowed to sleep at all.',
  ],
  pass: [
    'Reports are steady and the average is under 40 mA. Each star is a current target: under 3.5 mA earns the light sleeper star, under 2.8 mA the deep sleeper star. Light sleep keeps RAM and the task alive. Deep sleep is cheapest, but it restarts from the first line on each wake. Debrief: stopping Wi-Fi alone gives about 27 mA, because the radio was 80 of the 105 mA. A wake timer given in ms instead of us wakes the chip 153 times in 30 s and draws about 127 mA. A timer 400 ms short fits a fourth report into 30 s and lifts the deep sleep average to about 3.29 mA, which costs the third star.',
  ],
};

export const hints = [
  'The chip is awake while the task waits, and Wi-Fi adds more current than anything else. Watch the power readout while the task waits, and ask what is still switched on between reports.',
  'Two separate changes, and the first is the radio: stop Wi-Fi before the wait, with one call. Then, as a second change, let the chip sleep. Do the radio first and flash, then read the power numbers again.',
  'Light sleep is a setting (.light_sleep_enable = true in the esp_pm_configure() line of the startup code) plus the same delay you already have. Deep sleep is a different shape: set a wake-up timer in microseconds, call esp_deep_sleep_start(), and remember the task restarts from its first line after each wake, so it must redo the read and the Wi-Fi connect there.',
  'The star budget has a window: check how many reports fit in 30 s. RAM is not graded here, so the 4096-byte stack can stay.',
];

export const solutionNote = [
  'The reference stops Wi-Fi after each send, then deep sleeps for 10 seconds on a wake-up timer. Deep sleep is the cheapest state the chip has, and waking is a reset, so every cycle reads and connects again. Nothing has to survive the sleep, so the reference keeps nothing in RAM.',
  'Experiment: switch to light sleep, keep the stop call, and change the interval to 1000 ms. Predict which mode wins at one second before you read the averages. Light sleep should come out cheaper.',
];
