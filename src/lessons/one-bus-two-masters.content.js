// Field manual for stage 6 (ESP-IDF): race conditions, mutexes and a shared I2C bus.
import { svg, box, arrow, note } from '../widgets.js';

const bar = (x, y, w, cls, h = 20) => `<rect class="bx ${cls}" x="${x}" y="${y}" width="${Math.max(1.5, w)}" height="${h}" rx="2"/>`;
const axis = (x0, x1, y) => `<line class="ar" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" marker-end="url(#ah)"/>`;
const line = (x1, y1, x2, y2, cls = 'sep') => `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;

/* ================= diagrams ================= */

// 1a. Hardware: one controller, two wires, two devices, two tasks that both want it
const busDia = svg(600, 200, (() => {
  let s = box(10, 14, 110, 44, 'imu task|every 20 ms', 'c') + box(10, 140, 110, 44, 'thermo task|every 100 ms', 'a')
    + arrow(120, 36, 170, 84) + arrow(120, 162, 170, 114)
    + box(170, 70, 120, 58, 'I2C controller|one transaction|at a time', 'd')
    + line(290, 90, 590, 90, 'ar') + line(290, 108, 590, 108, 'ar') + note(298, 84, 'SCL', 'start') + note(298, 124, 'SDA', 'start')
    + line(430, 90, 430, 66, 'ar') + line(430, 108, 430, 66, 'ar') + box(370, 10, 120, 56, 'IMU|addr 0x68|read 5 ms', 'c')
    + line(530, 90, 530, 140, 'ar') + line(530, 108, 530, 140, 'ar') + box(470, 140, 120, 46, 'thermometer|read 8 ms', 'a');
  return s;
})(), 'Two tasks drive one I2C controller, which has two wires shared by two devices: the IMU read takes 5 ms and the thermometer read 8 ms');

// 1b. The collision on the timeline
const collideDia = svg(760, 150, (() => {
  const X = t => 110 + t * 24; let s = note(100, 38, 'imu', 'end') + note(100, 92, 'thermo', 'end');
  s += bar(X(0), 26, X(5) - X(0), 'c') + bar(X(20), 26, X(5) - X(0), 'c');
  s += bar(X(4), 80, X(12) - X(4), 'a') + `<rect class="bx r" x="${X(4)}" y="26" width="${X(5) - X(4)}" height="74" rx="2" style="fill-opacity:.35"/>`;
  s += note(X(4.5), 18, 'both on the bus for 1 ms', 'start') + note(X(4), 118, 'thermo starts at 4 ms: the IMU read is still on the wire', 'start');
  s += axis(100, 740, 134) + [0, 5, 10, 15, 20, 25].map(t => note(X(t), 148, t + ' ms', 'middle')).join('');
  return s;
})(), 'A thermometer read that starts at 4 ms overlaps an IMU read that is still running');

// 2. Read-modify-write, interleaved
const raceDia = svg(800, 230, (() => {
  let s = note(105, 18, 'task A', 'middle') + note(265, 18, 'shared counter', 'middle') + note(425, 18, 'task B', 'middle');
  const rows = [['1. LOAD  r = counter', 'r = 0', '0', null], ['', '', '0', '1. LOAD  r = counter'], ['2. ADD   r = r + 1', 'r = 1', '0', null], ['3. STORE counter = r', '', '1', null], ['', '', '1', '2. ADD   r = r + 1'], ['', '', '1', '3. STORE counter = r']];
  const info = ['A reads 0', 'B reads 0 too: A has not stored yet', 'A computes 1', 'A stores 1', 'B computes 1 from its old 0', 'B stores 1: A\'s update is gone'];
  rows.forEach((r, i) => {
    const y = 28 + i * 31;
    if (r[0]) s += box(10, y, 190, 26, r[0], 'c');
    if (r[3]) s += box(330, y, 190, 26, r[3], 'a');
    s += box(215, y, 100, 26, 'counter = ' + r[2], i === 5 ? 'r' : 'd');
  });
  info.forEach((t, i) => { s += note(535, 46 + i * 31, t, 'start'); });
  return s;
})(), 'Two tasks increment a counter and one update is lost');

// 3. Mutex: a token with an owner
const keyDia = svg(760, 190, (() => {
  return box(20, 20, 130, 44, 'imu task|wants the bus', 'c') + box(20, 120, 130, 44, 'thermo task|wants the bus', 'a')
    + arrow(150, 42, 290, 70, 'Take', 0, -8) + arrow(150, 142, 290, 112, 'Take: blocked', 0, 18)
    + box(290, 50, 180, 90, 'i2c_lock|(a mutex, 96 B)|owner: imu', 'g')
    + arrow(470, 95, 560, 95, 'guards') + box(560, 66, 180, 58, 'I2C bus|one transaction|at a time', 'd')
    + note(380, 168, 'Give by the owner opens the door for the next waiter', 'middle');
})(), 'A mutex is a token with one owner: the second task blocks until it is given back');

// 4. Ownership versus signalling
const kindDia = svg(760, 200, (() => {
  let s = note(190, 16, 'Mutex: ownership', 'middle') + note(570, 16, 'Binary semaphore: signalling', 'middle');
  s += box(20, 30, 100, 40, 'task A', 'c') + arrow(120, 50, 210, 50, 'Take') + box(210, 30, 100, 40, 'mutex|owner = A', 'g') + arrow(210, 62, 120, 100, 'Give (A only)', 0, 12)
    + box(20, 100, 100, 40, 'task A', 'c') + box(210, 130, 160, 40, 'task B Give: refused', 'r');
  s += box(400, 30, 100, 40, 'ISR / task B', 'a') + arrow(500, 50, 590, 50, 'Give') + box(590, 30, 110, 40, 'semaphore|count 0 to 1', 'g') + arrow(645, 70, 645, 112, 'Take') + box(590, 112, 110, 40, 'task A wakes', 'c')
    + note(400, 130, 'Any task or ISR may give.', 'start') + note(400, 148, 'It starts EMPTY.', 'start');
  s += note(20, 190, 'A mutex starts AVAILABLE and is taken first, then given by the same task.', 'start');
  return s;
})(), 'A mutex has an owner that must give it back, a semaphore is a signal from anyone');

// 5. Hold time: 8 ms against 100 ms
const holdDia = svg(760, 270, (() => {
  const X = t => 100 + t * 5.2; let s = '';
  // panel 1: lock held 8 ms
  s += note(20, 16, 'Lock held 8 ms: just the read', 'start') + note(92, 40, 'imu', 'end') + note(92, 66, 'thermo', 'end');
  s += bar(X(0), 28, X(5) - X(0), 'c', 18) + [20, 40, 60, 80, 100].map(t => bar(X(t), 28, X(5) - X(0), 'c', 18)).join('');
  s += bar(X(0), 54, X(8) - X(0), 'a', 18);
  s += line(20, 92, 740, 92, 'sep');
  // panel 2: lock held 108 ms
  s += note(20, 116, 'Lock held 108 ms: the read plus a vTaskDelay(100) inside the lock', 'start') + note(92, 140, 'imu', 'end') + note(92, 166, 'thermo', 'end');
  s += bar(X(0), 128, X(5) - X(0), 'c', 18);
  s += [20, 40, 60, 80, 100].map(t => `<rect class="bx blko" x="${X(t)}" y="128" width="${X(5) - X(0)}" height="18" rx="2"/>`).join('');
  s += bar(X(108), 128, X(5) - X(0), 'c', 18);
  s += bar(X(0), 154, X(8) - X(0), 'a', 18) + bar(X(8), 154, X(108) - X(8), 'd', 18);
  s += note(X(60), 196, 'red outlines: imu reads waiting for the lock', 'middle');
  s += axis(100, 740, 214) + [0, 20, 40, 60, 80, 100].map(t => note(X(t), 232, t, 'middle')).join('') + note(740, 250, 'ms', 'end');
  return s;
})(), 'Two panels, imu above thermo. With the lock held 8 ms every imu read goes through. With the lock held 108 ms the imu reads at 20 to 100 ms wait for the lock');

// 6. A task that takes its own lock
const deadDia = svg(760, 150, (() => {
  return box(15, 40, 175, 50, 'thermo task|Take(i2c_lock) ... no Give', 'a')
    + arrow(190, 55, 300, 55, 'lap 1: acquired') + box(300, 30, 150, 50, 'i2c_lock|owner: thermo', 'g')
    + `<path class="ar" d="M102 90 C 102 130 360 130 375 82" fill="none" marker-end="url(#ah)"/>` + note(240, 128, 'lap 2: Take(i2c_lock, portMAX_DELAY) blocks forever', 'middle')
    + box(520, 40, 210, 50, 'imu task|blocked too, for the same lock', 'r') + arrow(520, 62, 452, 62);
})(), 'A task that never gives the lock waits for itself on its second lap');

// 7. Three designs
const designDia = svg(760, 190, (() => {
  const col = (x, title, lines, cls) => box(x, 10, 230, 28, title, cls) + lines.map((t, i) => note(x + 6, 62 + i * 18, t, 'start')).join('');
  return col(10, '1. Mutex', ['each task: Take, transfer, Give', 'others sleep while waiting', 'CPU only for the real work', 'ISRs and other tasks keep running'], 'g')
    + col(265, '2. Bus-owner task + queue', ['one task owns the bus', 'others Send a request (stage 5)', 'no lock: one task, no overlap', 'costs a queue and a task stack'], 'c')
    + col(520, '3. Critical section', ['taskENTER_CRITICAL(&mux)', 'low-prio interrupts off', 'on this core', 'every other task stalls', 'only for a few microseconds'], 'r');
})(), 'Three ways to keep two tasks from using a bus at the same time');

/* ================= widgets ================= */

const frame = (title, body) => `<div class="wg"><div class="wgh">INTERACTIVE · ${title}</div>${body}</div>`;

/* A 1 ms step simulation of the two bus tasks. Deterministic: no random numbers, no clock.
   imu: until(pi) marks, transaction ili ms. thermo: delay(pt) after its transaction (and after a hold), transaction tli ms. */
function busSim({ pi = 20, pt = 100, phase = 4, lock = true, hold = 0, giveI = true, giveT = true, ili = 5, tli = 8, T = 1000 } = {}) {
  const tk = { imu: { st: 'sleep', at: 0, mark: 0, len: ili, give: giveI, per: pi }, thermo: { st: 'sleep', at: phase, len: tli, give: giveT, per: pt } };
  const names = ['imu', 'thermo'], out = { spans: [], waits: [], starts: { imu: [], thermo: [] }, coll: 0, dead: [] };
  let owner = null, busy = 0;
  const done = (k, t) => { const q = tk[k]; if (lock && q.give) owner = null; if (k === 'imu') { q.mark += q.per; q.at = q.mark; } else q.at = t + q.per; q.st = 'sleep'; };
  for (let t = 0; t < T; t++) {
    names.forEach(k => { const q = tk[k];
      if (q.st === 'bus' && t >= q.end) { busy--; if (k === 'thermo' && lock && hold > 0) { q.st = 'hold'; q.hend = t + hold; } else done(k, t); }
      if (q.st === 'hold' && t >= q.hend) done(k, t); });
    names.forEach(k => { const q = tk[k];
      if (q.st === 'sleep' && t >= q.at) { q.st = 'want'; q.since = t; }
      if (q.st === 'want') {
        if (lock && owner === k) { q.st = 'dead'; return; }
        if (!lock || owner === null) {
          if (lock) owner = k;
          if (busy > 0) out.coll++;
          busy++; q.st = 'bus'; q.end = t + q.len; out.starts[k].push(t); out.spans.push([k, t, q.end]);
          if (q.since < t) out.waits.push([k, q.since, t]);
        }
      }
    });
  }
  names.forEach(k => { const q = tk[k]; if (q.st === 'dead' || q.st === 'want') out.dead.push(k + (q.st === 'dead' ? ' waits for i2c_lock, which it already holds itself' : ' waits for i2c_lock, held by ' + owner)); });
  const gap = a => a.length < 2 ? Infinity : a.reduce((m, v, i) => i ? Math.max(m, v - a[i - 1]) : 0, 0);
  out.gapI = gap(out.starts.imu); out.gapT = gap(out.starts.thermo);
  return out;
}
const fmt = v => v === Infinity ? '-' : v;
const busChart = (r, W) => {
  const X = t => 70 + t * (680 / W); let s = note(62, 34, 'imu', 'end') + note(62, 80, 'thermo', 'end');
  r.waits.forEach(([k, a, b]) => { if (a < W) s += `<rect class="bx blko" x="${X(a)}" y="${k === 'imu' ? 22 : 68}" width="${Math.max(1.5, X(Math.min(b, W)) - X(a))}" height="18" rx="2"/>`; });
  r.spans.forEach(([k, a, b]) => { if (a < W) s += bar(X(a), k === 'imu' ? 22 : 68, X(Math.min(b, W)) - X(a), k === 'imu' ? 'c' : 'a', 18); });
  r.spans.forEach(([k, a]) => { if (a < W && r.coll) { const o = r.spans.find(([k2, a2, b2]) => k2 !== k && a2 < a && a < b2); if (o) s += note(X(a), 58, '!', 'middle').replace('class="at"', 'class="at" style="fill:#ff5d4d;font-weight:700"'); } });
  s += axis(70, 756, 108) + [0, 50, 100, 150, 200, 250, 300].filter(t => t <= W).map(t => note(X(t), 124, t, 'middle')).join('') + note(60, 124, 'ms', 'end');
  return svg(760, 132, s, 'Bus transactions of the IMU and the thermometer, first ' + W + ' ms');
};
const sl = (id, label, min, max, val, unit = ' ms') => `<label>${label} <input type="range" data-${id} min="${min}" max="${max}" value="${val}"> <b data-${id}v></b></label>`;
const val = (el, id, unit = ' ms') => { const v = +el.querySelector('[data-' + id + ']').value; el.querySelector('[data-' + id + 'v]').textContent = v + unit; return v; };

function buslab(el) {
  el.innerHTML = frame('TWO TASKS, ONE BUS: DOES IT COLLIDE?',
    `<div class="wgrow">${sl('pi', 'IMU period', 10, 60, 20)}${sl('pt', 'thermometer period', 30, 200, 100)}${sl('ph', 'thermometer first start', 0, 60, 4)}<label><input type="checkbox" data-lock> both tasks take i2c_lock</label></div><div data-out></div>`);
  const draw = () => {
    const r = busSim({ pi: val(el, 'pi'), pt: val(el, 'pt'), phase: val(el, 'ph'), lock: el.querySelector('[data-lock]').checked });
    el.querySelector('[data-out]').innerHTML = busChart(r, 300)
      + `<p class="wgcap">In 1 s: <b class="${r.coll ? 'bad' : 'good'}">${r.coll} collision${r.coll === 1 ? '' : 's'}</b>, IMU reads ${r.starts.imu.length} (longest gap ${fmt(r.gapI)} ms), thermometer reads ${r.starts.thermo.length}. `
      + (r.coll ? 'A red ! marks a transaction that started while the other was on the wire. The chart shows the first 300 ms.' : 'Red outlines are time spent waiting for the lock. The bus is never used twice.') + '</p>';
  };
  el.addEventListener('input', draw); el.addEventListener('change', draw); draw();
}

function racelab(el) {
  const seq = { 'A,A,A,B,B,B': 'AAABBB', 'A,B,A,B,A,B': 'ABABAB', 'A,B,A,A,B,B': 'ABAABB' };
  el.innerHTML = frame('TWO TASKS, counter++ EACH: CHOOSE WHO RUNS NEXT',
    `<div class="wgbtns"><button class="hb" data-a>RUN A ONE STEP</button><button class="hb" data-b>RUN B ONE STEP</button><button class="hb" data-r>RESET</button></div>
     <div class="wgbtns">${Object.keys(seq).map(k => `<button class="hb" data-pre="${seq[k]}">${k}</button>`).join('')}</div><div data-out></div>`);
  const ops = ['LOAD  r = counter', 'ADD   r = r + 1', 'STORE counter = r'];
  let S;
  const reset = () => { S = { c: 0, A: { pc: 0, r: null }, B: { pc: 0, r: null }, log: [] }; };
  const step = k => {
    const t = S[k]; if (t.pc >= 3) return;
    if (t.pc === 0) t.r = S.c; else if (t.pc === 1) t.r++; else S.c = t.r;
    S.log.push(k + ': ' + ops[t.pc] + (t.pc === 2 ? ' (counter is now ' + S.c + ')' : ' (r = ' + t.r + ')')); t.pc++;
  };
  const draw = () => {
    const col = (k, x) => ops.map((o, i) => box(x, 24 + i * 34, 220, 28, o, S[k].pc > i ? 'g' : S[k].pc === i ? 'a' : 'd')).join('') + note(x + 110, 18, 'task ' + k + (S[k].r === null ? '' : '   r = ' + S[k].r), 'middle');
    const fin = S.A.pc === 3 && S.B.pc === 3;
    el.querySelector('[data-out]').innerHTML = svg(760, 136, col('A', 20) + box(290, 40, 180, 50, 'counter = ' + S.c, fin && S.c !== 2 ? 'r' : 'c') + col('B', 520), 'State of two tasks and the shared counter')
      + `<p class="wgcap">${fin ? (S.c === 2 ? '<b class="good">counter = 2.</b> No step of one task fell between the load and the store of the other.' : '<b class="bad">counter = ' + S.c + ': one increment was lost.</b> B loaded the old value before A stored.') : 'Each task needs three steps. Run them in any order: the kernel may switch tasks between any two.'}</p>`
      + `<p class="wgcap">${S.log.slice(-6).join(' | ') || ''}</p>`;
    el.querySelector('[data-a]').disabled = S.A.pc >= 3; el.querySelector('[data-b]').disabled = S.B.pc >= 3;
  };
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.r !== undefined) reset();
    else if (b.dataset.a !== undefined) step('A'); else if (b.dataset.b !== undefined) step('B');
    else if (b.dataset.pre) { reset(); [...b.dataset.pre].forEach(k => step(k)); }
    draw();
  });
  reset(); draw();
}

/** A mutex or a binary semaphore, with two tasks and Take / Give buttons. fixed: 'mutex' hides the choice. */
const locklab = fixed => function (el) {
  el.innerHTML = frame(fixed ? 'TWO TASKS AND ONE MUTEX' : 'MUTEX OR BINARY SEMAPHORE: TRY A GIVE FROM THE WRONG TASK',
    `<div class="wgrow">${fixed ? '' : '<label>object <select data-kind><option value="mutex">mutex (xSemaphoreCreateMutex)</option><option value="sem">binary semaphore (xSemaphoreCreateBinary)</option></select></label>'}</div>
     <div class="wgbtns"><button class="hb" data-do="A-take">A: TAKE</button><button class="hb" data-do="A-give">A: GIVE</button><button class="hb" data-do="B-take">B: TAKE</button><button class="hb" data-do="B-give">B: GIVE</button><button class="hb" data-do="reset">RESET</button></div><div data-out></div>`);
  let S;
  const kind = () => fixed || el.querySelector('[data-kind]').value;
  const reset = () => { S = { owner: null, count: 0, wait: null, hold: { A: false, B: false }, msg: kind() === 'mutex' ? 'The mutex starts available: the first Take succeeds at once.' : 'The binary semaphore starts empty: even the first Take blocks until somebody gives.' }; };
  const act = (k, a) => {
    const o = k === 'A' ? 'B' : 'A', m = kind();
    if (S.wait === k) { S.msg = 'Task ' + k + ' is blocked inside xSemaphoreTake and cannot run any code.'; return; }
    if (a === 'take') {
      if (m === 'mutex') {
        if (S.owner === null) { S.owner = k; S.msg = k + ' took the mutex. Owner: ' + k + '.'; }
        else if (S.owner === k) { S.wait = k; S.msg = k + ' already owns it. A normal mutex is not recursive: ' + k + ' now waits for itself, forever.'; }
        else { S.wait = k; S.msg = k + ' is blocked: ' + o + ' owns the mutex. ' + k + ' uses no CPU while it waits.'; }
      } else if (S.count > 0) { S.count = 0; S.hold[k] = true; S.msg = k + ' took the token.'; } else { S.wait = k; S.msg = k + ' is blocked: nothing was given yet.'; }
    } else if (m === 'mutex') {
      if (S.owner !== k) S.msg = 'REFUSED. ' + k + ' gave a mutex it does not hold. The game stops the run with "assert failed"; ESP-IDF builds with asserts enabled stop in the kernel.';
      else { S.owner = null; S.msg = k + ' gave the mutex back.'; if (S.wait) { S.owner = S.wait; S.msg += ' ' + S.wait + ' wakes up and now owns it.'; S.wait = null; } }
    } else { if (S.wait) { S.msg = k + ' gave the semaphore. ' + S.wait + ' wakes up and takes it.'; S.wait = null; } else { S.count = 1; S.msg = k + ' gave the semaphore. Count is now 1. No ownership: any task may do this.'; } }
  };
  const draw = () => {
    const m = kind(), st = k => S.wait === k ? 'blko' : (m === 'mutex' ? S.owner === k : S.hold[k]) ? 'run' : 'rdy';
    const lab = k => S.wait === k ? 'blocked in Take' : (m === 'mutex' ? S.owner === k : S.hold[k]) ? 'holds it' : 'running';
    el.querySelector('[data-out]').innerHTML = svg(760, 100, box(20, 20, 200, 56, 'task A|' + lab('A'), st('A')) + box(540, 20, 200, 56, 'task B|' + lab('B'), st('B'))
      + box(290, 20, 180, 56, m === 'mutex' ? 'mutex|owner: ' + (S.owner || 'nobody') : 'binary semaphore|count: ' + S.count, 'g'), 'Two tasks and a lock')
      + `<p class="wgcap">${S.msg}</p>`;
  };
  el.addEventListener('click', e => { const b = e.target.closest('[data-do]'); if (!b) return; const v = b.dataset.do; if (v === 'reset') reset(); else act(v[0], v.slice(2)); draw(); });
  el.addEventListener('change', () => { reset(); draw(); });
  reset(); draw();
};

function holdlab(el) {
  el.innerHTML = frame('HOW LONG MAY THE THERMOMETER HOLD THE LOCK?',
    `<div class="wgrow">${sl('h', 'delay inside the lock', 0, 120, 0)}${sl('pi', 'IMU period', 20, 40, 20)}</div><div data-out></div>`);
  const draw = () => {
    const h = val(el, 'h'), pi = val(el, 'pi'), r = busSim({ lock: true, hold: h, pi });
    const ok = r.coll === 0 && r.starts.imu.length >= 45 && r.gapI <= 40;
    el.querySelector('[data-out]').innerHTML = busChart(r, 300)
      + `<p class="wgcap">Lock held ${8 + h} ms per thermometer read. IMU: <b>${r.starts.imu.length}</b> reads in 1 s, longest gap <b class="${r.gapI <= 40 ? 'good' : 'bad'}">${fmt(r.gapI)} ms</b> (stage limit 40 ms). Collisions: ${r.coll}.</p>`
      + `<p class="wgcap">Worst-case blocking of a task is the longest time any other task holds the lock. ${h === 0 ? 'Here that is 8 ms, so the IMU gap is its period plus at most a few ms.' : 'Here the thermometer holds it ' + (8 + h) + ' ms, and the IMU cannot read until it lets go.'}${ok ? '' : ' <b class="bad">The IMU misses its deadline.</b>'}</p>`;
  };
  el.addEventListener('input', draw); draw();
}

function deadlab(el) {
  el.innerHTML = frame('REMOVE A GIVE, SEE WHAT STOPS',
    `<div class="wgrow"><label><input type="checkbox" data-gi checked> imu calls xSemaphoreGive</label><label><input type="checkbox" data-gt checked> thermo calls xSemaphoreGive</label></div><div data-out></div>`);
  const draw = () => {
    const r = busSim({ lock: true, giveI: el.querySelector('[data-gi]').checked, giveT: el.querySelector('[data-gt]').checked });
    el.querySelector('[data-out]').innerHTML = busChart(r, 300)
      + `<p class="wgcap">In 1 s: IMU reads <b>${r.starts.imu.length}</b>, thermometer reads <b>${r.starts.thermo.length}</b>. ` + (r.dead.length
        ? `<b class="bad">Stuck:</b> ${r.dead.join('; ')}. Nobody crashes and nothing is logged by FreeRTOS: both tasks are simply blocked. The game prints a "Deadlock" line; on real hardware you see readings stop and, with the task watchdog watching IDLE, nothing at all.`
        : '<b class="good">Both tasks run on.</b> Every Take has a matching Give.') + '</p>';
  };
  el.addEventListener('change', draw); draw();
}

function designlab(el) {
  el.innerHTML = frame('WHAT DOES EACH DESIGN COST?',
    `<div class="wgrow">${sl('l', 'IMU transaction', 1, 10, 5)}<label>design <select data-d><option value="m">mutex</option><option value="q">bus-owner task + queue</option><option value="c">critical section (taskENTER_CRITICAL)</option></select></label></div><div data-out></div>`);
  const draw = () => {
    const L = val(el, 'l'), tl = L + 3, d = el.querySelector('[data-d]').value, bus = 50 * L + 10 * tl;
    const rows = { m: [`0 ms stalled`, 'Other tasks and interrupts run while a task waits. The waiter is blocked, at zero CPU.', 'The longest any task waits is the longest hold: ' + tl + ' ms.'],
      q: [`0 ms stalled`, 'The owner task does every transfer; the callers block on a reply or just post a request. One more task stack (1280 B in the game) and a queue.', 'A request waits behind the ones before it. The worst case is the same hold times plus one queue hop.'],
      c: [`${bus} ms of every second with this core frozen (${(bus / 10).toFixed(0)}%)`, 'Lower-priority interrupts are masked on this core and no other task can run during the transfer. Fine for a few microseconds, wrong for a transfer that waits on the wire.', 'The interrupt watchdog and every timing deadline are at risk, and the 1 ms tick is held back.'] }[d];
    el.querySelector('[data-out]').innerHTML = `<p class="wgcap">Bus time per second: <b>${bus} ms</b> (50 IMU reads of ${L} ms and 10 thermometer reads of ${tl} ms).</p><p class="wgcap">Core stalled: <b class="${d === 'c' ? 'bad' : 'good'}">${rows[0]}</b></p><p class="wgcap">${rows[1]}</p><p class="wgcap">${rows[2]}</p>`;
  };
  el.addEventListener('input', draw); el.addEventListener('change', draw); draw();
}

export const widgets = { buslab, racelab, mutexlab: locklab('mutex'), kindlab: locklab(null), holdlab, deadlab, designlab };

/* ================= reference code ================= */

export const realCode = `// main/rover_main.c   (ESP-IDF v5.x)   stage 6: one shared I2C bus, two tasks, one mutex
// Build: idf.py build flash monitor
// Needs CONFIG_FREERTOS_HZ=1000, the game's tick. At the ESP-IDF default of 100 Hz one tick is 10 ms, so pdMS_TO_TICKS(20) is 2 ticks and pdMS_TO_TICKS(5) is 0.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include "driver/gpio.h"
#include "esp_log.h"

