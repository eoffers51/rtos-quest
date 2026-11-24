// Logic analyzer / task timing chart.
// Task rows show the FreeRTOS state in every millisecond; then the idle task, GPIO waveforms, supply current and fault markers.
// A lesson can add evidence to the chart: `chartGrid: { unit, period }` draws where a periodic task should start,
// `evidence: K => [{ unit, from, to, label }]` brackets the stretch an unmet objective is about, and
// `powerMarks: [mA, ...]` draws budget lines on the current row.
import { PALETTE } from './editor.js';
import { S_, WDT } from './kernel.js';

const ROW = 18, TOP = 14;
// trace codes written by the kernel
export const STATE = { 0: 'waiting for its trigger', 1: 'Running', 2: 'Ready (waiting for the CPU)', 3: 'Blocked (waiting for a queue, semaphore or mutex)', 4: 'Running (for less than 1 ms)', 5: 'Blocked (waiting for time)', 6: 'powered down (deep sleep)' };

export function rowsOf(K, L) {
  const r = K.units.map(u => ({ label: u.name, unit: u, h: ROW }));
  for (let i = 0; i < K.cores; i++) r.push({ label: K.cores > 1 ? 'IDLE' + i : 'IDLE task', idle: i, h: ROW });
  L.pins.forEach(p => r.push({ label: p + ' pin', pin: p, h: ROW }));
  if (L.power) r.push({ label: 'current, mA', power: true, h: ROW * 4 });
  for (const k in L.irqs || {}) r.push({ label: 'IRQ ' + k, mark: 'irq:' + k, h: ROW });
  if (L.fsm) r.push({ label: 'events', evs: true, h: ROW + 6 }, { label: 'state', fsm: true, h: ROW + 4 }, { label: 'wheels', sig: 'mot', h: ROW }, { label: 'drill', sig: 'dr', h: ROW });
  r.push({ label: 'faults', mark: '!', h: ROW });
  return r;
}

/** does unit u run on core i (always true on one core; interrupts and timer callbacks count for core 0) */
const onCore = (K, u, i) => K.cores < 2 || u.core === i || (u.core === undefined || u.core < 0 ? i === 0 : false);
/** the milliseconds in which some unit on core i ran for less than 1 ms while the idle task had the rest of it */
const briefOn = (K, i) => { const out = []; for (let t = 0; t < K.end; t++) if (K.coreTr[i][t] < 0 && K.units.some(u => u.tr[t] === 4 && onCore(K, u, i))) out.push(t); return out; };

