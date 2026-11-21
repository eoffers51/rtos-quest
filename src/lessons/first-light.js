// Lesson 1: tasks, the Blocked state and the idle task.
import { g, d, bz, task, pinT, gapsOf, B } from '../kernel.js';
import { manual, realCode, quiz } from './first-light.content.js';

const steady = (a, period, min) => a.length >= min && gapsOf(a).every(x => Math.abs(x - period) <= 2);
const seen = a => a.length > 1 ? 'intervals seen: ' + [...new Set(gapsOf(a))].slice(0, 4).join(', ') + ' ms' : a.length + ' toggle(s)';

export const lesson = {
  id: 1, title: 'First Light', topic: 'Tasks, the Blocked state and the idle task',
  T: 3000, cores: 1, pins: ['BEACON', 'HEART'], ops: ['gpio', 'delay', 'busy'], fns: [],
  goals: ['BEACON toggles every 500 ms', 'HEART toggles every 200 ms', 'CPU is idle at least half of the time'],
  start: () => ({ objs: {}, units: [task('mainLoop', 1, [g('BEACON'), bz(500), g('HEART'), bz(200)])] }),
  // reference solution, loaded by the SOLVE button
  solution: () => ({ objs: {}, units: [
    task('beacon', 1, [g('BEACON'), d(500)], { stack: 1024 }),
    task('heart', 1, [g('HEART'), d(200)], { stack: 1024 }),
  ] }),
  solutionNote: ['Here is my version. app_main() creates two tasks, one per light. Each toggles its pin and then calls vTaskDelay(), so it is Blocked almost all the time and the CPU stays idle.', 'Your own code is replaced in the editor. Change the numbers and flash again to see what breaks.'],
  check: K => {
    const b = pinT(K, 'BEACON'), h = pinT(K, 'HEART');
    return [[steady(b, 500, 5), seen(b)], [steady(h, 200, 13), seen(h)], [K.m.cpu <= 50, `CPU load ${K.m.cpu}%`]];
  },
  // chart evidence: bracket the first interval between two edges of an LED that is not the required one
  evidence: K => { for (const [pin, want] of [['BEACON', 500], ['HEART', 200]]) { const e = pinT(K, pin); for (let i = 1; i < e.length; i++) if (Math.abs(e[i] - e[i - 1] - want) > 2) return [{ unit: K.units[0].name, from: e[i - 1], to: e[i], label: `${e[i] - e[i - 1]} ms between ${pin} edges, not ${want}` }]; } return []; },
  bonus: B(5, 1600),
  briefing: [
    'TICK-1, Flight here. Touchdown confirmed. Welcome to Mars.',
    'Your rover runs ESP-IDF on FreeRTOS. Its firmware is open on your left: app_main() creates the tasks (a task is one function the scheduler runs), and each task function sits below it. First job: lights. BEACON must toggle every 500 ms and HEART every 200 ms so the orbiter can find you.',
    'The last engineer wrote a super loop: one endless loop that does everything in turn. Flash it once and watch what happens, then fix it. The THEORY step in the top bar is always there if you want to look something up.',
  ],
  reactions: {
    watchdog: [
      'There it is: the task watchdog. esp_rom_delay_us() is a busy-wait, so the task never lets go of the CPU. The idle task (the one that feeds the watchdog and runs only when every other task waits) starved, and the chip reset itself. Look at the IDLE row in the chart: empty.',
      'Swap the busy-waits for vTaskDelay(). A delayed task is Blocked, meaning it waits without using the CPU, and a blocked task costs nothing.',
    ],
    rhythm: ['No crash this time. But one loop cannot keep two rhythms: look at the intervals in the objectives. Give each light its own task with "+ TASK".'],
    swapped: ['Both lights are steady, but on each other\'s rhythm: BEACON should toggle every 500 ms and HEART every 200 ms. Check the vTaskDelay() value in each task.'],
    busy: ['The rhythms are right, but the CPU is still busy. Some task is not Blocked while it waits. Look at the CPU row in the chart and check that every wait is vTaskDelay(), not a busy-wait.'],
    crash: ['The rover rebooted. The serial monitor at the bottom says why. If it says stack overflow, a task\'s stack is too small: raise the size in its xTaskCreate line (768 bytes is the minimum for this simulator).'],
    fail: ['Not there yet. Compare the logic analyzer with the objectives, change the code and flash again.'],
    pass: ['Both lights steady and the CPU asleep most of the time. That is how firmware should look. Nice work, engineer.'],
  },
  // skip hints about a problem the learner has already solved: after the crash is gone start at the two-rhythms hint, after a pass at the RAM hint
  hintFloor: (K, res) => !K || K.crash ? 0 : res && res[0][0] && res[1][0] ? 3 : 2,
  hints: [
    'Open the timing chart. Which row is full and which is empty? What would the empty one need to run?',
    'esp_rom_delay_us() is a busy-wait: it keeps the task Running, so nothing else on that core gets a turn, not even the idle task that feeds the watchdog. vTaskDelay() puts the task in the Blocked state instead.',
    'One loop cannot hold two rhythms. Press "+ TASK": a new xTaskCreate line appears in app_main() and a new task function below. Give each LED its own task: toggle the pin, then vTaskDelay.',
    'For the RAM star (up to 256 bytes of spare stack per task do not count against it): a task that only toggles a pin and sleeps needs little more than the 768-byte minimum stack. Edit the stack size in its xTaskCreate line. The results screen shows how much of each stack was never used.',
  ],
  // Wrong answers the verifier replays against the solution: each must fail the listed objectives (by index).
  wrong: [
    { name: 'busy-wait instead of vTaskDelay', apply: p => { p.units[0].code[1] = bz(500); }, crash: 'task_wdt' },
    { name: 'both LEDs in one task', apply: p => { p.units = [task('both', 1, [g('BEACON'), d(500), g('HEART'), d(200)])]; }, fails: [0, 1], says: 'rhythm' },
    { name: 'periods swapped', apply: p => { p.units[0].code[1].ms = 200; p.units[1].code[1].ms = 500; }, fails: [0, 1] },
    { name: 'stack below the minimum', apply: p => { p.units[0].stack = 512; }, crash: 'stack overflow' },
  ],
  manual, realCode, quiz,
  file: 'main/first_light.c',
  // which mission-control reaction fits this failed run
  diagnose: (K, res) => {
    const b = pinT(K, 'BEACON'), h = pinT(K, 'HEART');
    if (!res[0][0] && !res[1][0] && steady(b, 200, 13) && steady(h, 500, 5)) return lesson.reactions.swapped;
    if (res[0][0] && res[1][0] && !res[2][0]) return lesson.reactions.busy;
    return res[2][0] && (!res[0][0] || !res[1][0]) ? lesson.reactions.rhythm : lesson.reactions.fail;
  },
};
