// Field manual for stage 10 (ESP-IDF): event groups. Wait for all of several conditions, or for any one of them.
import { svg, box, arrow, note } from '../widgets.js';

const bar = (x, y, w, cls, h = 20) => `<rect class="bx ${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>`;
const axis = (x0, x1, y) => `<line class="ar" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" marker-end="url(#ah)"/>`;
const up = (x, y0, y1) => `<line class="ar" x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" marker-end="url(#ah)"/>`;
const bad = s => s.replace('class="at"', 'class="at" style="fill:#ff5d4d;font-weight:700"');

/* ================= diagrams ================= */

// 1. The start firmware: one semaphore, three givers, the uplink wakes on every give
const semDia = svg(720, 230, (() => {
  const X = t => 120 + (t - 440) * 2.3; let s = note(112, 40, 'give(ready_sem)', 'end') + note(112, 118, 'uplink', 'end') + note(112, 170, 'ready so far', 'end');
  [[456, 'radio'], [496, 'radio'], [536, 'clock'], [667, 'fix']].forEach(([t, w]) => { s += up(X(t), 48, 22) + note(X(t), 62, w, 'middle'); });
  [[456, 'r'], [496, 'r'], [536, 'r'], [667, 'g']].forEach(([t, c]) => { s += bar(X(t), 104, 26 * 2.3, c, 24); });
  s += note(X(456), 186, 'radio', 'start') + note(X(496), 200, 'radio', 'start') + note(X(536), 186, 'radio + clock', 'start') + note(X(667), 186, 'all three', 'start');
  s += axis(120, 712, 218) + [440, 500, 560, 620, 680].map(t => note(X(t), 228, t, 'middle')).join('');
  return s;
})(), 'Four of the seven gives of the start firmware: each one wakes the uplink, and the row below shows which facts are ready at that moment');

// 2. An event group is a word of bits, one per fact
const bitsDia = svg(720, 210, (
  box(10, 10, 150, 38, 'radio_link', 'c') + box(10, 80, 150, 38, 'time_sync', 'c') + box(10, 150, 150, 38, 'gps_fix', 'c')
  + box(260, 14, 108, 38, 'bit 0|LINK_UP', 'g') + box(380, 14, 108, 38, 'bit 1|TIME_OK', 'g') + box(500, 14, 108, 38, 'bit 2|FIX_OK', 'g') + box(620, 14, 90, 38, 'bits 3 to 23|free', 'd')
  + box(260, 84, 450, 40, 'sys_ev: one EventBits_t, 24 usable bits|(bits 24 to 31 belong to the kernel)', 'a')
  + arrow(160, 29, 258, 33, 'SetBits', 0, -6) + arrow(160, 99, 380, 54, '', 0, 0) + arrow(160, 169, 520, 54, '', 0, 0)
  + box(380, 140, 330, 56, 'uplink: xEventGroupWaitBits(|sys_ev, all three bits ...)|sleeps until bit 0 and bit 1 and bit 2 are set', 'c')
  + arrow(540, 140, 540, 126, '', 0, 0) + note(10, 206, 'a bit is a fact that is true or not. Setting it twice is still "true".', 'start')
), 'Three tasks each own one bit of the same event group, one task waits for the bits');

// 3. Which group values satisfy a mask? mask = LINK_UP | FIX_OK
const truthDia = svg(720, 190, (() => {
  let s = note(10, 24, 'mask = LINK_UP | FIX_OK (bits 0 and 2). Group value as FIX_OK TIME_OK LINK_UP:', 'start');
  for (let v = 0; v < 8; v++) {
    const l = v & 1, f = (v >> 2) & 1, allOk = l && f, anyOk = l || f, x = 10 + v * 88;
    s += box(x, 40, 80, 28, v.toString(2).padStart(3, '0'), 'a') + box(x, 84, 80, 34, 'wait ALL|' + (allOk ? 'returns' : 'blocks'), allOk ? 'g' : 'd') + box(x, 130, 80, 34, 'wait ANY|' + (anyOk ? 'returns' : 'blocks'), anyOk ? 'g' : 'd');
  }
  s += note(10, 184, 'TIME_OK (the middle bit) never matters: it is not in the mask. ALL needs every mask bit, ANY needs one.', 'start');
  return s;
})(), 'All-bits wait and any-bit wait for the mask LINK_UP or FIX_OK over every group value');

// 4. Two windows, clear on exit
const winDia = svg(720, 250, (() => {
  const X = t => 70 + (t - 420) * 1.5; let s = note(62, 34, 'LINK_UP', 'end') + note(62, 74, 'TIME_OK', 'end') + note(62, 114, 'FIX_OK', 'end') + note(62, 160, 'uplink', 'end');
  s += bar(X(456), 24, X(667) - X(456), 'g', 14) + up(X(496), 44, 26) + bar(X(799), 24, X(849) - X(799), 'g', 14);
  s += bar(X(536), 64, X(667) - X(536), 'g', 14) + bar(X(849), 64, 6, 'g', 14);
  s += bar(X(667), 104, 6, 'g', 14) + bar(X(793), 104, X(849) - X(793), 'g', 14);
  s += `<line class="dash" x1="${X(667)}" y1="14" x2="${X(667)}" y2="176"/><line class="dash" x1="${X(849)}" y1="14" x2="${X(849)}" y2="176"/>`;
  s += bar(X(667), 148, 26 * 1.5, 'g', 22) + bar(X(849), 148, 26 * 1.5, 'g', 22);
  s += note(X(667) - 4, 196, 'wait returns, all three bits cleared', 'end') + note(716, 196, 'again: all three set, all three cleared', 'end');
  s += note(X(560), 214, 'window 1: the last bit is FIX_OK', 'middle') + note(716, 214, 'window 2: the last bit is TIME_OK', 'end');
  s += axis(70, 712, 232) + [440, 520, 600, 680, 760, 840].map(t => note(X(t), 246, t, 'middle')).join('');
  return s;
})(), 'Bits are set by the bring-up tasks and cleared together when the uplink wait returns, once per window');

// 5. Which tool?
const treeDia = svg(720, 210, (
  box(240, 6, 240, 34, 'what does the waiter need?', 'a')
  + arrow(300, 40, 90, 84) + arrow(340, 40, 260, 84) + arrow(380, 40, 450, 84) + arrow(420, 40, 630, 84)
  + box(10, 84, 160, 52, 'one event, one waiter|(ISR wakes a task)', 'c') + box(180, 84, 160, 52, 'how many events|happened (a count)', 'c') + box(360, 84, 180, 52, 'the data itself|(a frame, a packet)', 'c') + box(550, 84, 160, 52, 'these N conditions,|or several waiters', 'c')
  + arrow(90, 136, 90, 160) + arrow(260, 136, 260, 160) + arrow(450, 136, 450, 160) + arrow(630, 136, 630, 160)
  + box(10, 160, 160, 38, 'task notification', 'g') + box(180, 160, 160, 38, 'counting semaphore', 'g') + box(360, 160, 180, 38, 'queue', 'g') + box(550, 160, 160, 38, 'event group', 'g')
), 'Choose a notification, a counting semaphore, a queue or an event group by what the waiter must learn');

