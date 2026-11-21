// Field manual for stage 14 (ESP-IDF): production hardening. Task watchdog, honest feeding, stack margins, heap leaks, diagnostics.
import { svg, box, arrow, note } from '../widgets.js';

const bar = (x, y, w, cls, h = 20) => `<rect class="bx ${cls}" x="${x}" y="${y}" width="${Math.max(1, w)}" height="${h}" rx="2"/>`;
const axis = (x0, x1, y) => `<line class="ar" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" marker-end="url(#ah)"/>`;

/* ================= widgets ================= */

const frame = (title, body) => `<div class="wg"><div class="wgh">INTERACTIVE · ${title}</div>${body}</div>`;
const sl = (id, label, min, max, v, step = 1) => `<label>${label} <input type="range" data-${id} min="${min}" max="${max}" step="${step}" value="${v}"> <b data-${id}v></b></label>`;
const val = (el, id, unit = ' ms') => { const v = +el.querySelector('[data-' + id + ']').value; el.querySelector('[data-' + id + 'v]').textContent = v + unit; return v; };

// Widget 1: finding board. Click a symptom, see the tool and the section that answers it.
function finding(el) {
  const S = [
    ['E (318) task_wdt: Task watchdog got triggered: camera', 'The task watchdog. A subscribed task did not call esp_task_wdt_reset() within the timeout.', 'Section 2 (what the watchdog checks) and section 3 (who may be subscribed).', 'camera sleeps 240 ms, compresses, sleeps 240 ms again: its loop is 540 ms and the timeout is 300 ms. The task is healthy; the subscription is wrong.'],
    ['pvPortMalloc returned NULL, then StoreProhibited', 'The heap. Something allocated more than it freed, so the heap ran out. Free heap, read over time, shows it long before the crash.', 'Section 5 (heap and leaks).', 'diag allocates 2048 B every 150 ms and never frees it. The game ends the run at 637 ms.'],
    ['beacon: 0 B of its stack never used', 'The stack high-water mark. The task has used every byte it owns and survives only because its deepest path has not gone one byte deeper.', 'Section 4 (stack margins).', 'beacon, heart, motor, spectro and diag have 0 to 20 B spare. The review rule is 32 B.'],
  ];
  el.innerHTML = frame('FINDING BOARD: CLICK A SYMPTOM', `<div class="wgrow">${S.map((s, i) => `<button class="hb" data-i="${i}">${s[0]}</button>`).join('')}</div><div data-out><p class="wgcap">Each symptom comes from a different part of the kernel and needs a different tool.</p></div>`);
  el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
    const s = S[+b.dataset.i];
    el.querySelectorAll('[data-i]').forEach(x => x.classList.toggle('hot', x === b));
    el.querySelector('[data-out]').innerHTML = `<p class="wgcap"><b>Tool:</b> ${s[1]}<br><b>Read:</b> ${s[2]}<br><b>In the game:</b> ${s[3]}</p>`;
  });
}

// Widget 2: does the loop of each watched task finish before the timeout? Longest gap between two resets, against the timeout.
function wdtlab(el) {
  const T = [['motor', 10, 'motorStep (about 2 ms) and a 8 ms delay'], ['camera', 540, 'delay 240, compress, delay 240'], ['science', 420, 'waits 420 ms for the instrument between bursts']];
  el.innerHTML = frame('WILL THE WATCHDOG BITE A HEALTHY TASK?', `<div class="wgrow">${sl('t', 'watchdog timeout', 50, 1000, 300, 10)}<label><input type="checkbox" data-b> camera resets between its phases</label></div><div data-out></div>`);
  const draw = () => {
    const to = val(el, 't'), btw = el.querySelector('[data-b]').checked, MAX = 600, W = 420;
    const X = v => 120 + Math.min(v, MAX) / MAX * W;
    let s = '', bitten = [];
    T.forEach(([n, loop, why], i) => {
      const gap = n === 'camera' && btw ? 270 : loop, bad = gap >= to, y = 20 + i * 44;
      if (bad) bitten.push(n);
      s += note(114, y + 15, n, 'end') + bar(X(0), y, X(gap) - X(0), bad ? 'r' : 'g') + note(X(Math.min(gap, MAX)) + 6, y + 15, `${gap} ms between resets` + (bad ? ': bitten' : ''), 'start');
    });
    s += `<line class="dash" x1="${X(to)}" y1="8" x2="${X(to)}" y2="150"/>` + note(X(to), 164, `timeout ${to} ms`, 'middle') + axis(120, 550, 152);
    el.querySelector('[data-out]').innerHTML = svg(720, 172, s, 'Longest time between two watchdog resets of each task, against the timeout')
      + `<p class="wgcap">${bitten.length ? `<span class="bad">${bitten.join(' and ')} trips the watchdog.</span> The task is healthy; its design simply cannot reset in time.` : `<span class="good">Every task resets in time.</span>`} Game: timeout 300 ms. camera 540 ms and science 420 ms both trip it (at 318 ms and 385 ms). Real ESP-IDF default is 5 s (<code>CONFIG_ESP_TASK_WDT_TIMEOUT_S</code>), scaled down here so that a 1 s test can show it. Resetting between the phases (second box) keeps camera under 300 ms, but below a timeout of 270 ms it trips again.</p>`;
  };
  el.addEventListener('input', draw); draw();
}

