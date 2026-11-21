// Stage 10 copy: All Systems Go (event groups). In-game text only; the lesson logic lives in the stage file.

export const briefing = [
  'Flight here, engineer. The comms team wants the day\'s science packet sent to Earth. The ground station rejects any packet that goes out before the radio link is up, the clock is synced and the rover has a position fix.',
  'Three bring-up tasks were added: radio_link, time_sync and gps_fix. Each one finishes at its own time, twice per test. Each gives ready_sem when it is done, and uplink takes it. Someone also created an event group, sys_ev, with the bits LINK_UP, TIME_OK and FIX_OK. Nothing uses it yet.',
  'What must work: the ground station rejects no packet, and each window sends exactly one packet within 60 ms of the last of the three being ready. Your stage 9 checks stay on: packets handled on time, the mast stowed, the motors and sensors on schedule.',
  'Flash the firmware as it is and read the uplink row before you change anything. The log names what was missing when the first packet went out.',
];

export const reactions = {
  watchdog: [
    'Task watchdog. The rover is nearly fully loaded, and a task that never blocks takes the whole system down with it. The uplink row is solid from end to end, so that task is not waiting.',
    'Look at the timeout in the uplink wait. A wait that returns at once gives the CPU no reason to rest. The wait should block until the bits arrive.',
  ],
  crash: [
    'The rover rebooted. The serial monitor at the bottom says why.',
  ],
  stack: [
    'Stack overflow in uplink. The task has less room than the send call needs on top of its own frame. The serial monitor names the task.',
    'Count the bytes: a task needs its own 768 bytes plus the deepest rover function it calls. Check the stack size you gave uplink in its task call.',
  ],
  countsGives: [
    'Uplink takes ready_sem three times, but a semaphore only counts gives. It cannot tell which of the three facts is true, so the count can be met by the same fact twice.',
    'Ask what each give means. A count of three is not the same as three different things being ready.',
  ],
  sendsEarly: [
    'The first give woke uplink, and it sent with only the radio up. The log lists what was still missing. A semaphore cannot say which fact arrived, so the first give is taken as a go.',
  ],
  anyBit: [
    'The wait returns as soon as one bit is set. Only one of the three things had happened when the first packet went out. Which wait mode returns only when every bit in the mask is set?',
  ],
  setsEarly: [
    'The rejected packet went out in the first few tens of milliseconds, before any bring-up task had finished its work. A bit set before the work is done tells uplink a lie. Set each bit after the call that makes it true.',
  ],
  oneBit: [
    'The wait names one bit only, so the other two bring-up tasks are ignored. The log shows a packet rejected for something the wait never checked. Wait for the mask that holds all three bits.',
  ],
  stillSemaphore: [
    'Uplink never sends. It still waits on ready_sem, and no task gives that semaphore any more. The three facts are bits in sys_ev now, so uplink has to wait on the event group instead.',
  ],
  falseBit: [
    'A ready bit was set before the call that makes it true had finished. No packet was rejected this time, but only because another fact arrived later and hid it. Set each bit after its bring-up call, never before.',
  ],
  wrongBit: [
    'A bring-up task set a bit that belongs to another task. The chart marks where. That bit now says something is ready that is not, and the bit for its own work is never set, so uplink waits or sends at the wrong moment. Each task sets only the bit for the work it has just finished.',
  ],
  missingBit: [
    'One packet went out, and then uplink waited for a bit that never came. One of the three bits was set fewer times than there are windows. Check that each bring-up task sets its own bit after every bring-up call: not only the first time, and not the bit of another task.',
  ],
  neverSends: [
    'Uplink never sends. One of the three bits is never set, or it is set on the wrong bit, so the wait stays blocked. The chart shows a bring-up row that never gives. Check the bit each task sets.',
  ],
  oneWindow: [
    'One packet went out, and the second window is missing. A wait clears the bits it satisfied when it returns. Each window needs all three bits set again. Look at what is still set after the first send.',
  ],
  hog: [
    'A bring-up task or uplink sits at the wrong priority, and the rover runs out of idle time. Compare the priority of each new task with the existing ones. Idle time is the margin the rest of the rover depends on.',
  ],
  regress: [
    'A check from an earlier stage fails. The new code is taking CPU time or stack from a task that already worked. Find the row in the chart that changed.',
  ],
  fail: [
    'Not there yet. Compare the chart with the objectives, change the code and flash again.',
  ],
  pass: [
    'Each bring-up task sets its own bit, and uplink waits for all three together. The ground station accepts both packets, and the stage 9 work is still on time.',
  ],
};

export const hints = [
  'Flash it and read the uplink row. Where is the first packet, and what does the log say was missing?',
  'A semaphore only counts gives. You need a value that says which of the three facts is true, and a wait that returns only when all of them are. Look at xEventGroupSetBits and xEventGroupWaitBits.',
  'Each bring-up task sets its own bit after its work is done. uplink waits on the three bits together. The wait clears the bits it satisfied, so think about what the second window needs.',
  'For the RAM star, delete ready_sem. Nothing uses it, and it costs bytes. For the stacks, count 768 bytes plus the deepest call of each task. The uplink stack must cover the send call, too.',
];

export const solutionNote = [
  'My version: each bring-up task sets its own bit once its work is done, and uplink waits for all three bits together. A bit says whether a fact is true, so setting it twice changes nothing, and the wait returns only when the whole mask is set.',
  'Change the wait so that it returns only after LINK_UP and TIME_OK are set, then flash it and read the uplink row. Where does the packet go, and what does the log say?',
];