// 6. Set after the work, not before
const orderDia = svg(720, 210, (() => {
  const X = t => 120 + t * 0.9; let s = note(112, 38, 'wrong', 'end') + note(112, 118, 'right', 'end');
  s += up(X(0), 62, 24) + bad(note(X(6), 22, 'SetBits(FIX_OK) before the work: the bit says "fix ready" while there is none', 'start')) + bar(X(4), 44, X(640) - X(4), 'blk', 18) + note(X(300), 76, 'acquire_fix() blocks 60 to 640 ms', 'middle');
  s += bar(X(0), 124, X(640), 'blk', 18) + note(X(320), 156, 'acquire_fix() blocks 60 to 640 ms', 'middle') + bar(X(640), 124, 3, 'c', 18) + up(X(644), 150, 112) + note(716, 104, 'SetBits(FIX_OK): true now', 'end');
  s += axis(120, 700, 176) + [0, 200, 400, 600].map(t => note(X(t), 192, t + ' ms', 'middle')).join('');
  return s;
})(), 'A bit set before the work is done tells the waiter something false');

/* ================= widgets ================= */

const frame = (title, body) => `<div class="wg"><div class="wgh">INTERACTIVE · ${title}</div>${body}</div>`;
const sl = (id, label, min, max, v, step = 1) => `<label>${label} <input type="range" data-${id} min="${min}" max="${max}" step="${step}" value="${v}"> <b data-${id}v></b></label>`;
const val = (el, id, unit = ' ms') => { const v = +el.querySelector('[data-' + id + ']').value; el.querySelector('[data-' + id + 'v]').textContent = v + unit; return v; };
const BITS = ['LINK_UP', 'TIME_OK', 'FIX_OK'];
const NICE = ['radio link', 'time sync', 'position fix'];
const bin3 = n => '0b' + n.toString(2).padStart(3, '0');
const RED = 'style="color:#ff5d4d"', GRN = 'style="color:#6fe38a"';

// Widget 1: step through the start firmware's seven gives (idealised timing: each send takes 26 ms)
function semstep(el) {
  const G = [[456, 'radio_link'], [496, 'radio_link'], [536, 'time_sync'], [667, 'gps_fix'], [793, 'gps_fix'], [799, 'radio_link'], [849, 'time_sync']];
  const R = [[456, 0], [536, 1], [667, 2], [793, 2], [799, 0], [849, 1]];   // when each fact becomes true
  const rows = []; { let free = 0, ri = 0; const rdy = [false, false, false];
    G.forEach(([t, who]) => { const st = Math.max(t, free), end = st + 26; free = end;
      while (ri < R.length && R[ri][0] <= end) rdy[R[ri++][1]] = true;
      const miss = [0, 1, 2].filter(k => !rdy[k]); rows.push({ t, who, end, rdy: [...rdy], miss });
      if (!miss.length) rdy.fill(false);   // only an accepted packet clears the facts
    }); }
  let n = 0;
  el.innerHTML = frame('ONE SEMAPHORE FOR THREE CONDITIONS (THE STAGE START)', `<div class="wgbtns"><button class="hb" data-next>NEXT GIVE</button><button class="hb" data-all>PLAY ALL</button><button class="hb" data-rst>RESET</button></div><div data-out></div>`);
  const draw = () => {
    const rej = rows.slice(0, n).filter(r => r.miss.length).length, ok = rows.slice(0, n).length - rej;
    const tr = rows.slice(0, n).map(r => `<tr><td>${r.t}</td><td>${r.who}</td><td>${r.rdy.map((v, k) => `<span ${v ? GRN : ''}>${v ? '✓' : '·'}</span> ${NICE[k]}`).join(' &nbsp; ')}</td><td ${r.miss.length ? RED : GRN}>${r.miss.length ? 'rejected at about ' + r.end + ': missing ' + r.miss.map(k => NICE[k]).join(', ') : 'accepted at about ' + r.end}</td></tr>`).join('');
    el.querySelector('[data-out]').innerHTML = `<table style="width:100%;font-size:.8rem;border-collapse:collapse"><tr style="text-align:left;color:#9fb0b9"><th>give at (ms)</th><th>given by</th><th>true when uplink checks</th><th>result of send_uplink()</th></tr>${tr}</table>`
      + `<p class="wgcap">${n === 0 ? 'Press NEXT GIVE. Each give wakes the uplink task exactly once, whatever the giver finished.' : `${n} of 7 gives so far: <b>${ok}</b> accepted, <b ${rej ? RED : ''}>${rej}</b> rejected.`}${n === 7 ? ' The semaphore reports that something finished. It cannot say that everything finished, so the uplink sends on every give. A tick of the game adds a few ms of contention to these idealised times.' : ''}</p>`;
    el.querySelector('[data-next]').disabled = n >= 7;
  };
  el.addEventListener('click', e => { if (e.target.closest('[data-next]')) n = Math.min(7, n + 1); else if (e.target.closest('[data-all]')) n = 7; else if (e.target.closest('[data-rst]')) n = 0; else return; draw(); });
  draw();
}

// Widget 2: one event group, one binary semaphore and one counting semaphore receive the same sets
function bitboard(el) {
  let bits = 0, bin = 0, cnt = 0, calls = 0, last = 'Press a task to make it signal.';
  el.innerHTML = frame('BITS ARE STATE, GIVES ARE A COUNT', `<div class="wgbtns">${BITS.map((b, i) => `<button class="hb" data-set="${i}">${['radio_link', 'time_sync', 'gps_fix'][i]} sets ${b}</button>`).join('')}<button class="hb" data-clr>xEventGroupClearBits(all)</button></div><div data-out></div>`);
  const draw = () => {
    const cell = (i, on) => box(20 + i * 128, 14, 118, 40, BITS[i] + '|' + (on ? '1' : '0'), on ? 'g' : 'd');
    el.querySelector('[data-out]').innerHTML = svg(720, 70, [0, 1, 2].map(i => cell(i, bits >> i & 1)).join('') + box(410, 14, 290, 40, 'sys_ev = ' + bin3(bits) + '   (' + bits + ')', 'a'), 'The three bits of the event group')
      + `<p class="wgcap">Signals so far: <b>${calls}</b>. Event group value: <b>${bin3(bits)}</b>. Binary semaphore holds: <b>${bin}</b>. Counting semaphore holds: <b>${cnt}</b>.<br>${last}</p>`;
  };
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.set !== undefined) {
      const i = +b.dataset.set, had = bits >> i & 1; calls++; bits |= 1 << i; cnt++;
      const full = bin === 1; bin = 1;
      last = had ? `${BITS[i]} was already set: nothing changed. The binary semaphore ${full ? 'was already full, so xSemaphoreGive() returned pdFALSE and the second signal is lost' : 'holds 1'}, the counting semaphore counted another event.` : `${BITS[i]} is now set. The group remembers which fact it is; the semaphores only know that a give happened.`;
    } else { bits = 0; last = 'All bits cleared. A bit can be cleared on purpose; a semaphore only loses a token when somebody takes it.'; }
    draw();
  });
  draw();
}