// Widget 3: where does the reset go? Three placements against a healthy task and a hung one.
function honest(el) {
  el.innerHTML = frame('WHERE DOES THE RESET GO?', `<div class="wgrow"><label>reset is called <select data-p><option value="end">at the end of the loop, after the work</option><option value="top">at the top of the loop, before the work</option><option value="timer">by a helper that feeds a user entry every 100 ms, unchecked</option></select></label><label>the work <select data-h><option value="ok">finishes every pass</option><option value="hang">blocks for ever on pass 4</option></select></label></div><div data-out></div>`);
  const draw = () => {
    const p = el.querySelector('[data-p]').value, hung = el.querySelector('[data-h]').value === 'hang', TO = 300, PER = 100, HANG = 3 * PER, X = t => 60 + t * 0.62;
    // feeds: the times when esp_task_wdt_reset() runs. The hang starts when pass 4 (t = 300) enters its work.
    const feeds = [];
    for (let t = 0; t <= 900; t += PER) {
      if (p === 'timer') feeds.push(t);
      else if (p === 'top') { if (!hung || t <= HANG) feeds.push(t); }
      else if (!hung || t + 20 <= HANG) feeds.push(t + 20);
    }
    const last = feeds.length ? feeds[feeds.length - 1] : 0, trip = last + TO, caught = hung && trip <= 900;
    let s = note(54, 38, 'task', 'end') + note(54, 90, 'resets', 'end');
    for (let t = 0; t < 900; t += PER) { if (hung && t >= HANG) break; s += bar(X(t), 24, X(60) - X(0), 'c'); }
    if (hung) s += bar(X(HANG), 24, X(900 - HANG) - X(0), 'blko') + note(X(HANG + 20), 18, 'hung', 'start');
    feeds.forEach(t => { s += `<line class="tick n" x1="${X(t)}" y1="74" x2="${X(t)}" y2="98"/>`; });
    if (caught) s += `<line class="dash" x1="${X(trip)}" y1="10" x2="${X(trip)}" y2="104"/>` + note(X(trip), 120, `watchdog trips at ${trip} ms`, 'middle');
    s += axis(60, 640, 108) + [0, 300, 600, 900].map(t => note(X(t), 138, t + ' ms', 'middle')).join('');
    el.querySelector('[data-out]').innerHTML = svg(700, 146, s, 'Task activity and the moments when the watchdog was reset')
      + `<p class="wgcap">${!hung ? '<span class="good">Nothing is hung, nothing trips.</span> All three placements look the same while the task is healthy. That is why the wrong ones survive testing.' : p === 'timer' ? '<span class="bad">Never caught.</span> The helper keeps running while the task is hung, so the dog is fed for ever. The watchdog now hides the one failure it exists for.' : p === 'top' ? `<span class="good">Caught,</span> ${trip} ms, but the last reset only proved that the task reached the top of its loop, not that a pass ever finished. A task that hangs in the second half of a long loop is reported late.` : `<span class="good">Caught at ${trip} ms,</span> ${TO} ms after the last pass that completed. A reset after the work means "a full pass has been done".`}</p>`;
  };
  el.querySelectorAll('select').forEach(s => s.onchange = draw); draw();
}

// Widget 4: stack sizes, spare bytes and the 32 B rule. Peaks are the game's measured values (768 B context plus the deepest call).
function stackmargin(el) {
  const T = [['beacon', 768, 800], ['heart', 768, 800], ['motor', 1068, 1100], ['spectro', 1268, 1300], ['diag', 2168, 2200]], RULE = 32;
  el.innerHTML = frame('STACK SIZE AND SPARE BYTES', `<div class="wgrow">${T.map((t, i) => `<label>${t[0]} <input type="range" data-s="${i}" min="${t[1] - 64}" max="${t[1] + 128}" step="4" value="${t[1]}"> <b data-sv="${i}"></b></label>`).join('')}</div><div data-out></div>`);
  const draw = () => {
    let rows = '', ram = 0, thin = [], over = [];
    T.forEach((t, i) => {
      const size = +el.querySelector(`[data-s="${i}"]`).value, spare = size - t[1];
      el.querySelector(`[data-sv="${i}"]`).textContent = size + ' B';
      ram += size;
      const cls = spare < 0 ? 'bad' : spare < RULE ? 'bad' : 'good';
      if (spare < 0) over.push(t[0]); else if (spare < RULE) thin.push(t[0]);
      rows += `<tr><td>${t[0]}</td><td>${t[1]} B</td><td>${size} B</td><td class="${cls}">${spare < 0 ? 'overflow (' + spare + ')' : spare + ' B'}</td></tr>`;
    });
    el.querySelector('[data-out]').innerHTML = `<table class="wtab"><tr><th>task</th><th>peak seen</th><th>stack</th><th>spare</th></tr>${rows}</table>`
      + `<p class="wgcap">${over.length ? `<span class="bad">${over.join(', ')} overflows the first time it reaches its deepest call.</span> ` : ''}${thin.length ? `<span class="bad">Under ${RULE} B spare: ${thin.join(', ')}.</span> ` : ''}${!over.length && !thin.length ? `<span class="good">Every task keeps at least ${RULE} B.</span> ` : ''}Stacks of these five tasks: ${ram} B. The ${RULE} B rule is the game's; a real task that logs with ESP_LOGx keeps hundreds of bytes, and a safe size is found by measuring and then adding a margin, never by hitting the peak exactly.</p>`;
  };
  el.addEventListener('input', draw); draw();
}