#define PRIO_IMU      2     // same as telemetry and science: below the motor (3), above the camera (1)
#define PRIO_THERMO   2
#define IMU_PERIOD_MS     20
#define THERMO_PERIOD_MS  100
#define BUS_LOCK_WAIT     portMAX_DELAY       // the game's reference solution; in production use pdMS_TO_TICKS(50) (longest legitimate hold is 8 ms)

static const char *TAG = "bus";
static SemaphoreHandle_t i2c_lock;            // protects the I2C port: ONE transaction at a time

// Each helper does one complete transaction on the shared bus (about 1 ms of CPU, 4 or 7 ms waiting for the wire in the game).
// A real transfer at 400 kHz takes well under 1 ms; the game stretches it so the overlap is visible. The lock logic is identical.
esp_err_t imu_read_attitude(float *out);
esp_err_t thermo_read_celsius(float *out);

static void imu_task(void *arg)
{
    TickType_t last = xTaskGetTickCount();               // fixed mark, as in stage 3
    float att;
    for (;;) {
        if (xSemaphoreTake(i2c_lock, BUS_LOCK_WAIT) == pdTRUE) {   // wait for the bus, asleep
            if (imu_read_attitude(&att) != ESP_OK) {               // the whole transaction happens inside the lock
                ESP_LOGW(TAG, "imu: read failed");
            }
            xSemaphoreGive(i2c_lock);                              // give it back on every path, error or not
        } else {
            ESP_LOGW(TAG, "imu: bus lock not available in time");
        }
        xTaskDelayUntil(&last, pdMS_TO_TICKS(IMU_PERIOD_MS));     // the delay is OUTSIDE the lock
    }
}