// Widget 3: the wait call, parameter by parameter
function waitlab(el) {
  const chk = (id, i) => `<label><input type="checkbox" data-${id}${i}> ${BITS[i]}</label>`;
  el.innerHTML = frame('WHAT DOES THIS xEventGroupWaitBits() CALL DO?', `<div class="wgrow"><b>bits set in the group now:</b> ${[0, 1, 2].map(i => chk('g', i)).join('')}</div><div class="wgrow"><b>bits to wait for (uxBitsToWaitFor):</b> ${[0, 1, 2].map(i => chk('m', i)).join('')}</div>
    <div class="wgrow"><label>xWaitForAllBits <select data-all><option value="1">pdTRUE (all of them)</option><option value="0">pdFALSE (any one)</option></select></label><label>xClearOnExit <select data-clr><option value="1">pdTRUE</option><option value="0">pdFALSE</option></select></label></div>
    <div class="wgbtns"><button class="hb" data-pre="0">stage solution: uplink waits for all three</button><button class="hb" data-pre="1">the "any" mistake</button><button class="hb" data-pre="2">radio link and fix, no clock</button></div><div data-out></div>`);
  const get = (id) => [0, 1, 2].reduce((a, i) => a | (el.querySelector(`[data-${id}${i}]`).checked ? 1 << i : 0), 0);
  const set = (id, v) => [0, 1, 2].forEach(i => { el.querySelector(`[data-${id}${i}]`).checked = !!(v >> i & 1); });
  const draw = () => {
    const g = get('g'), m = get('m'), all = el.querySelector('[data-all]').value === '1', clr = el.querySelector('[data-clr]').value === '1', names = v => BITS.filter((b, i) => v >> i & 1).join(' | ') || '0';
    let msg;
    if (!m) msg = `<span class="bad">uxBitsToWaitFor is 0: real FreeRTOS asserts on this (configASSERT), the call is a programming error.</span>`;
    else {
      const ok = all ? (g & m) === m : (g & m) !== 0, after = ok && clr ? g & ~m : g;
      msg = ok ? `<b ${GRN}>Returns at once, without blocking.</b> Return value: <b>${bin3(g)}</b> (the whole group as it was when the condition came true, before the clear). Group afterwards: <b>${bin3(after)}</b>${clr ? ` (only the waited bits, ${names(m)}, were cleared)` : ' (pdFALSE: nothing is cleared, so the next call returns at once again)'}.`
        : `<b ${RED}>Blocks.</b> ${all ? 'It needs ' + names(m) + ' all set' : 'It needs at least one of ' + names(m)}. Missing now: ${names(m & ~g)}. The task sleeps on the group's waiting list until a SetBits makes the condition true, with no CPU cost.`;
    }
    el.querySelector('[data-out]').innerHTML = `<p class="wgcap">${msg}</p>`;
  };
  el.addEventListener('change', draw);
  el.addEventListener('click', e => { const b = e.target.closest('[data-pre]'); if (!b) return; const p = +b.dataset.pre; set('m', p === 2 ? 5 : 7); el.querySelector('[data-all]').value = p === 1 ? '0' : '1'; el.querySelector('[data-clr]').value = '1'; set('g', p === 0 ? 3 : p === 1 ? 1 : 1); draw(); });
  set('g', 3); set('m', 7); draw();
}

