// Stage 12 copy: mission control briefing, reactions, hints and solution note. Voice: calm senior engineer on the radio.

export const briefing = [
  'Good news, engineer. The data-bus team has bolted two tasks onto the rover: bus_mgr at priority 2 and weather at priority 1. Both share one lock, bus_lock, to use the instrument bus.',
  'bus_mgr must exchange data on the bus every 100 ms. weather publishes a report every 190 ms and holds bus_lock for the 9 ms the publish takes. The camera task has moved to a slower rate, first frame at 240 ms, to make room.',
  'The goal: all nine exchanges finish within 30 ms of their slot, and every earlier stage still passes. The camera, arm and focus work must not get stuck behind the lock. Your stage 11 firmware is still in there.',
  'Flash it as it is and read the chart before you change anything. The late exchange is the first clue.',
];

export const passState = { type: 'mutex', wPrio: 1 }; // set by check() just before the result screen reads reactions.pass

export const reactions = {
  watchdog: [
    'Task watchdog. A task is spinning without blocking, so the idle task never gets the CPU. Check that every loop in the new tasks still waits on a take, a give or a delay.',
    'Find the task whose row is solid from end to end in the chart. That is the one that never gives the CPU back.',
  ],
  crash: ['The rover rebooted. The serial monitor at the bottom says why.'],
  fail: ['Not there yet. Compare the chart with the objectives, change the code and flash again.'],
  get pass() {
    if (passState.type === 'mutex') return ['Every exchange lands on its slot, the lock is held briefly, and the older stages still run. You have just fixed a priority inversion.'];
    if (passState.wPrio >= 2) return ['Every exchange lands, but look at how. It works here only because weather sits at priority 2. Add another task at 2 or 3 and the stall returns. A mutex fixes it at any priority. Try it.'];
    return ['Every exchange lands, but look at how. It works here only because the lock is held for a short moment. Make that part longer and the stall returns. A mutex fixes it at any length. Try it.'];
  },
  observe: [
    'One bus exchange ended far later than its slot. Look at the bus_mgr row at that moment: what was it waiting for, and who held it?',
  ],
  inversion: [
    'bus_mgr waits for bus_lock, and the chart shows weather holding it while camera, spectro and nav run ahead of weather (scroll up in the chart: camera, spectro, nav run while weather waits). weather is the task that must finish, but nothing lifts it.',
    'A binary semaphore has no owner, so the kernel does not know whom to boost. Look at the type of bus_lock in the editor. Which object type records who holds it?',
  ],
  bmTooLow: [
    'bus_lock now records its owner, so inheritance works. But bus_mgr is no higher than weather, so lifting weather only puts it level with the crowd. The waiter has to be above the tasks that are running.',
  ],
  sleepsHolding: [
    'weather is not starved here. It takes the lock and then sleeps while holding it. A delay inside the critical section keeps bus_lock for the whole wait, and no priority can shorten that.',
  ],
  forgotGive: [
    'bus_mgr waits for bus_lock, and weather is no longer running. weather took the lock and never gave it back. Check that every take has a matching give in the same task.',
  ],
  starved: [
    'weather never gets far enough to publish. It is the lowest task in the rover, so the camera, spectro and nav keep the CPU ahead of it.',
    'weather publishes nothing. Its row in the chart wakes every 190 ms and never reaches publishWeather(). Which call is missing from its code?',
  ],
  noLock: [
    'Some bus, arm or camera call runs without holding the lock it needs. The kernel counts each one, and the stats line at the bottom shows how many.',
    'exchangeData() and publishWeather() need bus_lock. Each task must take it before the call and give it after. Check both tasks.',
  ],
  hog: [
    'Your fix works on the bus, but the motor now misses its 10 ms rhythm. A very high priority on weather or bus_mgr lets it run ahead of motor, and motor waits behind it.',
    'The cure has to be local to the lock. Raising a task far above the crowd is the wrong tool here, because it hurts the wheels.',
  ],
  giveNotHeld: [
    'bus_mgr gives bus_lock twice. The second give happens when it does not hold the lock, and the kernel stops the rover. Find the give that has no take before it.',
  ],
  stack: [
    'A stack overflow. The task has less stack than its calls need. The stack size is the argument of xTaskCreate() for that task.',
  ],
  busyLoop: [
    'The task watchdog fired while a task was spinning. A loop with no delay keeps the idle task from running. Put a delay or a take in the loop that spins.',
  ],
  regress: [
    'The bus is fixed, but an earlier stage now misses its deadline. The new priority moved something else off the CPU. Look at which earlier row gets faded.',
  ],
};

export const hints = [
  'Flash it and read the chart. Find the exchange whose bar starts late. What is bus_mgr waiting for in its row, and who holds it during that time?',
  'bus_mgr, the high task, waits for a lock that weather, the low task, holds, and weather is kept off the CPU by tasks that have nothing to do with the bus. Why can the kernel not help weather finish? Look at what the lock records.',
  'Look at the type of bus_lock in the editor. Only one of the three kinds records its owner, and so can lift the holder to the waiter priority. Change the type and run it again.',
  'For the RAM star: each new task needs its own code plus the deepest function it calls, and nothing much more. Give each one a stack just above that, not a round number far above it.',
];

export const solutionNote = [
  'A mutex records its owner, so the kernel can lift weather to the priority of bus_mgr while bus_mgr waits. The lock is held for the same 9 ms as before, and the fix is one type change.',
  'Try moving formatWeather() out of the lock, so only copyToBus() is inside it. Does the exchange stay within 30 ms with the binary lock still in place?',
];