static void thermo_task(void *arg)
{
    float celsius;
    for (;;) {
        if (xSemaphoreTake(i2c_lock, BUS_LOCK_WAIT) == pdTRUE) {
            if (thermo_read_celsius(&celsius) != ESP_OK) {
                ESP_LOGW(TAG, "thermo: read failed");
            }
            xSemaphoreGive(i2c_lock);
        } else {
            ESP_LOGW(TAG, "thermo: bus lock not available in time");
        }
        vTaskDelay(pdMS_TO_TICKS(THERMO_PERIOD_MS));              // sleeping while holding the lock would block the IMU
    }
}

// beacon_task, heart_task, motor_task, telemetry_task, spectro_task, nav_task, mapper_task, science_task, radio_task: unchanged from stage 5

void app_main(void)
{
    // ... GPIO setup and the tasks from stage 5 ...
    i2c_lock = xSemaphoreCreateMutex();      // starts AVAILABLE; 96 B of heap for the control block; returns NULL if the heap is full
    if (i2c_lock == NULL) { ESP_LOGE(TAG, "no heap for the bus lock"); return; }

    // Create the lock BEFORE the tasks that use it. Stack: 768 base + 400 for the bus helper, so 1280 leaves a margin.
    if (xTaskCreate(imu_task,    "imu",    1280, NULL, PRIO_IMU,    NULL) != pdPASS ||
        xTaskCreate(thermo_task, "thermo", 1280, NULL, PRIO_THERMO, NULL) != pdPASS) {
        ESP_LOGE(TAG, "task creation failed");
    }
}