/** the state machine's state at time t, and the bands [state, from, to] it went through */
export const stateAt = (K, L, t) => { let st = L.fsm.init; for (const e of K.ev) { if (e.t > t) break; if (e.k === 'fsm') st = e.s; } return st; };
const bands = (K, L) => { const out = []; let st = L.fsm.init, a = 0; for (const e of K.ev) if (e.k === 'fsm') { out.push([st, a, e.t]); st = e.s; a = e.t; } out.push([st, a, K.end]); return out; };
const sigAt = (K, key, t) => { let v = 0; for (const e of (K.w.rv || {})[key] || []) { if (e.t > t) break; v = e.on; } return v; };
export const FSM_COL = ['#5d738c', '#5fe3ff', '#ffb347', '#ff5d4d'];
/* the same words as the chart legend */
const SHORT = { 0: 'Waiting for its trigger', 1: 'Running', 2: 'Ready', 3: 'Blocked on an object', 4: 'Running under 1 ms', 5: 'Blocked on a delay', 6: 'Deep sleep' };
/** What every row is doing at time t, for the hover read-out. */
export function describe(K, L, t) {
  t = Math.max(0, Math.min(K.end - 1, Math.floor(t)));
  // tasks are grouped by state, in a fixed order, so the line stays short however many tasks there are
  const parts = [1, 4, 2, 3, 5, 0, 6].map(st => [st, K.units.filter(u => u.tr[t] === st).map(u => u.name)]).filter(g => g[1].length).map(([st, names]) => `${SHORT[st]}: ${names.join(', ')}`);
  for (let i = 0; i < K.cores; i++) { const br = K.units.filter(u => u.tr[t] === 4 && onCore(K, u, i)).map(u => u.name), by = K.coreTr[i][t] >= 0 && K.units[K.coreTr[i][t]];
    parts.push(`${K.cores > 1 ? 'IDLE' + i : 'IDLE task'}: ${K.coreTr[i][t] < 0 ? (br.length ? `Running for the rest of this millisecond, after ${br.join(' and ')}` : 'Running (no task is Ready)') : `not running (${by ? by.name + ' has the CPU' : 'the CPU is taken'})`}`); }
  if (L.fsm) { const now = (K.w.evs || []).filter(e => e.t === t).map(e => e.ev); parts.push(`state: ${stateAt(K, L, t)}`); if (now.length) parts.push(`event arrives: ${now.join(', ')}`); parts.push(`wheels: ${sigAt(K, 'mot', t) ? 'turning' : 'stopped'}`, `drill: ${sigAt(K, 'dr', t) ? 'in the ground' : 'up'}`); }
  L.pins.forEach(p => { let v = false; for (const e of K.ev) { if (e.t > t) break; if (e.k === 'pin' && e.pin === p) v = e.v; } parts.push(`${p}: ${v ? '1' : '0'}`); });
  if (L.power) parts.push(`current: ${K.cur[t] < 1 ? K.cur[t].toFixed(2) : Math.round(K.cur[t])} mA`);
  return `t = ${t} ms  ·  ` + parts.join('  ·  ');
}

/** Evidence for this run: the lesson's own brackets, or, after a task-watchdog reset, the task the watchdog named. */
/** The first status light that missed its beat (BEACON every 500 ms, HEART every 200 ms, 3 ms tolerance), with the task that drives it; or null. */
export function lateLight(K) {
  for (const [pin, period] of [['BEACON', 500], ['HEART', 200]]) {
    const u = K.units.find(x => x.kind === 'task' && x.code.some(i => i.op === 'gpio' && i.pin === pin)), t = K.ev.filter(e => e.k === 'pin' && e.pin === pin).map(e => e.t);
    if (!u) continue;
    for (let i = 1; i < t.length; i++) if (Math.abs(t[i] - t[i - 1] - period) > 3) return { pin, period, gap: t[i] - t[i - 1], from: t[i - 1], to: t[i], unit: u.name, prio: u.base };
  }
  return null;
}

/** Fallback evidence for the regression checks every stage carries from stage 2: the first stretch where the motor or the telemetry task was kept waiting. */
export function starved(K) {
  for (const [fn, limit, what] of [['motorStep', 11, 'motor steps'], ['sendTelemetry', 105, 'telemetry packets']]) {
    const u = K.units.find(x => x.kind === 'task' && x.code.some(i => i.fn === fn)), t = S_(K, fn);
    if (!u) continue;
    for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] > limit) return [{ unit: u.name, from: t[i - 1], to: t[i], label: `${t[i] - t[i - 1]} ms between ${what} (limit ${limit}): other tasks held the CPU` }];
  }
  const ll = lateLight(K);
  return ll ? [{ unit: ll.unit, from: ll.from, to: ll.to, label: `${ll.pin} toggled after ${ll.gap} ms, not ${ll.period}: ${ll.unit} (priority ${ll.prio}) waited behind other tasks` }] : [];
}

