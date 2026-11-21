// Stage 2: priorities and preemption. Builds on the firmware from stage 1:
// the player's own beacon/heart tasks stay in, and three new tasks are bolted on next to them.
import { c, d, task, pinT, gapsOf, maxGap, S_, E_, B } from '../kernel.js';
import { lesson as stage1 } from './first-light.js';
import { manual, realCode, quiz } from './wheels-and-eyes.content.js';

const clone = o => JSON.parse(JSON.stringify(o));
const steady = (a, period, min) => a.length >= min && gapsOf(a).every(x => Math.abs(x - period) <= 3);
const seen = a => a.length > 1 ? 'intervals seen: ' + [...new Set(gapsOf(a))].sort((x, y) => x - y).slice(0, 5).join(', ') + ' ms' : a.length + ' toggle(s)';
const added = () => [task('motor', 1, [c('motorStep'), d(8)]), task('camera', 1, [c('compressFrame'), d(120)]), task('telemetry', 1, [c('sendTelemetry'), d(85)])];

export const lesson = {
  id: 2, title: 'Wheels and Eyes', topic: 'Priorities, preemption and time slicing', file: 'main/rover_main.c',
  T: 3000, cores: 1, pins: ['BEACON', 'HEART'], ops: ['gpio', 'call', 'delay', 'busy'], fns: ['motorStep', 'compressFrame', 'sendTelemetry'],
  goals: [
    'Motor: never more than 11 ms between two motorStep() calls',
    'Camera: at least 12 frames compressed in 3 s',
    'Telemetry: never more than 105 ms between two packets, at least 27 sent',
    'Still working from stage 1: BEACON toggles every 500 ms (within 3 ms)',
    'Still working from stage 1: HEART toggles every 200 ms (within 3 ms)',
  ],
  /** @param prev the firmware that passed stage 1 (the player's own, or the reference) */
  start: prev => { const p = clone(prev || stage1.solution()); p.units.push(...added()); return p; },
  solution: () => {
    const p = stage1.solution(); p.units.forEach(u => { u.prio = 4; u.stack = 768; }); // lights: tight timing, almost no CPU
    p.units.push(task('motor', 3, [c('motorStep'), d(8)], { stack: 1088 }), task('camera', 1, [c('compressFrame'), d(120)], { stack: 2624 }), task('telemetry', 2, [c('sendTelemetry'), d(85)], { stack: 1728 }));
    return p;
  },
  solutionNote: ['My version: priority follows urgency. The lights and the 10 ms motor loop sit on top because their timing is tight and they need almost no CPU. Telemetry is in the middle. The camera, which only needs "eventually", gets the bottom and soaks up what is left.', 'Your stage 1 code was replaced by the reference tasks. Try giving the camera priority 3 and watch what it does to the motor.'],
  check: K => {
    const m = maxGap(S_(K, 'motorStep')), f = E_(K, 'compressFrame').length, tl = S_(K, 'sendTelemetry'), tg = maxGap(tl), b = pinT(K, 'BEACON'), h = pinT(K, 'HEART');
    return [[m <= 11, m === Infinity ? 'motorStep() never ran' : `worst gap ${m} ms`], [f >= 12, `${f} frames`], [tg <= 105 && tl.length >= 27, `worst gap ${tg === Infinity ? '-' : tg} ms, ${tl.length} packets`],
      [steady(b, 500, 5), seen(b)], [steady(h, 200, 13), seen(h)]];
  },
  // chart evidence: bracket the longest gap between motor steps when it breaks the 11 ms limit
  evidence: K => { const s = S_(K, 'motorStep'); let w = 0; for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] > s[w + 1] - s[w] || i === 1) w = i - 1; return s.length > 1 && s[w + 1] - s[w] > 11 ? [{ unit: 'motor', from: s[w], to: s[w + 1], label: `${s[w + 1] - s[w]} ms between motor steps` }] : []; },
  bonus: B(70, 7464),
  briefing: [
    'Good news, engineer. Overnight the drive team bolted on the wheels, a camera mast and a telemetry radio. TICK-1 is off the stands.',
    'Your firmware from stage 1 is still in there, untouched. Their three new tasks were added under yours in app_main(): motor, camera, telemetry. Every one at priority 1.',
    'The wheel controller has to run every 10 ms or the rover wobbles. And your lights must keep their rhythm: that is a regression check now.',
    'Spec sheet: the motor step takes about 2 ms and the loop sleeps 8 ms, so the period is 10 ms. The goal allows 11 ms, one tick of slack for the scheduler. The camera needs 6 frames a second (12 in the 3 s run), and telemetry goes out every 100 ms with 5 ms of slack and at least 27 packets. The numbers are round, the margins are deliberate.',
    'Flash it as it is and read the chart before you change anything.',
  ],
  reactions: {
    watchdog: ['Task watchdog. Something never blocks, and now it takes the whole rover down with it. Check that every task loop still has its vTaskDelay().', 'Find the task whose row is solid from end to end in the chart.'],
    crash: ['The rover rebooted. The serial monitor at the bottom says why.'],
    fail: ['Not there yet. Compare the chart with the objectives, change the code and flash again.'],
    slicing: ['Look at the motor row while the camera is compressing: faded bars between the solid ones. Five tasks at priority 1 take turns, one tick each, so a 2 ms motor step is smeared over several milliseconds.', 'Priority is how you tell the scheduler who may interrupt whom. Edit the fifth argument of xTaskCreate(). Which task has the tightest deadline?'],
    lights: ['The new tasks meet their deadlines, but your lights from stage 1 are off the beat: they wake up on time and then wait behind busier tasks. They need almost no CPU, so letting them go first costs nothing.'],
    starved: ['Look at the motor row: faded for long stretches. The camera now outranks it, so each frame holds the CPU for about 60 ms and the motor waits the whole time. A higher priority is a right to go first, not just a bigger share.', 'Which task has the tightest deadline? That one should be the highest of the three new tasks.'],
    shared: ['Motor is fine now. Telemetry is still late: it has the same priority as the camera, so the two take turns tick by tick, and a 12 ms packet is stretched for as long as a 60 ms frame is being compressed. Which of the two has a deadline?'],
    camera: ['Motor is fine now. But something long-running is sitting above a task with a deadline. The 60 ms camera job should only get the CPU nobody else wants.'],
    pass: ['Wheels steady, lights steady, and the camera lives on leftovers. Shortest deadline, highest priority: you just did rate-monotonic scheduling.'],
  },
  diagnose: (K, res) => {
    const r = lesson.reactions;
    if (!res[0][0]) {
      const pr = n => (K.units.find(u => u.name === n) || {}).base;   // the player may have renamed or deleted a task
      if (pr('camera') > pr('motor')) return r.starved;
      if (pr('camera') === pr('motor') && pr('motor') === pr('telemetry')) return r.slicing;
    }
    // telemetry late while it shares a priority with the camera: round-robin, not "camera above"
    const pOf = n => (K.units.find(u => u.name === n) || {}).base;
    if (!res[2][0] && pOf('camera') === pOf('telemetry')) return r.shared;
    if (!res[2][0] || !res[1][0]) return r.camera;
    if (!res[3][0] || !res[4][0]) return r.lights;
    return r.fail;
  },
  hints: [
    'Flash it and read the chart: which row is faded where it should be solid? That task is waiting for the CPU.',
    'Priority is the fifth argument of xTaskCreate(). A higher number goes first. Which of the three new tasks is the most urgent?',
    'Order the three new tasks by how tight their timing is: motor (10 ms) above telemetry (100 ms) above camera (no deadline at all).',
    'Your beacon and heart tasks use almost no CPU, so they can sit at the very top without hurting anyone. Left at priority 1 they share a level with the camera and jitter.',
    'For the RAM star: stack need is 768 bytes plus the deepest rover function the task calls. The number is in the comment next to each call.',
  ],
  // Wrong answers the verifier replays against the solution (unit order: beacon, heart, motor, camera, telemetry).
  wrong: [
    { name: 'everything at priority 1', apply: p => { p.units.forEach(u => { u.prio = 1; }); }, fails: [0], says: 'slicing' },
    { name: 'camera above telemetry', apply: p => { p.units[3].prio = 2; p.units[4].prio = 1; p.units[0].prio = p.units[1].prio = 1; }, fails: [2], says: 'camera' },
    { name: 'camera on top', apply: p => { p.units[3].prio = 5; }, fails: [0, 2, 3], says: 'starved' },
    { name: 'motor loop without a delay', apply: p => { p.units[2].code.pop(); }, crash: 'task_wdt' },
    { name: 'camera stack too small', apply: p => { p.units[3].stack = 1024; }, crash: 'stack overflow' },
  ],
  manual, realCode, quiz,
};