// Widget 4: the two bring-up windows with a real event group, an idealised one-task uplink (each send takes 26 ms)
function windowlab(el) {
  const MODES = [['all', 'all three bits (the stage solution)'], ['any', 'any bit'], ['fix', 'FIX_OK only'], ['link', 'LINK_UP only'], ['time', 'TIME_OK only'], ['seq', 'three waits in a row, one bit each'], ['twice', 'LINK_UP first, then all three']];
  const STEPS = { all: [[7, 1]], any: [[7, 0]], fix: [[4, 1]], link: [[1, 1]], time: [[2, 1]], seq: [[1, 1], [2, 1], [4, 1]], twice: [[1, 1], [7, 1]] };
  el.innerHTML = frame('TWO WINDOWS, ONE EVENT GROUP (ONE UPLINK TASK, NO OTHER LOAD)', `<div class="wgrow"><label>uplink waits for <select data-mode>${MODES.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label></div>
    <div class="wgrow">window 1: ${sl('l1', 'radio up', 150, 900, 456, 1)} ${sl('t1', 'clock', 150, 900, 536, 1)} ${sl('f1', 'fix', 150, 900, 667, 1)}</div>
    <div class="wgrow">window 2: ${sl('l2', 'radio up', 150, 940, 799, 1)} ${sl('t2', 'clock', 150, 940, 849, 1)} ${sl('f2', 'fix', 150, 940, 793, 1)}</div><div data-out></div>`);
  const draw = () => {
    const mode = el.querySelector('[data-mode]').value, T = { link: [val(el, 'l1'), val(el, 'l2')], time: [val(el, 't1'), val(el, 't2')], fix: [val(el, 'f1'), val(el, 'f2')] }, steps = STEPS[mode];
    const sets = []; // [time, bit, makes the fact true]
    [['link', 0], ['time', 1], ['fix', 2]].forEach(([k, b]) => T[k].forEach((t, w) => { sets.push([t, b, true]); if (k === 'link' && w === 0) sets.push([t + 40, b, false]); }));   // radio_link sets LINK_UP a second time 40 ms later
    let bits = 0, pc = 0, busy = -1; const rdy = [false, false, false], sends = [];
    for (let t = 0; t < 1000; t++) {
      sets.filter(s => s[0] === t).forEach(([, b, r]) => { bits |= 1 << b; if (r) rdy[b] = true; });
      if (busy === t) { const miss = [0, 1, 2].filter(k => !rdy[k]); sends.push({ from: t - 26, to: t, miss }); if (!miss.length) rdy.fill(false); busy = -1; pc = 0; }
      if (busy < 0) while (pc < steps.length) {
        const [m, all] = steps[pc]; if (!(all ? (bits & m) === m : (bits & m) !== 0)) break;
        bits &= ~m; pc++; if (pc === steps.length) { busy = t + 26; break; }
      }
    }
    const okT = sends.filter(s => !s.miss.length).map(s => s.to), rej = sends.length - okT.length;
    const rounds = [0, 1].map(w => Math.max(T.link[w], T.time[w], T.fix[w])), dly = rounds.map((r, i) => okT[i] === undefined ? -1 : okT[i] - r);
    const X = t => 100 + t * 0.6; let ch = [0, 1, 2].map(i => note(94, 28 + i * 34 + 4, BITS[i], 'end')).join('') + note(94, 154, 'send_uplink()', 'end');
    sets.forEach(([t, b, r]) => { ch += up(X(t), 28 + b * 34 + 22, 28 + b * 34 - 2) ; });
    sends.forEach(s => { ch += bar(X(s.from), 140, 26 * 0.6, s.miss.length ? 'r' : 'g', 22) + (s.miss.length ? '' : note(X(s.from) + 8, 180, 'sent ' + s.to, 'middle')); });
    ch += axis(100, 712, 196) + [0, 200, 400, 600, 800, 1000].map(t => note(X(t), 210, t, 'middle')).join('');
    const good = rej === 0 && okT.length === 2 && dly.every(x => x >= 0 && x <= 60);
    el.querySelector('[data-out]').innerHTML = svg(720, 214, ch, 'Bits set by the three bring-up tasks and the packets the uplink sends')
      + `<p class="wgcap">Packets accepted: <b>${okT.length}</b> (${okT.join(', ') || 'none'}), rejected: <b ${rej ? RED : ''}>${rej}</b>. Delay after the last of the three was ready: <b>${dly.join(', ')}</b> ms (-1 = never sent). `
      + (good ? `<span class="good">This is the stage goal: one packet per window, none rejected.</span>` : `<span class="bad">${rej ? 'The uplink sent before all three facts were true.' : 'A window never produced a packet.'}</span>`)
      + ` Window 1 finishes last with <b>${NICE[T.link[0] >= Math.max(T.time[0], T.fix[0]) ? 0 : T.time[0] >= T.fix[0] ? 1 : 2]}</b>, window 2 with <b>${NICE[T.link[1] >= Math.max(T.time[1], T.fix[1]) ? 0 : T.time[1] >= T.fix[1] ? 1 : 2]}</b>. Red bars are rejected packets. The game adds a few ms of CPU contention to each send.</p>`;
  };
  el.addEventListener('input', draw); el.addEventListener('change', draw); draw();
}

// Widget 5: choose the signalling tool
function whichtool(el) {
  const O = [['notif', 'task notification'], ['count', 'counting semaphore'], ['queue', 'queue'], ['group', 'event group']];
  const Q = [['A DMA-complete interrupt must wake the one task that processes the buffer.', 'notif'], ['Ten sensor interrupts arrive in a burst and a worker must process every one of them.', 'count'], ['A task must start only when Wi-Fi is up, the clock is synced and the config is loaded.', 'group'], ['A producer hands 32-byte sensor frames to a consumer.', 'queue'], ['The boot task raises "system ready" once, and four tasks wait for it before they start.', 'group']];
  const why = { notif: 'one event for one waiter needs no object at all: the task notification is cheaper than any of the others', count: 'each interrupt is an event that must be counted and none may be lost', queue: 'the waiter needs the data, and only a queue carries it', group: 'it is a state with several parts, or one fact with several waiters, and an event group holds that state' };
  el.innerHTML = frame('WHICH TOOL? FIVE JOBS', Q.map(([t], i) => `<p class="wgcap">${i + 1}. ${t} <select data-q="${i}"><option value="">choose</option>${O.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select> <b data-r="${i}"></b></p>`).join(''));
  el.addEventListener('change', e => {
    const i = e.target.dataset.q; if (i === undefined) return; const v = e.target.value, r = el.querySelector(`[data-r="${i}"]`), good = v === Q[i][1];
    r.textContent = v === '' ? '' : good ? 'Yes: ' + why[v] : 'No. ' + (v === 'group' ? 'An event group does not count and carries no data; this job does not need to know several things at once.' : v === 'notif' ? 'A notification cannot say "all of these" and has exactly one waiter.' : v === 'count' ? 'A counting semaphore counts events but cannot hold a state made of several parts.' : 'A queue copies data in and out; here there is none to move.'); r.style.color = good ? '#6fe38a' : '#ff5d4d';
  });
}

// Widget 6: pick the fix
function pickfix(el) {
  const Q = [
    ['The uplink loops on xEventGroupWaitBits(sys_ev, ALL, pdTRUE, pdTRUE, 0) and checks the result. In the game the kernel stops with task_wdt.', ['Block with portMAX_DELAY and let the group wake the task', 'Add vTaskDelay(1) and keep the timeout 0', 'Raise the priority of the uplink'], 0, 'a timeout of 0 never blocks, so the task never leaves Ready and nothing of lower priority runs, the idle task included. The wait is the sleep.'],
    ['gps_fix sets FIX_OK first and then calls acquire_fix(), "so that nobody waits long". The first packet is rejected at 46 ms.', ['Set the bit after acquire_fix() returns', 'Clear the bit again when acquire_fix() returns', 'Make gps_fix a higher priority'], 0, 'a bit is a statement about the world. Set it only when it is true, which is after the work has finished.'],
    ['A GPIO interrupt calls xEventGroupSetBits(sys_ev, FIX_OK_BIT). The kernel asserts or the system misbehaves.', ['Call xEventGroupSetBitsFromISR() and pass the woken flag on', 'Call SetBits with a timeout argument of 0', 'Disable the interrupt while setting'], 0, 'only the FromISR variants may run in an interrupt. It posts the work to the timer service task, which sets the bit a moment later.'],
    ['The uplink waits for LINK_UP, then for all three bits. It sends one packet and never sends in window 2.', ['Wait once for all three bits with pdTRUE', 'Wait for all three with pdFALSE', 'Wait for LINK_UP with a longer timeout'], 0, 'the first wait cleared LINK_UP and the radio sets it only once in window 2, so the second wait lacks it. One wait on the whole mask is both simpler and correct.'],
  ];
  el.innerHTML = frame('WHICH FIX? FOUR EVENT GROUP MISTAKES', Q.map(([t, o], i) => `<p class="wgcap">${i + 1}. ${t} <select data-q="${i}"><option value="">choose</option>${o.map((x, k) => `<option value="${k}">${x}</option>`).join('')}</select> <b data-r="${i}"></b></p>`).join(''));
  el.addEventListener('change', e => {
    const i = e.target.dataset.q; if (i === undefined) return; const v = e.target.value, r = el.querySelector(`[data-r="${i}"]`), q = Q[i], good = v !== '' && +v === q[2];
    r.textContent = v === '' ? '' : good ? 'Yes: ' + q[3] : 'No. ' + q[3]; r.style.color = good ? '#6fe38a' : '#ff5d4d';
  });
}