// Build notes
//   Every user of the bus must use the same lock. A lock only works if everybody takes it.
//   ESP-IDF v5 i2c_master driver: i2c_new_master_bus() / i2c_master_bus_add_device() / i2c_master_transmit_receive().
//   That driver already serialises single transactions on a bus handle (it has an internal bus lock), so two tasks calling
//   i2c_master_transmit_receive() on the same bus are safe. Your own lock is still needed for a sequence of calls that must stay
//   together (write a register pointer, then read; or read-modify-write a device register) and for data the tasks share.
//   Use xSemaphoreCreateRecursiveMutex() only if a function that holds the lock may call another that takes it too.
//   Async mode: with a non-zero trans_queue_depth in i2c_master_bus_config_t the driver queues transactions; it still serialises
//   access to the bus handle, so the rule above holds.
//   Critical sections: taskENTER_CRITICAL(&mux) masks interrupts up to configMAX_SYSCALL_INTERRUPT_PRIORITY on the calling core and, on dual-core
//   targets, takes a spinlock so the other core cannot enter either. The interrupt watchdog (CONFIG_ESP_INT_WDT_TIMEOUT_MS, 300 ms by default;
//   800 ms with external SPIRAM enabled) resets the chip if the core stays stuck.
//   Priority inheritance: a mutex lifts its owner to the priority of the highest waiter; semaphores do not (measured in stage 12).
//   Never call xSemaphoreTake / xSemaphoreGive on a mutex from an ISR: use a binary semaphore or a task notification.`;