// Widget 5: heap curve for diag. Pick where the free goes. Idealised: 8192 B, 2048 B taken per cycle, nothing else allocates.
function heapcurve(el) {
  el.innerHTML = frame('WHERE DOES diag FREE ITS BUFFER?', `<div class="wgrow"><label>diag does <select data-m><option value="none">allocFrame, log, flash (no free)</option><option value="after">allocFrame, log, flash, freeFrame</option><option value="before">allocFrame, log, freeFrame, flash</option><option value="twice">allocFrame, log, flash, freeFrame, freeFrame</option></select></label></div><div data-out></div>`);
  const draw = () => {
    const m = el.querySelector('[data-m]').value, HEAP = 8192, N = 7;
    let free = HEAP, fail = 0; const h = [HEAP];
    for (let k = 1; k <= N; k++) {
      if (free < 2048) { fail = k; break; }
      free -= 2048;
      if (m === 'after' || m === 'before') free += 2048; else if (m === 'twice') free += 4096;
      h.push(free);
    }
    const hi = Math.max(...h, HEAP), n = h.length, X = i => 60 + i / (N) * 620, Y = v => 130 - v / (hi) * 105;
    let s = `<line class="ar" x1="60" y1="130" x2="706" y2="130"/><line class="ar" x1="60" y1="130" x2="60" y2="14"/>` + note(56, Y(HEAP) + 4, '8192', 'end') + note(56, 134, '0', 'end');
    s += `<line class="dash" x1="60" y1="${Y(HEAP)}" x2="700" y2="${Y(HEAP)}"/>` + note(64, 12, 'heap_caps_get_free_size(MALLOC_CAP_8BIT) after each 150 ms cycle');
    s += `<polyline fill="none" stroke="#5fe3ff" stroke-width="2.5" points="${h.map((v, i) => X(i) + ',' + Y(v)).join(' ')}"/>` + h.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="3" fill="#5fe3ff"/>`).join('');
    if (fail) s += `<circle cx="${X(n - 1)}" cy="${Y(h[n - 1])}" r="7" fill="none" stroke="#ff5d4d" stroke-width="2.5"/>` + note(X(n - 1) - 10, Y(h[n - 1]) - 12, 'NULL', 'end');
    s += [0, 1, 2, 3, 4, 5, 6, 7].map(i => note(X(i), 148, i * 150, 'middle')).join('');
    const end = h[h.length - 1];
    el.querySelector('[data-out]').innerHTML = svg(720, 156, s, 'Free heap after each diag cycle')
      + `<p class="wgcap">${m === 'none' ? `<span class="bad">The curve only goes down.</span> The allocation of cycle ${fail} finds ${end} B and returns NULL. The game ends the run with <code>pvPortMalloc</code> at 637 ms (the rover's other tasks hold part of the heap, so the real run ends before this idealised curve does).` : m === 'twice' ? `<span class="bad">The curve climbs above the 8192 B that exist.</span> The second free returns memory that was never allocated: heap corruption. The game stops the run at the second <code>vPortFree</code> with a CORRUPT HEAP abort, as a heap with integrity checks does on real hardware.` : `<span class="good">A flat line at 8192 B.</span> ${m === 'before' ? 'Freeing before the flash write is legal, because the snapshot is already in the log by then, but it shortens the buffer life and leaves less time in the 100 ms budget when the flash write blocks. ' : 'The pair allocFrame / freeFrame sits in one task, in one pass, so it is easy to audit. '}A tiny leak shows the same curve with a shallower slope: only the time to the first NULL changes.`}</p>`;
  };
  el.querySelector('select').onchange = draw; draw();
}

// Widget 6: diag priority against the real-time deadline of vision. Measured values from the game at priority 1, 2 and 3.
function diagprio(el) {
  const M = { 1: [20, 13], 2: [26, 13], 3: [24, 17] };
  el.innerHTML = frame('HOW URGENT IS THE SNAPSHOT TASK?', `<div class="wgrow"><label>diag priority <select data-p><option value="1">1 (the reference)</option><option value="2">2 (same as vision, fusion)</option><option value="3">3</option></select></label></div><div data-out></div>`);
  const draw = () => {
    const p = +el.querySelector('[data-p]').value, [fr, rd] = M[p], X = v => 190 + v / 30 * 450, okF = fr <= 25, okR = rd <= 15;
    const row = (y, n, v, lim) => note(184, y + 15, n, 'end') + bar(X(0), y, X(v) - X(0), v <= lim ? 'g' : 'r') + `<line class="dash" x1="${X(lim)}" y1="${y - 6}" x2="${X(lim)}" y2="${y + 26}"/>` + note(X(v) + 6, y + 15, v + ' ms' + (v > lim ? ' (limit ' + lim + ')' : ''), 'start');
    const s = row(14, 'hazard frame, worst', fr, 25) + row(56, 'hazard read, worst', rd, 15) + axis(190, 700, 100) + [0, 10, 20, 30].map(t => note(X(t), 116, t + ' ms', 'middle')).join('');
    el.querySelector('[data-out]').innerHTML = svg(720, 124, s, 'Worst delay of the hazard frame and the hazard read against their limits')
      + `<p class="wgcap">${okF && okR ? '<span class="good">Both deadlines hold.</span>' : '<span class="bad">A stage 13 deadline breaks.</span>'} ${p === 1 ? 'At priority 1 on core 0 the snapshot only runs when vision and fusion are blocked, and it still writes six snapshots at most 50 ms after their slots.' : p === 2 ? 'Same priority as vision: the scheduler time-slices them, vision loses part of its slot to housekeeping and its frame is 26 ms late.' : 'Above vision and fusion: diag runs first in its slot, and fusion\'s read slips to 17 ms. Housekeeping that outranks the real-time path has the order of importance backwards.'} Measured in the game; the numbers are for this rover only.</p>`;
  };
  el.querySelector('select').onchange = draw; draw();
}

export const widgets = { finding, wdtlab, honest, stackmargin, heapcurve, diagprio };

/* ================= diagrams ================= */

// 1. The review checklist: three findings and the tools that prove them
const checkDia = svg(720, 190, (() => {
  let s = box(10, 10, 700, 34, 'Flight readiness: firmware that fails visibly and has margin', 'd');
  const col = (x, title, tool, find, cls) => box(x, 62, 220, 36, title, cls) + arrow(x + 110, 98, x + 110, 112) + box(x, 112, 220, 34, tool, 'd') + arrow(x + 110, 146, x + 110, 158) + note(x + 110, 176, find, 'middle');
  s += col(10, 'nothing waits for ever', 'esp_task_wdt_add / _reset', 'which task is stuck?', 'c');
  s += col(250, 'nothing leaks', 'heap_caps_get_free_size()', 'does free heap come back?', 'a');
  s += col(490, 'nothing at its last byte', 'uxTaskGetStackHighWaterMark()', 'how close to the edge?', 'g');
  return s;
})(), 'Three review rules, the ESP-IDF tool that checks each one and the question it answers');

// 2a. Task watchdog: feeding and missing
const wdtDia = svg(720, 180, (() => {
  const X = t => 110 + t * 1.8; let s = note(104, 36, 'healthy task', 'end') + note(104, 100, 'hung task', 'end');
  [0, 100, 200, 300].forEach(t => { s += bar(X(t), 24, X(15) - X(0), 'c') + `<line class="tick n" x1="${X(t + 15)}" y1="50" x2="${X(t + 15)}" y2="62"/>`; });
  s += note(X(15), 76, 'esp_task_wdt_reset()', 'start');
  s += bar(X(0), 88, X(15) - X(0), 'c') + `<line class="tick n" x1="${X(15)}" y1="114" x2="${X(15)}" y2="126"/>` + bar(X(15), 88, X(285) - X(0), 'blko') + note(X(150), 82, 'blocked in a driver call', 'middle');
  s += `<line class="dash" x1="${X(315)}" y1="12" x2="${X(315)}" y2="140"/>` + note(X(315), 156, 'timeout: the trap', 'end') + note(X(15), 140, 'timeout counted from the last reset', 'start');
  s += axis(110, 690, 168);
  return s;
})(), 'A healthy task resets the watchdog every loop, a hung task does not and the timeout fires');

// 2b. What the task watchdog watches in ESP-IDF
const twdtDia = svg(720, 120, (() => {
  return box(10, 14, 160, 50, 'esp_task_wdt|table of subscribed|tasks', 'a') + arrow(170, 39, 280, 39, 'checked by a timer')
    + box(280, 14, 180, 50, 'every subscriber reset|since the last check?', 'c') + arrow(460, 39, 495, 39, 'no') + box(495, 14, 215, 50, 'log the task names,|panic or just print|(CONFIG_ESP_TASK_WDT_PANIC)', 'r')
    + note(10, 92, 'subscribers: IDLE0, IDLE1 (CONFIG_ESP_TASK_WDT_CHECK_IDLE_TASK_CPU0/1) and your own tasks', 'start') + note(10, 110, 'your task joins with esp_task_wdt_add(NULL), once', 'start');
})(), 'The task watchdog checks a list of subscribers and reacts to the ones that did not reset');

// 3. Three loops: honest, reset at top, unconditional helper feeding a user entry
const loopsDia = svg(720, 170, (() => {
  const col = (x, title, lines, cls) => box(x, 10, 220, 28, title, cls) + lines.map((l, i) => box(x, 46 + i * 28, 220, 24, l[0], l[1])).join('');
  return col(10, 'honest: reset after the work', [['read_sensor()', 'd'], ['process()', 'd'], ['esp_task_wdt_reset()', 'g'], ['vTaskDelay(...)', 'd']], 'g')
    + col(250, 'at the top: proves little', [['esp_task_wdt_reset()', 'a'], ['read_sensor()', 'd'], ['process()', 'd'], ['vTaskDelay(...)', 'd']], 'a')
    + col(490, 'from a helper: hides hangs', [['helper: reset_user()', 'r'], ['task: read_sensor()', 'd'], ['task: process()  (hangs)', 'd'], ['dog is still fed', 'r']], 'r');
})(), 'Honest reset after the work, reset at the top of the loop, unconditional reset_user() from a helper');

// 4. Stack bar for diag
const stackDia = svg(740, 150, (() => {
  const X = v => 20 + v / 2400 * 680; let s = note(20, 14, 'diag: stack of 2200 B (the reference) against a peak of 2168 B', 'start');
  s += bar(X(0), 26, X(768) - X(0), 'd', 30) + note(X(384), 46, 'context 768 B', 'middle');
  s += bar(X(768), 26, X(2168) - X(768), 'c', 30) + note(X(1468), 46, 'deepest call: logToFlash + callees 1400 B', 'middle');
  s += bar(X(2168), 26, X(2200) - X(2168), 'a', 30);
  s += `<line class="dash" x1="${X(2200)}" y1="18" x2="${X(2200)}" y2="70"/>` + note(X(2200) + 6, 84, 'limit 2200 B', 'start') + note(X(2168), 84, 'peak 2168 B', 'end') ;
  s += `<line class="dash" x1="${X(2048)}" y1="18" x2="${X(2048)}" y2="70"/>` + note(X(2048) - 6, 100, 'a 2048 B stack: overflow at the first deep call', 'end');
  s += box(20, 112, 660, 28, 'spare = limit - peak = 32 B; the review rule needs 32 B', 'g');
  return s;
})(), 'Stack of diag: context, deepest call, and the 32 byte margin');

// 5. Heap falling until malloc fails
const heapDia = svg(720, 170, (() => {
  const X = t => 70 + t * 0.9, Y = v => 130 - v / 8192 * 100; let s = note(66, 34, '8192', 'end') + note(66, 134, '0', 'end');
  const pts = [[0, 8192], [150, 6144], [300, 4096], [450, 2048], [600, 0]];
  s += `<polyline fill="none" stroke="#5fe3ff" stroke-width="2.5" points="${pts.map(p => X(p[0]) + ',' + Y(p[1])).join(' ')}"/>` + pts.map(p => `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3" fill="#5fe3ff"/>`).join('');
  s += `<circle cx="${X(600)}" cy="${Y(0)}" r="8" fill="none" stroke="#ff5d4d" stroke-width="2.5"/>` + note(X(600) - 12, Y(0) - 12, 'next allocation returns NULL', 'end');
  s += note(X(80), 22, '2048 B lost every 150 ms (idealised curve; the game run ends at 637 ms)', 'start') + axis(70, 700, 144) + [0, 150, 300, 450, 600].map(t => note(X(t), 160, t + ' ms', 'middle')).join('');
  return s;
})(), 'Free heap falls 2 KB per diag cycle until an allocation fails');