export const widgets = { semstep, bitboard, waitlab, windowlab, whichtool, pickfix };

/* ================= theory ================= */

export const realCode = `// main/rover_main.c   (ESP-IDF v5.x; Kconfig names below checked on v5.2)   stage 10: stage 9 plus an uplink that waits for three bring-up facts with an event group
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "freertos/timers.h"
#include "freertos/event_groups.h"
#include "driver/gpio.h"
#include "esp_attr.h"
#include "esp_log.h"
#include "rover.h"   // prototypes for the rover helpers: acquire_link, sync_time, acquire_fix, send_uplink, deploy_antenna, ... (not shown)

#define PRIO_LIGHTS    4
#define PRIO_MOTOR     3
#define PRIO_MID       2   // telemetry, science, imu, thermo
#define PRIO_LOW       1   // camera, spectro, nav, mapper, radio, bumper, antenna, and the four new tasks below

#define GPIO_RX_IRQ    GPIO_NUM_5    // example pin: the radio module raises it for each packet
#define STOW_DELAY_MS  200

// One bit per fact. Bits 0 to 23 are usable; the kernel keeps bits 24 to 31 for itself.
#define LINK_UP_BIT    (1 << 0)      // the radio link is associated
#define TIME_OK_BIT    (1 << 1)      // the clock is synced
#define FIX_OK_BIT     (1 << 2)      // the rover has a position fix
#define ALL_READY_BITS (LINK_UP_BIT | TIME_OK_BIT | FIX_OK_BIT)

typedef struct { uint8_t data[32]; } packet_t;

static const char *TAG = "rover";
static QueueHandle_t rx_q;
static TimerHandle_t stow_tmr;
static EventGroupHandle_t sys_ev;    // stage 10: the three facts the ground station insists on

/* ---------- stage 9, unchanged ---------- */
static void on_stow(TimerHandle_t t) { stow_antenna(); }

static void IRAM_ATTR on_packet(void *arg)
{
    packet_t pkt = {0};
    BaseType_t woken = pdFALSE;
    xQueueSendFromISR(rx_q, &pkt, &woken);
    portYIELD_FROM_ISR(woken);
}

static void antenna_task(void *arg)
{
    packet_t pkt;
    for (;;) {
        xQueueReceive(rx_q, &pkt, portMAX_DELAY);
        deploy_antenna();
        xTimerReset(stow_tmr, 0);
        handle_packet(&pkt);
    }
}

/* ---------- stage 10: bring-up tasks, one bit each ---------- */
// Each task sets its bit AFTER the work is done, because the bit means "this is true now".
// The game scales real bring-up times (seconds for association, SNTP and a cold GPS fix) down to 60 to 640 ms.
static void radio_link_task(void *arg)
{
    acquire_link();                                        // 430 ms in the game (association)
    xEventGroupSetBits(sys_ev, LINK_UP_BIT);
    vTaskDelay(pdMS_TO_TICKS(40));                         // DHCP finishes: the fact is already true, setting it again changes nothing
    xEventGroupSetBits(sys_ev, LINK_UP_BIT);
    vTaskDelay(pdMS_TO_TICKS(220));
    acquire_link();                                        // window 2: re-associate, 60 ms
    xEventGroupSetBits(sys_ev, LINK_UP_BIT);
    vTaskDelete(NULL);                                     // done (the game just sleeps: it has no delete block)
}

static void time_sync_task(void *arg)
{
    sync_time();                                           // 510 ms in the game
    xEventGroupSetBits(sys_ev, TIME_OK_BIT);
    vTaskDelay(pdMS_TO_TICKS(20));
    sync_time();                                           // window 2: 290 ms
    xEventGroupSetBits(sys_ev, TIME_OK_BIT);
    vTaskDelete(NULL);
}

static void gps_fix_task(void *arg)
{
    acquire_fix();                                         // 640 ms in the game
    xEventGroupSetBits(sys_ev, FIX_OK_BIT);
    vTaskDelay(pdMS_TO_TICKS(60));
    acquire_fix();                                         // window 2: 60 ms
    xEventGroupSetBits(sys_ev, FIX_OK_BIT);
    vTaskDelete(NULL);
}

static void uplink_task(void *arg)
{
    for (;;) {
        // Sleep until LINK_UP and TIME_OK and FIX_OK are all set. pdTRUE (1st) clears those three bits on return,
        // so the next packet needs fresh data. pdTRUE (2nd) means "all of them", not "any one".
        // portMAX_DELAY: block for as long as it takes. Never poll with a timeout of 0.
        EventBits_t got = xEventGroupWaitBits(sys_ev, ALL_READY_BITS, pdTRUE, pdTRUE, portMAX_DELAY);
        if ((got & ALL_READY_BITS) == ALL_READY_BITS) {      // always true with portMAX_DELAY; essential if you ever use a timeout
            send_uplink();                                   // 1 ms of CPU, the ground station accepts it
        }
    }
}

// Other tasks and the bumper ISR from stages 1 to 8: unchanged
static void beacon_task(void *arg);
static void heart_task(void *arg);
static void motor_task(void *arg);
static void camera_task(void *arg);
static void telemetry_task(void *arg);
static void spectro_task(void *arg);
static void nav_task(void *arg);
static void mapper_task(void *arg);
static void science_task(void *arg);
static void radio_task(void *arg);
static void imu_task(void *arg);
static void thermo_task(void *arg);
static void bumper_task(void *arg);
static void IRAM_ATTR on_bump(void *arg);

void app_main(void)
{
    // ... GPIO setup, I2C mutex, queues and the other tasks from stages 1 to 8 ...
    // Return values unchecked for brevity: check them in real code (pdPASS, non-NULL handles).
    rx_q = xQueueCreate(4, sizeof(packet_t));
    stow_tmr = xTimerCreate("stow_tmr", pdMS_TO_TICKS(STOW_DELAY_MS), pdFALSE, NULL, on_stow);
    xTaskCreate(antenna_task, "antenna", 1792, NULL, PRIO_LOW, NULL);

    // Stage 10. Create the group BEFORE any task that uses it. The old binary semaphore ready_sem is gone.
    sys_ev = xEventGroupCreate();                       // returns NULL if the heap is too small
    configASSERT(sys_ev != NULL);
    xTaskCreate(radio_link_task, "radio_link", 1536, NULL, PRIO_LOW, NULL);   // game stack sizes; calls that use ESP_LOGx need more
    xTaskCreate(time_sync_task,  "time_sync",  1792, NULL, PRIO_LOW, NULL);
    xTaskCreate(gps_fix_task,    "gps_fix",    1664, NULL, PRIO_LOW, NULL);
    xTaskCreate(uplink_task,     "uplink",     2048, NULL, PRIO_LOW, NULL);

    gpio_install_isr_service(ESP_INTR_FLAG_IRAM);
    gpio_isr_handler_add(GPIO_RX_IRQ, on_packet, NULL);
    ESP_LOGI(TAG, "tick period: %d ms", (int)portTICK_PERIOD_MS);
}

// Build notes
//   freertos/event_groups.h declares the event group API; nothing extra to enable for the task-level calls.
//   xEventGroupSetBitsFromISR() is built on the timer service task: it needs software timers (ESP-IDF v5.2: CONFIG_FREERTOS_USE_TIMERS, on by default)
//     and the "pend function call" support, and it posts to the timer command queue (CONFIG_FREERTOS_TIMER_QUEUE_LENGTH, default 10 in v5.2).
//   EventBits_t is a 32-bit type here, so 24 bits are usable by your code (bits 24 to 31 are control bits of the kernel).
//   CONFIG_FREERTOS_HZ: the ESP-IDF v5.2 default is 100 (10 ms tick), so pdMS_TO_TICKS(40) is 4 ticks and pdMS_TO_TICKS(20) is 2 ticks.
//   The game runs at 1000 (1 ms tick). Set 1000 on real hardware to match the game.
//   idf.py build flash monitor`;

