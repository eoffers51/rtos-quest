// The campaign: one firmware that grows from a bench prototype into a flight-ready build.
import { lesson as firstLight } from './first-light.js';
import { lesson as wheelsAndEyes } from './wheels-and-eyes.js';
import { lesson as steadyPulse } from './steady-pulse.js';
import { lesson as martianNight } from './martian-night.js';
import { lesson as everyByteCounts } from './every-byte-counts.js';
import { lesson as sciencePipeline } from './science-pipeline.js';
import { lesson as oneBusTwoMasters } from './one-bus-two-masters.js';
import { lesson as bumpInTheNight } from './bump-in-the-night.js';
import { lesson as directLine } from './direct-line.js';
import { lesson as foldAntenna } from './fold-the-antenna.js';
import { lesson as allSystemsGo } from './all-systems-go.js';
import { lesson as deadlyEmbrace } from './deadly-embrace.js';
import { lesson as pathfinder } from './pathfinder.js';
import { lesson as twoBrains } from './two-brains.js';
import { lesson as flightReadiness } from './flight-readiness-review.js';

/** Stages that are playable in this build, in order. Each one starts from the firmware of the stage before. */
export const LESSONS = [firstLight, wheelsAndEyes, steadyPulse, everyByteCounts, sciencePipeline, oneBusTwoMasters, bumpInTheNight, directLine, foldAntenna, allSystemsGo, deadlyEmbrace, pathfinder, twoBrains, flightReadiness];

/** Side missions: stand-alone stages on other topics (ids from 101). They do not inherit firmware and are always open.
 *  A side lesson sets `side: true` and carries its own `adds` text for the build log. */
export const SIDE = [martianNight];

/** The whole planned journey. `adds` is what the rover gains, `topic` what you learn to make it work. */
export const JOURNEY = [
  { id: 1, title: 'First Light', adds: 'Status lights on a bench prototype', topic: 'Tasks, blocking, the idle task' },
  { id: 2, title: 'Wheels and Eyes', adds: 'Drive motors, camera, telemetry', topic: 'Priorities and preemption' },
  { id: 3, title: 'Steady Pulse', adds: 'Spectrometer sampling at exactly 50 Hz', topic: 'Ticks, drift, vTaskDelayUntil' },
  { id: 4, title: 'Every Byte Counts', adds: 'Navigation, within a RAM budget', topic: 'Stacks, heap, high-water marks' },
  { id: 5, title: 'Science Pipeline', adds: 'Samples flow from sensor to radio', topic: 'Queues' },
  { id: 6, title: 'One Bus, Two Masters', adds: 'IMU and thermometer share I2C', topic: 'Race conditions, mutexes' },
  { id: 7, title: 'Bump in the Night', adds: 'Bumper stops the motors instantly', topic: 'Interrupts, semaphores, deferred work' },
  { id: 8, title: 'Direct Line', adds: 'Bumper handling without a kernel object: lighter and faster', topic: 'Task notifications' },
  { id: 9, title: 'Fold the Antenna', adds: 'High-gain antenna with auto-stow', topic: 'Software timers and the timer service task' },
  { id: 10, title: 'All Systems Go', adds: 'Uplink that waits for radio link, time sync and a position fix', topic: 'Event groups' },
  { id: 11, title: 'Deadly Embrace', adds: 'Robot arm and camera cooperate', topic: 'Deadlock, lock ordering and starvation' },
  { id: 12, title: 'Pathfinder', adds: 'A data bus that never stalls', topic: 'Priority inversion and inheritance' },
  { id: 13, title: 'Two Brains', adds: 'Hazard vision on the second core', topic: 'Dual-core scheduling, pinning and critical sections' },
  { id: 14, title: 'Flight Readiness Review', adds: 'Task watchdog, stack and heap margins, diagnostics', topic: 'Production hardening' },
];