/* ================= manual ================= */

export const manual = [
  ['1. Two masters, one wire', `<p>An ESP32 I2C port is a hardware block with one pair of wires, SCL (clock) and SDA (data). A <b>transaction</b> is start condition, address, bytes, stop condition, and the controller can run only one at a time per port. Devices on the bus are told apart by their 7-bit address, so an IMU and a thermometer can share the wires, as long as only one master talks at any moment.</p>
   ${busDia}
   <p>Here two tasks drive the bus: <code>imu</code> reads attitude every 20 ms, <code>thermo</code> reads the temperature every 100 ms. In the game a read takes 5 ms (4 ms waiting for the wire, 1 ms of CPU) and 8 ms (7 ms and 1 ms). A real transfer of a few bytes at 400 kHz takes well under a millisecond; the game stretches it so you can see the overlap. The locking problem is identical.</p>
   ${collideDia}
   <p class="cap">Each task is individually fine. The thermometer starts at 4 ms, one millisecond before the IMU read ends.</p>
   <ul><li>Together the tasks use only 5 ms per 20 ms plus 8 ms per 100 ms, about 33% of the bus. Low load does not prevent a collision: only <b>ordering</b> does. A collision needs two starts that overlap, and with a 20 ms and a 100 ms period that happens every few reads.</li>
   <li>The game counts a collision whenever a transaction starts while another is on the wire. It happens 5 times in the first second, the first at 4 ms, and prints "I2C collision: two transactions on the bus at the same time".</li>
   <li>On real hardware a collision shows up as a failed transfer or as a wrong value with no error at all.</li></ul>
   <p>Change the periods and the start offset. Then turn the lock on:</p>
   <div data-w="buslab"></div>`],

  ['2. What a race condition is', `<p>A <b>race condition</b> is a bug where the result depends on the order in which tasks happen to run. It needs three ingredients: <b>shared state</b>, at least one task that <b>writes</b> it, and <b>no rule about order</b>. The I2C bus is shared state outside the chip. A plain global variable is shared state inside it.</p>
   ${raceDia}
   <p class="cap">B loaded the counter before A stored it. A's update is overwritten, so two increments produce 1.</p>
   <ul><li><code>counter++</code> looks like one operation. The CPU does three: <b>load</b> the value into a register, <b>add</b> 1, <b>store</b> it back. Each task has its own copy of the registers; only the memory is shared.</li>
   <li>The kernel can switch tasks at any tick or at any wake-up of a higher-priority task, so <b>between any two instructions</b>. A bug that needs a switch in a 3-instruction window shows up once in thousands of runs, which is why it survives testing.</li>
   <li>The worst result of two tasks each incrementing once is <b>1</b>, not 2. With more tasks or more laps, any number from 1 to the full count is possible.</li>
   <li>The bus race is the same bug stretched in time: "is the bus free" (load) and "start my transaction" (store) are separated by whatever the other task does in between.</li>
   <li>A <code>volatile</code> qualifier does not help: it stops the compiler from caching the value, not the CPU from being interrupted halfway through the three steps.</li></ul>
   <p>Pick who runs next, or try a ready-made order:</p>
   <div data-w="racelab"></div>`],

  ['3. Mutual exclusion and the mutex', `<p>The cure for a race is <b>mutual exclusion</b>: only one task at a time is inside the dangerous region, the <b>critical section</b>. FreeRTOS gives you a <b>mutex</b> (mutual exclusion) for this. It is a small kernel object with one fact stored in it: <b>who owns it</b>, or nobody.</p>
   ${keyDia}
   <pre>SemaphoreHandle_t i2c_lock = xSemaphoreCreateMutex();   // once, before the tasks start

xSemaphoreTake(i2c_lock, portMAX_DELAY);   // owner = this task, or block until it is free
/* ... one complete I2C transaction ... */
xSemaphoreGive(i2c_lock);                  // owner = nobody, wake the first waiter</pre>
   <ul><li><code>xSemaphoreCreateMutex()</code> returns a handle, or <code>NULL</code> when the heap is full. The object costs about 96 bytes (the game charges 96 B). <b>A new mutex is available</b>: the first Take succeeds at once.</li>
   <li><code>xSemaphoreTake(handle, ticks)</code> returns <code>pdTRUE</code> when you got it and <code>pdFALSE</code> when the timeout ran out. <code>portMAX_DELAY</code> means wait without a time limit (ESP-IDF sets <code>INCLUDE_vTaskSuspend</code> to 1, which makes this true).</li>
   <li>While a task waits it is in the Blocked state with a red outline in the chart: it uses no CPU and the scheduler runs something else. When the owner gives, the highest-priority waiter becomes Ready.</li>
   <li>Only a task can use a mutex. <b>Not from an interrupt handler</b>: an ISR has no task identity to be the owner.</li>
   <li>A lock protects nothing by itself. It works only if <b>every</b> user takes it: one task that skips the Take brings the race back (stage 6 tests exactly this).</li></ul>
   <p>Play both tasks. Make B take the mutex while A owns it:</p>
   <div data-w="mutexlab"></div>`],

  ['4. Mutex versus binary semaphore', `<p>A binary semaphore looks like a mutex: same Take and Give calls, same handle type, <code>SemaphoreHandle_t</code>. The meaning is different. A <b>binary semaphore signals</b>: "something happened, somebody can go on". A <b>mutex guards</b>: "I am using this, wait your turn".</p>
   ${kindDia}
   <ul><li><b>Initial state.</b> <code>xSemaphoreCreateBinary()</code> starts <b>empty</b> (count 0): a Take blocks until a Give. <code>xSemaphoreCreateMutex()</code> starts <b>available</b>.</li>
   <li><b>Ownership.</b> A mutex remembers its owner, and only the owner may give it. In ESP-IDF with asserts enabled, a Give by another task fails an assert in the kernel. A semaphore has no owner: the task that gives is usually not the one that takes, which is the whole point (an ISR gives, a task takes).</li>
   <li><b>Priority inheritance.</b> Only a mutex has it. It matters later (stage 12); for now use a mutex for shared resources.</li>
   <li><b>Recursive mutex.</b> A variant that the owner may take twice. Later; this stage needs the normal one.</li>
   <li>Rule of thumb: "an ISR tells a task that data is ready" is a binary semaphore (or a task notification). "Two tasks must not use the bus at the same time" is a mutex.</li></ul>
   <p>Switch to the semaphore and give it from the task that never took it:</p>
   <div data-w="kindlab"></div>`],

  ['5. Keep the critical section short', `<p>While a task holds a lock, everybody else who wants it waits. The worst delay a task can suffer from a lock is the <b>longest time any other task holds it</b>. So the lock must cover exactly what has to be exclusive and nothing more.</p>
   ${holdDia}
   <p class="cap">The reading is 8 ms of bus time. A <code>vTaskDelay(100)</code> before the give extends the hold to 108 ms, and every IMU read planned inside that time waits.</p>
   <pre>/* wrong: the delay is inside the lock */
xSemaphoreTake(i2c_lock, portMAX_DELAY);
thermo_read_celsius(&amp;c);
vTaskDelay(pdMS_TO_TICKS(100));            /* the IMU cannot use the bus for 100 ms */
xSemaphoreGive(i2c_lock);

/* right: give first, then sleep */
xSemaphoreTake(i2c_lock, portMAX_DELAY);
thermo_read_celsius(&amp;c);
xSemaphoreGive(i2c_lock);
vTaskDelay(pdMS_TO_TICKS(100));</pre>
   <ul><li>In the game the wrong version makes the IMU wait 119 ms between reads, against a 20 ms plan. Nothing crashes: the IMU is just late.</li>
   <li>Hold a lock only across the work that needs it. Never block on something unrelated (a delay, a queue, another mutex, a network call) while holding it.</li>
   <li><b>Use a timeout in real code.</b> <code>xSemaphoreTake(i2c_lock, pdMS_TO_TICKS(50))</code> returns <code>pdFALSE</code> if the lock was not free within 50 ms, so the task can log the problem and carry on instead of hanging for ever. Always test the return value.</li>
   <li>The tick matters again: at the ESP-IDF default of 100 Hz a timeout is rounded to 10 ms steps, and <code>pdMS_TO_TICKS(5)</code> is 0 ticks, which is a poll, not a wait (section 6).</li></ul>
   <p>Put a delay inside the lock and watch the IMU gap:</p>
   <div data-w="holdlab"></div>`],

  ['6. Forgotten give, double take and spinning', `<p>Three mistakes account for most mutex bugs.</p>
   <p><b>A Take without a Give.</b> The first lap works. The task never gives, so on lap 2 it takes the mutex it already owns. A normal mutex is not recursive: the task blocks, forever, waiting for itself. The other task also blocks on the same mutex. Neither can ever run again.</p>
   ${deadDia}
   <ul><li>FreeRTOS does not report this. The tasks are Blocked, the idle task runs, the task watchdog is satisfied. The only sign is that readings stop. The game prints a line such as "thermo waits for i2c_lock, which it already holds itself"; on real hardware you find it by looking at what each task is blocked on.</li>
   <li>Early returns are the usual cause in real code: an <code>if (err != ESP_OK) return;</code> between the Take and the Give. Give on every path, or structure the code so there is one exit.</li></ul>
   <p><b>Taking with a timeout of 0.</b> <code>xSemaphoreTake(i2c_lock, 0)</code> never blocks: it returns <code>pdFALSE</code> at once if the lock is taken. A task that retries in a loop is a <b>spinner</b>: it stays Ready and burns CPU, so every task below it starves and the stage 2 deadlines (telemetry gap 105 ms) break. Wait with a real timeout so the task sleeps.</p>
   <p><b>Skipping the lock in one place.</b> Then the lock is decoration. If only the IMU task takes it, the thermometer still starts reads at will, and the collisions come back.</p>
   <p>Remove a give and see which tasks freeze:</p>
   <div data-w="deadlab"></div>`],

  ['7. Alternatives to a lock (after you pass)', `<p>A mutex is not the only way to keep two tasks off one resource. There are three designs, and each makes a different trade.</p>
   ${designDia}
   <ul><li><b>One bus-owner task.</b> Only one task ever touches the bus. Other tasks post a request into a queue (stage 5) and read the answer from another. There is no lock to forget, but there is a queue and a stack to pay for, and the requester sees a longer delay. In the game, a single task that reads both devices in sequence also passes, at 98% CPU instead of 96%.</li>
   <li><b>Critical section.</b> <code>taskENTER_CRITICAL(&amp;mux) ... taskEXIT_CRITICAL(&amp;mux)</code> switches off lower-priority interrupts on this core, so no other task runs. Use it for a few microseconds, such as swapping two pointers. Across a 5 ms transfer it freezes the core and the 1 ms tick; code inside must not block.</li>
   <li><b>The driver may already lock.</b> The ESP-IDF v5 <code>i2c_master</code> driver protects a single call on one bus handle. A sequence of calls, such as write a register address then read it, still needs your mutex. Details are in the build notes of the example.</li>
   <li><b>Dual core.</b> A task on the other core can use the bus at the same moment, so a mutex is needed there too.</li></ul>
   <p>Try the three on the game's bus times:</p>
   <div data-w="designlab"></div>`],
];