export const manual = [
  ['1. Waiting for more than one thing', `<p>The comms team wired the uplink in the obvious way: <code>radio_link</code>, <code>time_sync</code> and <code>gps_fix</code> each call <code>xSemaphoreGive(ready_sem)</code> when they finish, and the <code>uplink</code> task calls <code>xSemaphoreTake(ready_sem, portMAX_DELAY)</code> and then <code>send_uplink()</code>. The ground station accepts a packet only if the radio link is up, the clock is synced <b>and</b> the rover has a position fix.</p>
   ${semDia}
   <p class="cap">Each give wakes the uplink once. The chart marks four of the gives and what is ready when each one arrives.</p>
   <p>Real association, SNTP and a cold GPS fix take seconds. The game scales them to 60 to 640 ms so that a 1 s test contains two uplink windows. The game's tick is 1 ms; the ESP-IDF default is 100 Hz.</p>
   <p><b>Predict before you flash:</b> the first give arrives at 456 ms. What will the uplink send? Answer the check question, then run the start firmware and compare.</p>`],

  ['2. Event groups: one bit per fact', `<p>An <b>event group</b> is a kernel object that holds one word of bits. Each bit is a fact: <code>LINK_UP</code>, <code>TIME_OK</code>, <code>FIX_OK</code>. A task that learns a fact sets its bit. A task that needs several facts waits on the bits and the kernel wakes it when the combination is true. Nobody counts anything.</p>
   ${bitsDia}
   <pre>#define LINK_UP_BIT (1 &lt;&lt; 0)
#define TIME_OK_BIT (1 &lt;&lt; 1)
#define FIX_OK_BIT  (1 &lt;&lt; 2)

EventGroupHandle_t sys_ev = xEventGroupCreate();      // NULL if the heap is full
xEventGroupSetBits(sys_ev, LINK_UP_BIT);              // returns the group value when the call returns
xEventGroupClearBits(sys_ev, LINK_UP_BIT);            // returns the value it had BEFORE the clear
EventBits_t now = xEventGroupGetBits(sys_ev);         // a snapshot, may be stale a moment later</pre>
   <ul><li><b>The word is an <code>EventBits_t</code>.</b> On the ESP32 FreeRTOS keeps it the same width as a tick count (32 bits), and the kernel uses the top 8 bits for its own flags (clear on exit, wait for all, unblocked because a bit was set). That leaves <b>24 bits</b>, 0 to 23, for you. A mask that touches bit 24 or higher is a bug.</li>
   <li><b>Bits are state, not events.</b> <code>xEventGroupSetBits()</code> is an OR. Setting a bit that is already set changes nothing, and nothing is queued. This is why <code>radio_link</code> can set <code>LINK_UP</code> twice in window 1 without harm, and why the same two gives fed the semaphore design a second wake-up.</li>
   <li>The group is a heap object. <code>xEventGroupCreate()</code> allocates its control block from the heap (<code>xEventGroupCreateStatic()</code> takes a buffer instead) and returns <code>NULL</code> when it fails. The game charges 96 B for <code>sys_ev</code>; that is a game value. The real control block is a few dozen bytes: see <code>sizeof(StaticEventGroup_t)</code> in your build. It holds no data except the bits: no payload, no sender.</li>
   <li>The group keeps a list of the tasks that wait on it. Each waiter stores its mask and its two flags in its list item, which is the reason the mask is limited to 24 bits.</li></ul>
   <p>Press the setters, including the same one twice, and watch three objects receive the same signals:</p>
   <div data-w="bitboard"></div>`],

  ['3. Waiting for all or for any', `<p>The waiting side is one call with five parameters. The order matters, because three of them are almost always <code>pdTRUE</code> or <code>pdFALSE</code> and are easy to swap:</p>
   <pre>EventBits_t xEventGroupWaitBits(
    EventGroupHandle_t xEventGroup,
    // the mask: which bits matter
    const EventBits_t  uxBitsToWaitFor,
    // pdTRUE: clear the mask bits on return
    const BaseType_t   xClearOnExit,
    // pdTRUE: wait for ALL bits, pdFALSE: ANY one
    const BaseType_t   xWaitForAllBits,
    // portMAX_DELAY: block until true
    TickType_t         xTicksToWait);</pre>
   ${truthDia}
   <p class="cap">The condition is tested against the bits in the mask only. Bits outside it are ignored.</p>
   <ul><li><b>All:</b> <code>(bits &amp; mask) == mask</code>. <b>Any:</b> <code>(bits &amp; mask) != 0</code>. The uplink needs all: <code>xEventGroupWaitBits(sys_ev, LINK_UP_BIT | TIME_OK_BIT | FIX_OK_BIT, pdTRUE, pdTRUE, portMAX_DELAY)</code>.</li>
   <li><b>If the condition is already true the call returns at once.</b> Otherwise the task goes to the Blocked state on the group's waiting list and uses no CPU. <code>xEventGroupSetBits()</code> then walks that list, tests each waiter's mask and moves the satisfied ones to Ready. This is how one call can wake several tasks. (The game has one waiter per group, so its chart does not show that.)</li>
   <li><b>The return value</b> is the group value at the moment the condition became true, before any clear. If the call returned because of the timeout it is the value at that moment, and <b>you must test it with the mask</b>: <code>(got &amp; mask) == mask</code>. A bare timeout is not an error code.</li>
   <li><code>uxBitsToWaitFor</code> must not be 0 (FreeRTOS asserts) and must not use the top 8 bits.</li>
   <li>The "any" version is the one in the ESP-IDF Wi-Fi station example: it waits for a connected bit or a failed bit with <code>pdFALSE, pdFALSE</code>. Here the "any" mistake is the start firmware again: the first bit wakes the uplink.</li></ul>
   <p>Change the group, the mask and the two flags, and read the return value:</p>
   <div data-w="waitlab"></div>`],

  ['4. Clear on exit, and the second window', `<p><code>xClearOnExit = pdTRUE</code> clears the mask bits <b>when the wait returns</b>. For the uplink this is the point: after a packet the three facts are used up, so the next packet needs fresh ones. The rover has two uplink windows, and each starts with the three bits clear and ends when the wait returns.</p>
   ${winDia}
   <p class="cap">In window 1 the fix is last (667 ms). In window 2 the clock is last (849 ms). The measured accepted packets are at about 693 and 874 ms.</p>
   <ul><li><b>Only the bits in the mask are cleared.</b> If the group also holds a bit the call did not wait for, that bit stays.</li>
   <li><b>pdFALSE leaves the bits set.</b> The next call then returns at once, forever, until somebody calls <code>xEventGroupClearBits()</code>. That is a valid design for a state such as "Wi-Fi is up", and a bug for a once-per-window handshake.</li>
   <li>Waiting for the wrong subset fails in a pattern: <b>"FIX_OK only"</b> works in window 1 (the fix is last) and fails in window 2, where the clock is last, so the packet is rejected for a missing clock. <b>"LINK_UP only"</b> and <b>"TIME_OK only"</b> send late, 172 and 210 ms after the last fact in the game (the widget below is idealised and shows slightly less). No single bit is last in both windows, which is the whole reason to wait for the full mask.</li>
   <li><b>"LINK_UP first, then all three"</b> sends one packet. The first wait clears <code>LINK_UP</code>; in window 2 the radio sets it only once, and the second wait needs it again. Two waits that consume the same bit are a trap: one wait on the whole mask is both shorter and right.</li>
   <li><code>radio_link</code> sets <code>LINK_UP</code> a second time 40 ms after the first. With the group this is harmless; with the semaphore it was an extra wake-up.</li></ul>
   <p>Pick a wait mode and move the completion times. Which bit is last in each window, and what does the uplink do?</p>
   <div data-w="windowlab"></div>`],

  ['5. Event group, semaphore, notification, queue', `<p><b>What the start firmware did.</b> You have run it now. Compare it with what the log showed:</p>
   <ul><li>There are seven gives (the radio gives three times, the clock twice, the fix twice) and therefore seven wake-ups. Five packets are rejected and two are accepted.</li>
   <li>A semaphore carries one piece of information: <b>a give happened</b>. A binary semaphore holds a flag (internally a queue of length 1 with no data), a counting semaphore holds a number of gives. Neither stores <b>which</b> task gave.</li>
   <li>Counting the gives does not repair it. Taking the semaphore three times in a row sends one packet at the wrong moment, because the radio gives a second time 40 ms after the first and fills one of the three takes.</li></ul>
   <div data-w="semstep"></div>
   <p>The kernel has four ways to say "something happened". They differ in what the waiter learns, and the choice follows from that:</p>
   ${treeDia}
   <table style="width:100%;font-size:.84rem;border-collapse:collapse"><tr style="text-align:left;color:#9fb0b9"><th>Tool</th><th>Waiter learns</th><th>Waiters</th><th>Remembers</th></tr>
   <tr><td>task notification</td><td>an event happened (or a 32-bit value)</td><td>one, the target task</td><td>a count or a bit pattern in the task</td></tr>
   <tr><td>binary or counting semaphore</td><td>a give happened</td><td>any</td><td>a flag or a count</td></tr>
   <tr><td>queue</td><td>the data itself</td><td>any</td><td>the items, in order</td></tr>
   <tr><td>event group</td><td>which of N facts are true</td><td>several, each with its own mask</td><td>N bits of state</td></tr></table>
   <ul><li><b>Why not three semaphores, taken in a row?</b> It works only if each is given exactly once per window. The radio gives twice in window 1: the spare token stays in its semaphore and satisfies the wait for the radio in the next window before the radio is up again. A bit that is set twice stays one bit.</li>
   <li><b>Why not a task notification?</b> It wakes exactly one task, and a notification can carry bits (<code>xTaskNotify(..., eSetBits)</code> and <code>xTaskNotifyWait()</code>), which is a fair design for one waiter. An event group is better when several tasks need the same facts, or when the bits should live in an object nobody owns.</li>
   <li><b>Cost:</b> in the game the group is 96 B and the four new tasks are 1536, 1792, 1664 and 2048 B of stack. Deleting the unused <code>ready_sem</code> saves 96 B more, which is the difference between 2 and 3 stars in the RAM objective. An event group has no data to copy, so it costs no queue storage.</li>
   <li>The rule: <b>a count of events</b> needs a counting semaphore, <b>data</b> needs a queue, <b>these N conditions</b> or <b>one fact with several waiters</b> needs an event group.</li></ul>
   <p>Match five jobs to the tool:</p>
   <div data-w="whichtool"></div>`],

  ['6. Rules and real-world details', `<p>Event groups are small, so the mistakes are small too and each one has a clear symptom.</p>
   ${orderDia}
   <p class="cap">A bit is a statement about the world. Set it when the statement has become true, not before the work.</p>
   <ul><li><b>Never poll.</b> <code>xEventGroupWaitBits(..., 0)</code> in a loop never blocks. The task stays Ready, the idle task starves and the watchdog fires. In the game the task watchdog trips at 599 ms (real default: 5 s, <code>CONFIG_ESP_TASK_WDT_TIMEOUT_S</code>). The wait is the sleep: use <code>portMAX_DELAY</code>.</li>
   <li><b>Set the bit after the work.</b> Setting <code>FIX_OK</code> before <code>acquire_fix()</code> makes the uplink send with no fix: the first packet is rejected at 46 ms with all three facts missing.</li>
   <li><b>A timeout is a decision.</b> With a finite timeout the call returns when time runs out, and the return value tells which bits were set. Test it with the mask. This stage has no timeout on purpose: the game's simulator restarts a task from its first line when a wait times out, which is not what the real kernel does.</li>
   </ul>
   <details><summary><b>Going further</b>: interrupts, several waiters, rendezvous, deletion</summary><ul><li><b>From an interrupt</b> use <code>xEventGroupSetBitsFromISR(group, bits, &amp;woken)</code> and <code>portYIELD_FROM_ISR(woken)</code>. It cannot set the bits itself, because setting walks the waiting list and the scheduler is suspended while it does. It posts the job to the <b>timer service task</b> (stage 9), so the bits appear when that task runs, and it returns <code>pdFALSE</code> (<code>pdPASS</code> on success) when the timer command queue (10 entries by default in v5.2) is full. <code>xEventGroupWaitBits()</code> cannot be called from an ISR at all.</li>
   <li><b>Several waiters:</b> real <code>xEventGroupSetBits()</code> wakes every waiter whose condition is now true, and then clears the bits of those that asked for clear-on-exit, all at the end of the call. A waiter therefore never races another for the clear. (The game has one waiter; its simulator does not model this.)</li>
   <li><b>Rendezvous:</b> <code>xEventGroupSync()</code> sets a task's bit and waits for the others in one atomic step. Use it when N tasks must all reach a point before any continues. Not needed here.</li>
   <li><b>Clean up:</b> <code>vEventGroupDelete()</code> frees the group and unblocks every waiter, which then sees a zero value.</li></ul></details>
   <p>Four mistakes, four fixes:</p>
   <div data-w="pickfix"></div>`],
];