// 6. The solution chart
const solDia = svg(720, 190, (() => {
  const X = t => 90 + t * 0.58; let s = note(84, 36, 'vision', 'end') + note(84, 76, 'fusion', 'end') + note(84, 116, 'diag', 'end');
  [0, 50, 100, 150, 200, 250, 300].forEach(t => { s += bar(X(t + 2), 24, X(14) - X(0), 'c') + bar(X(t + 16), 64, X(8) - X(0), 'c'); });
  [150, 300].forEach(t => { s += bar(X(t + 22), 104, X(8) - X(0), 'rdy') + bar(X(t + 30), 104, X(20) - X(0), 'blko') + bar(X(t + 50), 104, X(2) - X(0), 'g'); });
  s += note(X(150), 98, 'wakes at 150 ms, gets the CPU when vision and fusion are blocked', 'start') + note(X(150), 150, 'flash write finished 50 ms after the slot', 'start');
  s += axis(90, 700, 164) + [0, 100, 200, 300, 400].map(t => note(X(t), 180, t + ' ms', 'middle')).join('');
  return s;
})(), 'diag runs in the gaps of vision and fusion on core 0 and finishes each snapshot about 50 ms after its slot');

/* ================= realCode ================= */

export const realCode = `// main/rover_main.c   (ESP-IDF v5.x)   stage 14: stage 13 hardened for flight
//   - task watchdog: only motor is subscribed (camera and science block longer than the timeout by design)
//   - diag: a low-priority snapshot task that allocates, logs, writes to flash and FREES its buffer
//   - stack sizes: peak seen + 32 B margin (the game's rule; real tasks keep far more)
#include <stdint.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_task_wdt.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "rover.h"   // rover helpers: motor_step(), compress_frame(), read_sample(), log_status(), log_to_flash(), ... (not shown)

static const char *TAG = "rover";

#define PRIO_DIAG      1     // below everything with a deadline
#define CORE_DIAG      0     // core 1 is at 95 %: a task there starves IDLE1
#define DIAG_PERIOD_MS 150   // the game scales this down; a real snapshot is every few seconds
#define FRAME_BYTES    2048

// motor must run every 8 ms: a hung motor task is exactly what the watchdog is for.
static void motor_task(void *arg)
{
    ESP_ERROR_CHECK(esp_task_wdt_add(NULL)); // subscribe THIS task, ONCE, before the loop (fails if the TWDT is not initialised)
    for (;;) {
        motor_step();                        // about 2 ms
        vTaskDelay(pdMS_TO_TICKS(8));
        esp_task_wdt_reset();                // after the work: "a full pass finished"
    }
}

// camera: a 540 ms loop by design (240 ms sleep, compress, 240 ms sleep). NOT subscribed: it would trip a 300 ms timeout.
static void camera_task(void *arg)
{
    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(240));
        compress_frame();
        vTaskDelay(pdMS_TO_TICKS(240));
    }
}

// science: waits 420 ms for the instrument between bursts. NOT subscribed either.
static void science_task(void *arg)
{
    for (;;) {
        read_sample();                       // blocks on the instrument
        send_sample_to_radio();              // stands for the game's sn('samples')
    }
}

static void diag_task(void *arg)
{
    TickType_t last = xTaskGetTickCount();
    for (;;) {
        xTaskDelayUntil(&last, pdMS_TO_TICKS(DIAG_PERIOD_MS));
        uint8_t *frame = heap_caps_malloc(FRAME_BYTES, MALLOC_CAP_8BIT);   // allocFrame
        if (frame == NULL) {                 // never use the pointer unchecked
            ESP_LOGE(TAG, "diag: out of heap, %u B free", (unsigned)heap_caps_get_free_size(MALLOC_CAP_8BIT));
            continue;
        }
        log_status(frame);                   // logStatus: about 3 ms of CPU
        log_to_flash(frame, FRAME_BYTES);    // logToFlash: blocks about 20 ms on the flash, never call it from an ISR
        heap_caps_free(frame);               // freeFrame: every allocation gets exactly one free
    }
}

void app_main(void)
{
    // Recent IDF v5.x (esp_task_wdt_reconfigure() exists from v5.0.1, not in v5.0.0): the task watchdog is normally already
    // initialised by the startup code (CONFIG_ESP_TASK_WDT_INIT).
    // To set the timeout yourself (in the game it is 300 ms; the default is 5 s):
    //   const esp_task_wdt_config_t cfg = { .timeout_ms = 300, .idle_core_mask = 0x3, .trigger_panic = true };
    //   esp_task_wdt_reconfigure(&cfg);   // esp_task_wdt_init(&cfg) returns ESP_ERR_INVALID_STATE when the startup code already initialised it

    // Stages 1 to 13: beacon, heart, telemetry, spectro, vision, fusion, bus, ... (unchanged, in rover_tasks_create()).
    // Their stack sizes follow the margin rule: beacon 800, heart 800, motor 1100, spectro 1300 (game bytes).
    rover_tasks_create();
    xTaskCreatePinnedToCore(motor_task,   "motor",   1100, NULL, 3, NULL, 1);
    xTaskCreatePinnedToCore(camera_task,  "camera",  4096, NULL, 1, NULL, 1);
    xTaskCreatePinnedToCore(science_task, "science", 3072, NULL, 1, NULL, 1);
    xTaskCreatePinnedToCore(diag_task,    "diag",    2200, NULL, PRIO_DIAG, NULL, CORE_DIAG);
    ESP_LOGI(TAG, "flight build: %u B heap free", (unsigned)heap_caps_get_free_size(MALLOC_CAP_8BIT));
}

// Build notes
//   idf.py menuconfig   Component config > ESP System Settings   (CONFIG_ESP_TASK_WDT_TIMEOUT_S, default 5)
//                       same menu: CONFIG_ESP_TASK_WDT_PANIC (default off: the dog only prints)
//                       Component config > FreeRTOS > Kernel > configCHECK_FOR_STACK_OVERFLOW (CONFIG_FREERTOS_CHECK_STACKOVERFLOW_{NONE,PTRVAL,CANARY}, default CANARY)
//   Game sizes are small on purpose: a real task that logs with ESP_LOGx needs about 2048 B or more.
//   To read the margin on hardware: uxTaskGetStackHighWaterMark(NULL) inside the task, after a full test run.
//   idf.py build flash monitor`;