export const quiz = [
  { q: 'The IMU task uses the bus 25% of the time and the thermometer task 8%. Why do their reads collide anyway?', opts: ['Together they use 33%, which is above the bus capacity', 'Collisions come from reads that overlap in time, whatever the average load is', 'Because the two tasks have the same priority'], a: 1, why: 'The bus is free 67% of the time, but a transaction only has to start while another is on the wire. The load figures say nothing about order. Priority does not change it either: the bus is not shared by time slices but by starts.', wrong: ["33% is far below 100%, so the bus has spare capacity. A collision needs only two transactions that start at overlapping moments, however low the average load is.", null, "Priority decides which ready task gets the CPU. It does not stop two transfers from overlapping on the wire, so tasks of different priorities collide in the same way."] },
  { q: 'Two tasks each run counter++ once on a shared int. What is the smallest value the counter can end with?', opts: ['0, because both loads can see the initial value', '1, because both can load 0 and store 1', '2, because each task adds exactly one'], a: 1, why: 'Both tasks load 0, add 1 and store 1, the second store overwrites the first. The counter never goes below the value of one successful increment. The result of 2 is the best case, not the guaranteed one.', wrong: ["Each task stores the value it loaded plus 1, so whatever is stored is at least 1. Both tasks loading the initial value does not make either of them store 0.", null, "Two is the result only when the updates do not overlap. If a switch happens between one task's load and its store, the other update is overwritten, so 2 is not guaranteed."] },
  { q: 'Task B calls xSemaphoreTake(i2c_lock, portMAX_DELAY) while task A owns the mutex. What happens to B?', opts: ['B blocks and uses no CPU until A gives the mutex', 'B spins until A gives the mutex, using CPU', 'The call fails at once with pdFALSE and B continues'], a: 0, why: 'With portMAX_DELAY the call blocks with no time limit. B moves to the Blocked state and the scheduler runs other tasks. Only a timeout of 0 returns pdFALSE at once; a retry loop around that is the spinner of section 6.', wrong: [null, "Spinning is what a retry loop around a timeout of 0 does. With portMAX_DELAY the task goes to the Blocked state and uses no CPU.", "A finite timeout that runs out, or a timeout of 0, returns pdFALSE. portMAX_DELAY has no time limit, so the call waits instead of failing."] },
  { q: 'A driver ISR must tell a task that new data is ready. Which object fits, and which fits "protect the bus"?', opts: ['Mutex for the ISR signal, binary semaphore for the bus', 'Binary semaphore for the ISR signal, mutex for the bus', 'Mutex for both, they are the same object'], a: 1, why: 'A semaphore has no owner and can be given by an ISR, which is what signalling needs. A mutex has an owner and may not be used from an ISR; it guards a resource and gives priority inheritance. The two share their API but not their meaning.', wrong: ["This swaps the two roles. A mutex has an owner and may not be used from an ISR, so an ISR cannot give it as a signal.", null, "They share the Take and Give calls but are different objects. A mutex has an owner and priority inheritance and starts available. A binary semaphore has neither and starts empty."] },
  { q: 'Why is a vTaskDelay between xSemaphoreTake and xSemaphoreGive a bug even though the IMU still reads?', opts: ['The delay is not allowed while a mutex is held', 'The other task cannot use the bus for the whole delay, so its reads come late', 'The mutex is released automatically when the task sleeps'], a: 1, why: 'The call is allowed and the mutex stays owned while the task sleeps. Everyone else waits for the whole delay: the IMU gap grows to 119 ms in the game, past its 40 ms limit. Give the lock first, then sleep.', wrong: ["The call is legal. FreeRTOS does not forbid sleeping while a mutex is held. The cost is paid by every other task that wants the lock.", null, "Sleeping does not release a mutex. It stays owned by the sleeping task until that task gives it."] },
  { q: 'A task takes a normal mutex it already owns, with portMAX_DELAY. What does it do?', opts: ['Takes it again, a counter goes to 2', 'Blocks forever, waiting for itself', 'The call returns pdFALSE at once'], a: 1, why: 'A normal mutex has no count: the second Take finds it unavailable and blocks. Nobody else can give it, because only the owner may, and the owner is asleep. Use a recursive mutex only if you really need nested takes.', wrong: ["A normal mutex has no take count. Only a recursive mutex, a separate type, counts nested takes.", null, "With portMAX_DELAY the call waits and does not fail. A return of pdFALSE comes from a timeout, and a timeout of 0 is not what this call uses."] },
  { q: 'Why can you not hold a taskENTER_CRITICAL section across a 5 ms I2C transfer?', opts: ['The call refuses sections longer than 1 ms', 'Lower-priority interrupts are off on that core and no other task runs for 5 ms, so timing and the interrupt watchdog suffer', 'It would corrupt the bus'], a: 1, why: 'A critical section is a spinlock plus masked interrupts (up to the syscall priority limit). Other tasks and FreeRTOS-managed ISRs on the core cannot run until it ends. It suits microseconds, not millisecond transfers where a mutex lets the rest of the system keep working.', wrong: ["No such limit exists in the call. A critical section can be held for any length of time, which is exactly why misuse is possible.", null, "The I2C hardware drives the bus, and a critical section does not touch it. The harm is done to everything else on the core."] },
];