export const quiz = [
  { q: 'Predict: the uplink takes ready_sem and sends. The first give, from radio_link, arrives at 456 ms. What does the uplink send?', opts: ['A packet with only the radio up', 'Nothing until all three tasks have given', 'A valid packet: the first give means all is done'], a: 0, why: 'A semaphore counts gives and does not know which task gave. The first give wakes the uplink and the ground station rejects the packet for the missing clock and fix.', wrong: [null, "A semaphore does not know who gave it, so it cannot wait for three tasks. Each give wakes the uplink at once.", "The ground station accepts a packet only when the link, the clock and the fix are all true. A give says that something finished, not that everything finished."] },
  { q: 'radio_link calls xEventGroupSetBits(sys_ev, LINK_UP_BIT) at 456 ms and again at 496 ms. What does the group hold after the second call?', opts: ['LINK_UP is set twice, so a wait for it can return twice', 'LINK_UP is set; the second call changed nothing', 'LINK_UP is set and the second call returned an error'], a: 1, why: 'SetBits is an OR into a word of state. A bit that is already set stays set and nothing is queued. A semaphore would have been given twice.', wrong: ["Setting a bit is an OR into a word of state, and nothing is queued. A bit that is already set stays set, so one wait can return only once.", null, "xEventGroupSetBits() has no error for a bit that is already set. It just returns the group value."] },
  { q: 'Which call waits for the radio link and the position fix, but does not care about the clock?', opts: ['xEventGroupWaitBits(g, LINK_UP_BIT | FIX_OK_BIT, pdTRUE, pdTRUE, portMAX_DELAY)', 'xEventGroupWaitBits(g, LINK_UP_BIT | FIX_OK_BIT, pdTRUE, pdFALSE, portMAX_DELAY)', 'xEventGroupWaitBits(g, LINK_UP_BIT | TIME_OK_BIT | FIX_OK_BIT, pdTRUE, pdTRUE, portMAX_DELAY)'], a: 0, why: 'The mask names the two bits and the fourth argument pdTRUE requires both. pdFALSE would return on either one, and the three-bit mask would also wait for the clock.', wrong: [null, "With pdFALSE as the fourth argument the call returns when any one bit of the mask is set, so it does not wait for both.", "This mask also contains TIME_OK_BIT, so the wait would block until the clock is synced as well."] },
  { q: 'The uplink first waits for LINK_UP alone, then waits for all three bits, both with pdTRUE. It sends one packet in the whole run. Why?', opts: ['The first wait cleared LINK_UP, and in window 2 the radio sets it only once, so the second wait lacks it', 'xEventGroupWaitBits() can only be called once per task', 'pdTRUE in the second wait means the bits are cleared before they are tested'], a: 0, why: 'Clear on exit removes the waited bits when the call returns. The first wait consumed the one LINK_UP of window 2, so the second wait blocks for good. One wait on the full mask does not have this problem.', wrong: [null, "There is no such limit. A task may call xEventGroupWaitBits() as often as it likes, and every call is a new wait.", "Clear on exit happens when the call returns, after the condition was tested, so the clear cannot spoil the wait it belongs to."] },
  { q: 'Recall stages 7 and 8: a bumper interrupt must wake exactly one task, which handles it. Which is the lightest tool?', opts: ['A task notification sent with vTaskNotifyGiveFromISR()', 'An event group with one bit and xEventGroupSetBitsFromISR()', 'A queue of length 1 carrying a dummy item'], a: 0, why: 'One event and one waiter needs no separate object: the notification lives in the task itself and costs no RAM. An event group earns its place only when several facts or several waiters are involved, and it defers the set through the timer service task.', wrong: [null, "An event group works, but it is a heap object, and from an ISR it sets bits through the timer service task. It pays off only for several facts or several waiters.", "A queue could carry the wake-up, but it needs a queue object and storage for an item that holds no information. One event for one task does not need that."] },
  { q: 'The uplink waits with xEventGroupWaitBits(sys_ev, LINK_UP_BIT | TIME_OK_BIT | FIX_OK_BIT, pdTRUE, pdFALSE, portMAX_DELAY). What happens?', opts: ['It returns on the first bit that is set, so the uplink sends early', 'It blocks until all three bits are set, as before', 'It never returns, because pdFALSE disables the wait'], a: 0, why: 'The fourth argument is xWaitForAllBits. pdFALSE means any one bit of the mask is enough, so this is the start firmware\'s mistake again: a packet goes out with one fact true.', wrong: [null, "Blocking until all bits are set is what pdTRUE in the fourth argument does. Here the fourth argument is pdFALSE, so the rule is different.", "pdFALSE does not disable the wait. The call still blocks, but only until any one bit of the mask is set."] },
];