/* ================= manual ================= */

export const manual = [
  ['1. The review checklist', `<p>A rover that passes its tests is not yet flight ready. A flight review asks four things of the firmware: <b>nothing waits for ever</b>, <b>nothing leaks</b>, <b>nothing runs one byte from its limit</b>, and <b>when something does fail the rover says what and why</b>. Each question has a tool in ESP-IDF, and each one can fail without any of the earlier stages noticing.</p>
   ${checkDia}
   <p>Flash it and read what fails. A crash hides everything after it, so fixes reveal the next finding.</p>
   <ul><li>The three tools measure different resources and cannot replace one another. The watchdog sees time, the high-water mark sees stack, the heap functions see heap.</li>
   <li>Real timings are scaled for the game. The game watchdog timeout is 300 ms; the ESP-IDF default is 5 s. A real snapshot task runs every few seconds, not every 150 ms. The game's tick is 1 ms (as if <code>CONFIG_FREERTOS_HZ</code> were 1000); the ESP-IDF default is 100 Hz.</li></ul>
   <div data-w="finding"></div>`],

  ['2. The task watchdog', `<p>The task watchdog timer (TWDT) is a list of <b>subscribers</b> and a timer. Every subscriber has to call <code>esp_task_wdt_reset()</code> within the timeout. When one does not, the TWDT prints the names of the tasks that missed it and, if configured, panics.The game panics on the first trip, so the run ends there.</p>
   ${twdtDia}
   <p>Two subscribers exist without any code from you: the idle tasks <code>IDLE0</code> and <code>IDLE1</code> (<code>CONFIG_ESP_TASK_WDT_CHECK_IDLE_TASK_CPU0</code>, <code>_CPU1</code>). A task that never blocks starves its idle task and the dog trips, which is what stage 13 showed. Your own tasks are not subscribed until they ask.</p>
   ${wdtDia}
   <pre>void motor_task(void *arg)
{
    esp_task_wdt_add(NULL);          // subscribe the calling task, ONCE, before the loop
    for (;;) {
        motor_step();
        vTaskDelay(pdMS_TO_TICKS(8));
        esp_task_wdt_reset();        // every pass, from this task
    }
}</pre>
   <ul><li><b>Once, before the loop.</b> <code>esp_task_wdt_add(NULL)</code> in the loop is wrong on real hardware: after the first call the task is already subscribed and the call returns <code>ESP_ERR_INVALID_ARG</code>. The game's code editor shows the call inside the loop to keep the block model simple; in firmware it goes before the <code>for (;;)</code>.</li>
   <li><b>Timeout.</b> <code>CONFIG_ESP_TASK_WDT_TIMEOUT_S</code>, default 5 s. In recent v5.x releases it is also set at run time with an <code>esp_task_wdt_config_t</code> (<code>timeout_ms</code>, <code>idle_core_mask</code>, <code>trigger_panic</code>) passed to <code>esp_task_wdt_reconfigure()</code>; <code>esp_task_wdt_init()</code> takes the same struct but returns <code>ESP_ERR_INVALID_STATE</code> when the startup code has already initialised the watchdog, which is the default (<code>esp_task_wdt_reconfigure()</code> exists from v5.0.1; v5.0.0 does not have it). The game uses 300 ms.</li>
   <li><b>Who may be subscribed.</b> A task that must run regularly: it has a worst-case loop time and that time is shorter than the timeout. A task that sleeps or waits longer than the timeout by design (camera, 540 ms per loop; science, 420 ms waiting for the instrument; the arm, which sleeps 10 s) is <b>not</b> subscribed. The dog would bite a healthy task and reset the rover.</li>
   <li>The game's trip message always prints <code>(CPU 0)</code>, even for tasks on core 1. Real ESP-IDF prints the core the task is pinned to, or <code>(CPU 0/1)</code> for an unpinned task.</li></ul>
   <div data-w="wdtlab"></div>`],

  ['3. Feeding the watchdog honestly', `<p>The watchdog only protects when a reset means "this task is still doing its job". Three ways of feeding it look the same on a healthy rover and differ when something breaks.</p>
   ${loopsDia}
   <ul><li><b>After the work, from the task's own loop</b> (left). A reset at the end of a pass says a full pass completed. A task hung inside <code>process()</code> never gets there and trips the dog, timeout after its last good pass.</li>
   <li><b>At the top, "just in case"</b> (middle). It proves the loop was entered, not that it finished. A hang late in the pass is reported up to a full pass later, and a long pass looks the same as a stuck one. Use it only when the work is trivially short.</li>
   <li><b>From a helper that does not check the work</b> (right). A helper that feeds for the task hides hangs: the dog is fed while the task is stuck. This is worse than no watchdog, because it adds a false sense of safety.</li>
   <li><b>A longer timeout hides problems.</b> Raising the timeout until nothing trips fixes the symptom. Choose it from the worst legitimate loop time plus a margin (the game's 300 ms against motor's 10 ms is already generous).</li>
   <li><b>A long loop can feed between phases.</b> Camera could stay subscribed with a reset after each 240 ms sleep (longest gap 240 ms to 270 ms, under 300 ms). It passes, but it ties the design to the timeout. Not subscribing is simpler. Both are accepted by the stage.</li>
   <li><b>Subscribing without ever resetting</b> is a reset waiting to happen, and the stage checks for it by reading the code: a subscribed task must contain <code>esp_task_wdt_reset()</code>.</li></ul>
   <div data-w="honest"></div>
   <details><summary><b>Real ESP-IDF detail</b></summary><ul><li>A helper can feed a user entry (<code>esp_task_wdt_add_user()</code>, then <code>esp_task_wdt_reset_user()</code> every period), or a subscribed supervisor task can reset every period whatever the worker does.</li>
   <li>Plain <code>esp_task_wdt_reset()</code> from a timer callback resets the entry of the <b>calling</b> task, the timer service task. That task is not subscribed, so the call returns <code>ESP_ERR_NOT_FOUND</code> and feeds nothing: the worker would trip even when healthy.</li></ul></details>`],

  ['4. Stack margins', `<p>Each task owns a fixed stack, given to <code>xTaskCreate()</code>. The kernel fills it with a pattern when the task is created. <code>uxTaskGetStackHighWaterMark(NULL)</code> scans for the lowest point the pattern was ever overwritten and returns the bytes that were <b>never used</b>: the smaller the number, the closer the task has come to overflow.</p>
   ${stackDia}
   <ul><li><b>Peak is a lower bound.</b> The mark shows the deepest path that <b>ran</b>, not the deepest path that exists. An error handler, a rare log line or a bigger packet can take the task deeper later. A task at 12 B spare after a full test is not "almost fine"; its worst path may simply not have run.</li>
   <li><b>Margin policy.</b> Size = measured peak plus a margin, never the peak. The game uses 32 B because its tasks are tiny (<code>beacon</code> and <code>heart</code> call nothing, so their peak is the 768 B task context: 768 + 32 = 800). Real tasks that call <code>ESP_LOGx</code> or <code>printf</code> keep hundreds of bytes spare.</li>
   <li><b>Overflow detection.</b> The choice <code>FreeRTOS > Kernel > configCHECK_FOR_STACK_OVERFLOW</code> offers <code>CONFIG_FREERTOS_CHECK_STACKOVERFLOW_NONE</code>, <code>_PTRVAL</code> (stack pointer check) and <code>_CANARY</code> (the default); the canary check catches a stack whose end bytes were overwritten, on each context switch, and the Xtensa port reports it with <code>***ERROR*** A stack overflow in task NAME has been detected.</code> It cannot catch an overflow that jumps over the canary, so the margin is the real protection.</li>
   <li><b>Measure after the worst case.</b> Call <code>uxTaskGetStackHighWaterMark()</code> at the end of a pass, log it, and exercise the error paths too. Setting every stack to a huge size (4096 B each) passes the rule but costs RAM: the stage rewards the smaller answer with a star.</li>
   <li>Free stack is not free memory. The five tasks in the review need 6.5 KB for stacks in the game; the board has to hold them next to the heap.</li></ul>
   <div data-w="stackmargin"></div>`],

  ['5. Heap and leaks', `<p>A leak is an allocation without a matching free. One lost buffer is invisible. A buffer lost every 150 ms is invisible for the first minute and fatal the first time the heap is empty, long after the code that caused it ran. In the game, <code>diag</code> takes 2048 B per cycle from a heap of 8192 B.</p>
   ${heapDia}
   <ul><li><b>Watch the free heap over time.</b> <code>heap_caps_get_free_size(MALLOC_CAP_8BIT)</code> (or <code>esp_get_free_heap_size()</code>) returns the free bytes now; <code>esp_get_minimum_free_heap_size()</code> returns the lowest value since boot. The second one is the number to log in a long test: it shows the worst moment even if the heap recovered.</li>
   <li><b>A leak is a slope.</b> A healthy loop returns to the same free size every pass. A line that falls by a constant step is a leak, and the step size tells you which allocation it is (2048 B here, the frame buffer).</li>
   <li><b>What happens when it runs out.</b> <code>malloc()</code> returns NULL. Code that uses the pointer without checking crashes the chip. Check every allocation result and skip the snapshot instead.</li>
   <li><b>Pair them in one place.</b> Allocate and free in the same task and the same pass (<code>diag</code>: alloc, log, write, free). A free placed after the write is easy to audit; a free in a different task is how buffers get lost.</li>
   <li><b>A double free corrupts the heap.</b> Freeing twice returns memory that was never yours, and the next allocation can hand the same block to two owners. The game aborts the run at the second free with CORRUPT HEAP.</li>
   <li><b>Fragmentation.</b> Free bytes are not always one block. <code>heap_caps_get_largest_free_block()</code> tells whether a 2048 B request can still be met. Allocate once at start-up for buffers that live for ever.</li>
   <li><b>Finding the leaking line.</b> Enable <code>CONFIG_HEAP_TRACING_STANDALONE</code> (<code>Component config > Heap memory debugging > Heap tracing</code>), call <code>heap_trace_init_standalone()</code> once, then <code>heap_trace_start(HEAP_TRACE_LEAKS)</code> and <code>heap_trace_stop()</code> around the suspect code: the heap records the allocations made in between, and <code>heap_trace_dump()</code> prints those still live. Use it when the slope is clear and the source is not.</li></ul>
   <div data-w="heapcurve"></div>
   <details><summary><b>Real ESP-IDF detail</b></summary><ul><li><code>CONFIG_HEAP_ABORT_WHEN_ALLOCATION_FAILS</code> (default off) makes a failed allocation abort the chip instead of returning NULL. <code>heap_caps_register_failed_alloc_callback()</code> hooks every failure.</li>
   <li>An unchecked NULL write goes to address 0 and the chip panics (<code>StoreProhibited</code> on Xtensa). The game reports it as <code>pvPortMalloc returned NULL</code>.</li></ul></details>`],

  ['6. Diagnostics that do not hurt', `<p>Logging the status and writing a snapshot to flash is housekeeping. It has to run, and it must not disturb the tasks that have deadlines. <code>diag</code> takes 3 ms of CPU for the status line and blocks for about 20 ms on the flash write, every 150 ms.</p>
   ${solDia}
   <ul><li><b>Low priority, spare core.</b> A snapshot can wait; the hazard frame cannot. <code>diag</code> runs at priority 1 and is pinned to core 0, which has room (core 1 is at 95%: a task pinned there starves <code>IDLE1</code> and crashes at 857 ms). At priority 2 or 3 the stage 13 deadlines break (frame 26 ms against 25, read 17 ms against 15).</li>
   <li><b>Budget it.</b> Time per cycle, bytes per snapshot, how often. The stage allows each snapshot up to 100 ms after its 150 ms slot: the reference finishes in 50 ms.</li>
   <li><b>Flash writes block.</b> On a dual-core ESP32 a flash write pauses all other tasks, makes the other core wait, and turns off interrupts that are not IRAM-safe, so urgent work can be late. Write in a task, never in an ISR; the game's <code>logToFlash</code> crashes in an interrupt handler.</li>
   <li><b>Use periodic, not event driven.</b> <code>xTaskDelayUntil</code> keeps a fixed slot grid (stage 3).</li>
   <li><b>What a real build adds.</b> <code>esp_reset_reason()</code> at boot (<code>ESP_RST_TASK_WDT</code>, <code>ESP_RST_PANIC</code>) tells why the last run ended; a core dump to flash (<code>CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH</code>) keeps the state of every task at the trip; <code>vTaskList()</code> (needs <code>CONFIG_FREERTOS_USE_TRACE_FACILITY</code> and <code>CONFIG_FREERTOS_USE_STATS_FORMATTING_FUNCTIONS</code>) lists task states; <code>vTaskGetRunTimeStats()</code> (needs <code>CONFIG_FREERTOS_GENERATE_RUN_TIME_STATS</code>, which selects both) lists CPU shares. The game cannot show a recovery: the first watchdog trip ends the run.</li>
   <li><b>The final review.</b> Rerun the whole checklist after the last change: watchdog subscribers fed, free heap flat, every task at 32 B spare or more, diagnostics at low priority, and the older stages still pass.</li></ul>
   <div data-w="diagprio"></div>`],
];