export function evidenceOf(K, L) {
  if (!K.crash) {
    const own = L.evidence ? (L.evidence(K) || []) : [];
    return own.length ? own : starved(K);
  }
  // A crash: say where on the chart it happened. Most specific source first.
  const msg = K.crash.msg, lesson = () => { try { return L.evidence ? (L.evidence(K) || []) : []; } catch (e) { return []; } };
  const so = /stack overflow in task (\w+)/.exec(msg), su = so && K.units.find(x => x.name === so[1]);
  if (su) return [{ unit: su.name, from: Math.max(0, K.crash.t - 20), to: K.crash.t, label: `${su.name} overflowed its ${su.stack} B stack here` }];
  const m = /\n - (\w+) \(CPU/.exec(msg), u = m && K.units.find(x => x.name === m[1]);
  if (u) return [{ unit: u.name, from: Math.max(0, K.end - (L.wdtTimeout || 1000)), to: K.end, label: `${u.name} did not feed the watchdog` }];
  if (L.evidence && /K\.crash/.test(String(L.evidence))) { const own = lesson(); if (own.length) return own; }   // the lesson handles crashes itself
  if (/task_wdt/.test(msg)) { // the idle task starved
    const from = Math.max(0, K.end - WDT), n = K.end - from, win = x => Array.prototype.slice.call(x.tr, from, K.end), ran = x => win(x).filter(v => v === 1 || v === 4).length;
    const never = K.units.filter(x => x.kind === 'task' && x.tr && !win(x).some(v => v === 3 || v === 5 || v === 6)).sort((p, q) => ran(q) - ran(p));
    // a task whose only waits use a timeout of 0 loops without ever sleeping: that is the cause, however little CPU it got
    const waits = ['take', 'recv', 'send', 'notifyTake', 'evWait'], API = { take: 'xSemaphoreTake', recv: 'xQueueReceive', send: 'xQueueSend', notifyTake: 'ulTaskNotifyTake', evWait: 'xEventGroupWaitBits' };
    const poll = never.find(x => x.code.some(i => waits.includes(i.op) && i.to === 0) && !x.code.some(i => i.op === 'delay' || i.op === 'until' || (waits.includes(i.op) && i.to !== 0)));
    if (poll) { const op = poll.code.find(i => waits.includes(i.op) && i.to === 0).op; return [{ unit: poll.name, from, to: K.end - 1, label: `${poll.name} never sleeps: ${API[op]}() with timeout 0 returns at once, so the loop spins and the idle task cannot run` }]; }
    // a long busy-wait is the cause even if the task slept earlier in the window: it must not be blocked at the moment of the reset
    const spin = K.units.find(x => x.kind === 'task' && x.tr && x.code.some(i => i.op === 'busy' && i.ms >= 200) && ![3, 5, 6].includes(x.tr[K.end - 1]) && ran(x) > 0);
    if (spin) { const ms = spin.code.find(i => i.op === 'busy' && i.ms >= 200).ms; return [{ unit: spin.name, from, to: K.end - 1, label: `${spin.name} busy-waits ${ms} ms in esp_rom_delay_us(): it never sleeps, so lower tasks and the idle task cannot run` }]; }
    if (never.length && ran(never[0]) > n / 2) return [{ unit: never[0].name, from, to: K.end - 1, label: `${never[0].name} never blocked in these ${n} ms, so the idle task could not run` }];
    if (K.cores > 1) {
    // every task blocks now and then, yet together they fill the core: show the one that used it most
      const co = /IDLE(\d)/.exec(msg), core = co ? +co[1] : -1;
      let other = '';
      if (K.cores > 1 && core >= 0 && K.coreTr) { const oc = core ? 0 : 1; let idle = 0; for (let t = from; t < K.end; t++) if (K.coreTr[oc][t] < 0) idle++; other = `, while core ${oc} was idle ${Math.round(idle / n * 100)}% of the time`; }
      const top = K.units.filter(x => x.kind === 'task' && x.tr && (K.cores < 2 || core < 0 || x.core === core || x.core < 0)).sort((p, q) => ran(q) - ran(p))[0];
      if (top) return [{ unit: top.name, from, to: K.end - 1, label: `${K.cores > 1 && core >= 0 ? 'core ' + core : 'the CPU'} had no idle time in these ${n} ms${other}: ${top.name} used the most (${ran(top)} ms)` }];
    }
    const low = never[never.length - 1];   // nobody hogs alone: show a task that was Ready all the time and hardly ran
    if (low) return [{ unit: low.name, from, to: K.end - 1, label: `${low.name} was Ready for these ${n} ms and got only ${ran(low)} ms of CPU: the tasks above it leave no spare time, so the idle task never ran` }];
    // every task blocks now and then, yet together they fill the core: show the one that used it most
    const co = /IDLE(\d)/.exec(msg), core = co ? +co[1] : -1;
    const top = K.units.filter(x => x.kind === 'task' && x.tr && (K.cores < 2 || core < 0 || x.core === core || x.core < 0)).sort((p, q) => ran(q) - ran(p))[0];
    if (top) return [{ unit: top.name, from, to: K.end - 1, label: `${K.cores > 1 && core >= 0 ? 'core ' + core : 'the CPU'} had no idle time in these ${n} ms: ${top.name} used the most (${ran(top)} ms)` }];
  }
  const own = lesson(); if (own.length) return own;
  if (/pvPortMalloc returned NULL/.test(msg)) { // out of heap: the task that got the NULL is the victim; show the one that allocates and never frees
    const leak = K.units.find(x => x.code.some(i => i.fn === 'allocFrame') && !x.code.some(i => i.fn === 'freeFrame'));
    if (leak) return [{ unit: leak.name, from: 0, to: Math.min(K.crash.t, K.end - 1), label: `${leak.name} takes a frame from the heap on every pass and never frees it: the heap was empty at ${K.crash.t} ms${K.crash.unit && K.crash.unit !== leak.name ? ` (${K.crash.unit} got the NULL)` : ''}` }];
  }
  const t = Math.min(K.crash.t, K.end - 1), at = K.crash.unit && K.units.find(x => x.name === K.crash.unit);   // the unit whose instruction crashed
  return at ? [{ unit: at.name, from: Math.max(0, t - 10), to: t, label: `${at.name} caused the reboot: ${msg.split(/[.\n]/)[0].slice(0, 80)}` }] : [];
}

export function drawTimeline(cv, labels, K, L, zoom = 1) {
  const ev = evidenceOf(K, L), pinned = new Set(ev.map(e => e.unit));
  if (L.isNew) for (const u of K.units) if (L.isNew(u.name)) pinned.add(u.name);   // the tasks this stage adds are what the learner is watching
  // rows that carry evidence go to the top, so they are visible without scrolling when there are twenty tasks
  const rows = rowsOf(K, L).map((r, i) => [r, i]).sort((a, b) => (pinned.has(b[0].unit && b[0].unit.name) - pinned.has(a[0].unit && a[0].unit.name)) || a[1] - b[1]).map(x => x[0]), view = cv.parentNode.parentNode, W = (Math.max(200, Math.floor(view.clientWidth)) - (zoom === 1 ? 1 : 0)) * zoom;
  let H = TOP; rows.forEach(r => { r.y = H; H += r.h; });
  const dpr = Math.min(window.devicePixelRatio || 1, 2, 8000 / W);
  labels.innerHTML = rows.map(r => `<div style="height:${r.h}px" class="${r.unit && pinned.has(r.unit.name) ? 'pin' : ''}">${r.label}${K.cores > 1 && r.unit && r.unit.core >= 0 ? ' ·c' + r.unit.core : ''}</div>`).join('');
  cv.parentNode.style.width = W + 'px';
  cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
  const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const X = t => t / K.T * W, pxPerMs = W / K.T;
  const grid = [10, 20, 50, 100, 250, 500, 1000, 2500, 5000, 10000].find(g => pxPerMs * g > 45) || 10000;
  x.font = '10px "JetBrains Mono", monospace'; x.lineWidth = 1;
  for (let t = 0; t <= K.T; t += grid) {
    x.strokeStyle = 'rgba(95,227,255,.16)'; x.beginPath(); x.moveTo(X(t) + 0.5, TOP - 2); x.lineTo(X(t) + 0.5, H); x.stroke();
    x.fillStyle = 'rgba(210,230,255,.75)'; x.fillText(t + (t ? '' : ' ms'), X(t) + 3, 10);
  }
  const runs = (arr, end, cb) => { let a = 0; for (let t = 1; t <= end; t++) if (t === end || arr[t] !== arr[a]) { cb(arr[a], a, t); a = t; } };
  for (const row of rows) {
    const y = row.y, h = row.h;
    x.strokeStyle = 'rgba(95,227,255,.1)'; x.beginPath(); x.moveTo(0, y + h - 0.5); x.lineTo(W, y + h - 0.5); x.stroke();
    if (row.unit) {
      const u = row.unit, col = u.kind === 'isr' ? '#9fb0b9' : PALETTE[u.i % 5];
      // where a periodic task is supposed to start, if the lesson says so and the ticks are far enough apart to read
      if (L.chartGrid && L.chartGrid.unit === u.name && pxPerMs * L.chartGrid.period >= 4) {
        x.fillStyle = 'rgba(255,179,71,.55)'; for (let t = 0; t < K.T; t += L.chartGrid.period) x.fillRect(X(t), y + 1, 1, 3);
      }
      runs(u.tr, K.end, (v, a, b) => {
        const x0 = X(a), w = X(b) - x0;
        if (v === 1) { x.globalAlpha = 1; x.fillStyle = col; x.fillRect(x0, y + 4, Math.max(w, 1), h - 8); }
        else if (v === 4) { x.globalAlpha = 1; x.fillStyle = col; x.fillRect(x0, y + 4, Math.max(w, 2), h - 7); }                  // ran for < 1 ms: a tick mark
        else if (v === 2) { x.globalAlpha = 0.45; x.fillStyle = col; x.fillRect(x0, y + h - 8, Math.max(w, 0.5), 4); }           // Ready
        else if (v === 3) { x.globalAlpha = 1; x.strokeStyle = '#ff5d4d'; x.strokeRect(x0 + 0.5, y + 5.5, Math.max(w - 1, 1), h - 11); } // Blocked on object
        else if (v === 5) { x.globalAlpha = 0.5; x.strokeStyle = col; x.setLineDash([2, 4]); x.beginPath(); x.moveTo(x0, y + h / 2); x.lineTo(x0 + w, y + h / 2); x.stroke(); x.setLineDash([]); } // Blocked on time
        else if (v === 6) { x.globalAlpha = 0.5; x.fillStyle = '#2b3a4d'; x.fillRect(x0, y + h / 2 - 1, w, 2); }                  // powered down
      });
      x.globalAlpha = 1;
    } else if (row.idle !== undefined) {
      const idle = Array.from(K.coreTr[row.idle], v => v < 0 ? 1 : 0);
      x.fillStyle = '#5d738c'; runs(idle, K.end, (v, a, b) => { if (v) x.fillRect(X(a), y + 5, Math.max(X(b) - X(a), 0.5), h - 11); });
      // A task that ran for less than 1 ms took the CPU from the idle task for that moment. Cut the idle bar there,
      // as wide as the task's tick mark, so the two rows never look as if they ran at the same time.
      for (const t of briefOn(K, row.idle)) x.clearRect(X(t), y + 4, Math.max(pxPerMs, 2), h - 9);
      if (!idle.slice(0, K.end).some(Boolean) && K.end > 50) { x.fillStyle = '#ff8a7a'; x.fillText('never ran: nothing fed the watchdog', 6, y + 12); }
    } else if (row.power) { // supply current as a step plot on a log scale, 0.01 mA at the bottom to 300 mA at the top
      const Y = v => y + h - 4 - (Math.log10(Math.max(0.01, v)) + 2) / 4.48 * (h - 10);
      x.fillStyle = 'rgba(255,138,122,.28)'; x.strokeStyle = '#ff8a7a'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(0, y + h);
      runs(Array.from(K.cur.subarray(0, K.end), v => Math.round(v * 100)), K.end, (v, a, b) => { x.lineTo(X(a), Y(v / 100)); x.lineTo(X(b), Y(v / 100)); });
      x.lineTo(X(K.end), y + h); x.fill(); x.stroke(); x.lineWidth = 1;
      for (const v of [0.01, 1, 100]) { x.fillStyle = 'rgba(210,230,255,.6)'; x.fillText(v + ' mA', 4, Y(v) - 2); x.strokeStyle = 'rgba(210,230,255,.14)'; x.beginPath(); x.moveTo(0, Y(v) + 0.5); x.lineTo(W, Y(v) + 0.5); x.stroke(); }
      for (const m of L.powerMarks || []) { x.strokeStyle = '#ffb347'; x.setLineDash([5, 4]); x.beginPath(); x.moveTo(0, Y(m) + 0.5); x.lineTo(W, Y(m) + 0.5); x.stroke(); x.setLineDash([]); x.fillStyle = '#ffb347'; x.fillText(`budget ${m} mA`, W - 96, Y(m) - 3); }
      const avg = K.m.avgmA; x.strokeStyle = '#ffffff'; x.setLineDash([2, 3]); x.beginPath(); x.moveTo(0, Y(avg) + 0.5); x.lineTo(W, Y(avg) + 0.5); x.stroke(); x.setLineDash([]);
      x.fillStyle = '#ffffff'; x.font = 'bold 11px "JetBrains Mono", monospace'; x.fillText(`average ${avg} mA`, W / 2 - 50, Y(avg) - 4); x.font = '10px "JetBrains Mono", monospace';
    } else if (row.fsm) { // the state as coloured bands, named where there is room
      for (const [st, a, b] of bands(K, L)) { const x0 = X(a), w = X(b) - x0, col = FSM_COL[Math.max(0, L.fsm.states.indexOf(st)) % 4];
        x.globalAlpha = 0.3; x.fillStyle = col; x.fillRect(x0, y + 3, Math.max(w, 1), h - 7); x.globalAlpha = 1; x.fillStyle = col; x.fillRect(x0, y + 3, Math.max(w, 1), 2); x.fillRect(x0, y + 3, 1.5, h - 7);
        if (w > st.length * 6.4 + 8) { x.fillStyle = '#e8f2ff'; x.fillText(st, x0 + 5, y + h - 8); } }
    } else if (row.evs) { // one tick per event, named where the next one is far enough away
      const E = K.w.evs || [];
      E.forEach((e, i) => { const px = X(e.t), hz = e.ev === 'HAZARD', short = e.ev.replace('CMD_', ''), room = (i + 1 < E.length ? X(E[i + 1].t) : W) - px;
        x.fillStyle = hz ? '#ff5d4d' : e.ev === 'DRILL_DONE' ? '#6dffa8' : '#ffb347'; x.fillRect(px, y + 3, 2, h - 6);
        if (room > short.length * 6.2 + 8) x.fillText(short, px + 5, y + h - 8); });
    } else if (row.sig) { // wheels and drill as a level: high while on
      const log = (K.w.rv || {})[row.sig] || []; x.strokeStyle = row.sig === 'mot' ? '#5fe3ff' : '#ffb347'; x.lineWidth = 1.5; x.beginPath(); let lvl = 0; x.moveTo(0, y + h - 5);
      for (const e of log) { x.lineTo(X(e.t), lvl ? y + 4 : y + h - 5); lvl = e.on; x.lineTo(X(e.t), lvl ? y + 4 : y + h - 5); }
      x.lineTo(X(K.end), lvl ? y + 4 : y + h - 5); x.stroke(); x.lineWidth = 1;
    } else if (row.pin) {
      x.strokeStyle = '#ffd27a'; x.lineWidth = 1.5; x.beginPath(); let lvl = false; x.moveTo(0, y + h - 5);
      for (const e of K.ev) if (e.k === 'pin' && e.pin === row.pin) { x.lineTo(X(e.t), lvl ? y + 4 : y + h - 5); lvl = e.v; x.lineTo(X(e.t), lvl ? y + 4 : y + h - 5); }
      x.lineTo(X(K.end), lvl ? y + 4 : y + h - 5); x.stroke(); x.lineWidth = 1;
    } else {
      for (const e of K.ev) if (e.k === 'mark' && e.row === row.mark) {
        x.fillStyle = e.c === 'bad' ? '#ff5d4d' : '#ffb347'; const px = X(e.t);
        x.beginPath(); x.moveTo(px, y + 3); x.lineTo(px + 5, y + h - 4); x.lineTo(px - 5, y + h - 4); x.fill();
      }
    }
  }
  // evidence for an unmet objective: a labelled red bracket over the stretch it is about
  for (const e of ev) {
    const row = rows.find(r => r.unit && r.unit.name === e.unit); if (!row) continue;
    const x0 = X(e.from), w = Math.max(X(e.to) - x0, 3);
    x.strokeStyle = '#ffb347'; x.lineWidth = 2.5; x.setLineDash([6, 3]); x.strokeRect(x0 - 1, row.y + 1, w + 2, row.h - 3); x.setLineDash([]); x.lineWidth = 1; // amber dashes: not the red outline that means Blocked
    x.font = 'bold 10px "JetBrains Mono", monospace'; const tw = x.measureText(e.label).width, tx = Math.min(Math.max(2, x0 + w + 5), W - tw - 4);
    x.fillStyle = '#ffb347'; x.fillRect(tx - 3, row.y + 2, tw + 6, 13); x.fillStyle = '#1f1203'; x.fillText(e.label, tx, row.y + 12); x.font = '10px "JetBrains Mono", monospace';
  }
  // the run stopped early: show where, and that nothing after it happened
  if (K.crash && K.end < K.T) {
    const x0 = X(K.end); x.fillStyle = 'rgba(255,93,77,.10)'; x.fillRect(x0, TOP, W - x0, H - TOP);
    x.strokeStyle = '#ff5d4d'; x.lineWidth = 2; x.beginPath(); x.moveTo(x0, TOP - 2); x.lineTo(x0, H); x.stroke(); x.lineWidth = 1;
    x.fillStyle = '#ff8a7a'; x.font = 'bold 11px "JetBrains Mono", monospace';
    const txt = /task_wdt/.test(K.crash.msg) ? `watchdog reset, ${K.end} ms` : `crash, ${K.end} ms`; x.fillText(txt, Math.max(4, x0 - x.measureText(txt).width - 8), H - 6);   // left of the line, so it is never cut off at the right edge
  }
}

/* ---------- readability ----------
   A chart is readable when separate task runs can be told apart. The measure is the number of state changes per 100 px
   in the busiest task row. The same functions drive the game's AUTO zoom and the verifier's readability check. */
export const READABLE = 16;            // most state changes per 100 px that still read as separate events
export const ZOOMS = [1, 2, 4, 8, 16];
export const REF_WIDTH = 800;          // chart width the verifier assumes (the game measures the real one)

export function chartDensity(K, width = REF_WIDTH) {
  let worst = { row: '', per100: 0 };
  for (const u of K.units) {
    let n = 0; for (let t = 1; t < K.end; t++) if (u.tr[t] !== u.tr[t - 1]) n++;
    const d = Math.round(n / width * 1000) / 10; if (d > worst.per100) worst = { row: u.name, per100: d };
  }
  return worst;
}
/** Smallest zoom at which the busiest row is readable: either few enough state changes per 100 px, or every single
 *  millisecond is at least 4 px wide (nothing can be finer than one tick). Returns 0 if no zoom level is enough. */
export function autoZoom(K, width = REF_WIDTH) {
  const d = chartDensity(K, width).per100;
  return ZOOMS.find(z => d / z <= READABLE || width * z / K.T >= 4) || 0;
}