/* ================= quiz ================= */

export const quiz = [
  { q: 'A rover runs for an hour and then panics. The log shows malloc() returning NULL. Free heap printed every minute went down by 2 KB every time. What is the symptom of?', opts: ['A stack problem, because a panic always comes from a task stack', 'A heap leak: an allocation without its free, repeated on a slope', 'A watchdog fault, because the dog is the only tool that finds slow bugs'], a: 1, why: 'A heap that falls by a constant step and never recovers is a leak, and NULL from malloc is its end. A stack overflow shows in the high-water mark, not in the free heap, and the watchdog reports time, not memory.', wrong: ["A stack overflow is a different resource. It shows in the stack high-water mark or in a stack overflow message, not as a falling free heap. Here malloc() returning NULL points at the heap.", null, "The task watchdog measures time: tasks that did not feed it. It says nothing about memory, and a steadily falling free heap does not trip it."] },
  { q: 'A task waits 420 ms for an instrument between bursts and the watchdog timeout is 300 ms. What should happen with its subscription?', opts: ['Subscribe it anyway; a trip means the instrument is slow and the reset is correct', 'Do not subscribe it, or reset between phases so the longest gap is under the timeout', 'Raise the timeout of the whole system to 1 s so the task fits'], a: 1, why: 'Its design needs more than the timeout, so the dog would bite a healthy task. A longer system timeout would hide real hangs of motor, whose loop is 10 ms.', wrong: ["The watchdog only means something when a trip says the task is broken. A task that waits 420 ms by design would be reset on every cycle while it is healthy.", null, "A longer timeout for the whole system also loosens the check for tasks with short loops such as motor at 10 ms, so a real hang goes unseen for a full second. Fix the one subscription, not the whole timeout."] },
  { q: 'A developer watches a task only through a user entry (esp_task_wdt_add_user) and feeds it with esp_task_wdt_reset_user() from a 100 ms timer, whatever the task is doing, "so the task can never trip". The task then hangs in a driver call. What happens?', opts: ['The watchdog trips 300 ms later, because the task itself never called esp_task_wdt_reset()', 'The user entry is fed by the timer for ever and the hang goes unnoticed', 'The timer stops when the task hangs, so the watchdog trips'], a: 1, why: 'The timer is independent of the task and keeps running. The reset no longer says "the task is alive", so the one failure the watchdog exists for is invisible. (A plain esp_task_wdt_reset() in the timer callback would not even feed the task: it resets the calling task, which is not subscribed.)', wrong: ["A trip needs a missed reset, and the timer keeps feeding the entry whatever the task does. The task's own call to esp_task_wdt_reset() is not what feeds a user entry.", null, "The timer is separate code and keeps running. One task blocked in a driver call does not stop it."] },
  { q: 'After a full test run the stack table shows motor with 20 B unused, and the rule is 32 B. A colleague says it never overflowed, so it is fine. What is the flaw?', opts: ['The peak is only the deepest path that ran; a path not yet taken can use more, so the margin is the protection', 'The high-water mark counts words, so the real spare is four times larger', 'A task cannot overflow while the watchdog is subscribed to it'], a: 0, why: 'The mark shows a lower bound of the real worst case. Size the stack at peak plus a margin and exercise the error paths.', wrong: [null, "ESP-IDF reports the high-water mark in bytes, not words, so 20 B is 20 bytes of spare stack.", "The task watchdog watches time, not stack. Being subscribed to it does nothing to stop a stack overflow."] },
  { q: 'Free heap goes down by 2048 B every 150 ms and never goes up. Which line is missing in diag?', opts: ['A longer delay between snapshots, so the heap has time to recover', 'The free of the buffer (freeFrame): every allocation needs one', 'A larger stack for diag, so the buffer fits'], a: 1, why: 'The loop allocates and never gives the block back. A slower loop only delays the crash, and the buffer comes from the heap, so a bigger task stack does not hold it.', wrong: ["A longer delay only slows the leak. The buffers are still never returned, so the heap never recovers and the crash only comes later.", null, "The 2048 B buffer is taken from the heap, not from the task stack, and it is the heap that is falling. A bigger stack does not give the lost blocks back."] },
  { q: 'Why must the snapshot task have a low priority and sit on the less busy core?', opts: ['So that it cannot delay the tasks with deadlines; it can wait, they cannot', 'Because flash writes only work at priority 1', 'Because a task at a higher priority is not allowed to block'], a: 0, why: 'Housekeeping has no deadline. At priority 2 or 3 it takes time from the hazard frame and read and breaks the stage 13 deadlines; at priority 1 it only runs when they are blocked.', wrong: [null, "Flash writes work at any priority. The priority only decides who runs first and has no effect on whether the write works.", "Any task may block at any priority; blocking is simply how a task gives the core to others. Priority decides who is chosen to run, not who may block."] },
];
