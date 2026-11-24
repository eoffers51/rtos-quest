// Firmware editor. The code shown is ESP-IDF style C: app_main() creates the kernel objects and tasks,
// and each task / interrupt handler is a list of FreeRTOS calls the player assembles.
import { F, fnInfo, g, d, un, bz, c, tk, gv, gi, sn, rc, si, trs, tst, wt, ds, ng, ngi, nt, es, ew, wa, wr, task } from './kernel.js';

export const PALETTE = ['#5fe3ff', '#ff8ad8', '#ffb347', '#6dffa8', '#b39bff'];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const TOS = [[0, '0'], [10, 'pdMS_TO_TICKS(10)'], [50, 'pdMS_TO_TICKS(50)'], [100, 'pdMS_TO_TICKS(100)'], [300, 'pdMS_TO_TICKS(300)'], [-1, 'portMAX_DELAY']];
const OPN = { gpio: 'gpio_set_level(pin, level)', call: 'call a rover function', delay: 'vTaskDelay', until: 'vTaskDelayUntil', busy: 'esp_rom_delay_us (busy-wait)', send: 'xQueueSend', recv: 'xQueueReceive', take: 'xSemaphoreTake', give: 'xSemaphoreGive', giveISR: 'xSemaphoreGiveFromISR', sendISR: 'xQueueSendFromISR', tReset: 'xTimerReset', tStop: 'xTimerStop', wakeTimer: 'esp_sleep_enable_timer_wakeup', deepSleep: 'esp_deep_sleep_start', notifyGive: 'xTaskNotifyGive', notifyGiveISR: 'vTaskNotifyGiveFromISR', notifyTake: 'ulTaskNotifyTake', evSet: 'xEventGroupSetBits', evWait: 'xEventGroupWaitBits', wdtAdd: 'esp_task_wdt_add', wdtReset: 'esp_task_wdt_reset', fsm: 'switch (state)' };
const fn = t => `<span class="fn">${t}</span>`, cm = t => `<div class="ln cm">// ${t}</div>`;

/**
 * The instruction a new "+ add instruction" line starts as, for every op. Separate from the DOM so the verifier can
 * check that every op a stage offers can really be added.
 * @param {object} L lesson
 * @param {() => object} get current program
 */
export function defaultInstruction(L, get) {
  const names = types => Object.keys(get().objs).filter(k => types.includes(get().objs[k].type));
  const taskNames = () => get().units.filter(u => u.kind === 'task').map(u => u.name);
  // A new line starts on the newest object of its kind (the one this stage added), and a notify starts on the task that waits for one.
  const last = types => { const n = names(types); return n[n.length - 1]; };
  const waiter = () => { const w = get().units.find(u => u.kind === 'task' && u.code.some(i => i.op === 'notifyTake')), t = taskNames(); return w ? w.name : t[t.length - 1]; };
  const defIns = op => ({
    gpio: g(L.pins[0] || 'BEACON'), call: c(L.fns[0]), delay: d(100), until: un(100), busy: bz(100), send: sn(last(['queue'])), recv: rc(last(['queue'])),
    take: tk(last(['binary', 'counting', 'mutex'])), give: gv(last(['binary', 'counting', 'mutex'])), giveISR: gi(last(['binary', 'counting'])),
    sendISR: si(last(['queue'])), tReset: trs(last(['timer'])), tStop: tst(last(['timer'])), wakeTimer: wt(1000), deepSleep: ds(),
    notifyGive: ng(waiter()), notifyGiveISR: ngi(waiter()), notifyTake: nt(), evSet: es(names(['events'])[0], (get().objs[names(['events'])[0]] || { bits: [] }).bits[0]), evWait: ew(names(['events'])[0], 'bit:' + ((get().objs[names(['events'])[0]] || { bits: [''] }).bits[0])),   /* evWait starts on one bit: all-or-any is the player's decision */
    wdtAdd: wa(), wdtReset: wr(),
  })[op];
  return defIns;
}

/**
 * @param {HTMLElement} root
 * @param {object} L lesson definition
 * @param {() => object} get current program
 * @param {() => void} changed called after every edit
 */
export function createEditor(root, L, get, changed) {
  const names = types => Object.keys(get().objs).filter(k => types.includes(get().objs[k].type));
  const taskNames = () => get().units.filter(u => u.kind === 'task').map(u => u.name);
  const defIns = defaultInstruction(L, get);

  function line(ins, dis) {
    const num = k => `<input type="number" min="0" max="9999" data-k="${k}" value="${ins[k]}" ${dis} aria-label="milliseconds">`;
    const sel = (k, opts) => `<select data-k="${k}" ${dis} aria-label="${k}">${opts.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(ins[k]) === String(v) ? 'selected' : ''}>${esc(t)}</option>`; }).join('')}</select>`;
    const sems = names(['binary', 'counting', 'mutex']), qs = names(['queue']), tms = names(['timer']);
    switch (ins.op) {
      case 'gpio': return `${sel('v', [['T', 'toggle'], ['HIGH', 'set'], ['LOW', 'clear']])} ${fn('gpio_set_level')}(${sel('pin', L.pins.map(p => [p, p + '_GPIO']))}, ${ins.v === 'T' ? `!gpio_get_level(${ins.pin}_GPIO)` : ins.v === 'HIGH' ? '1' : '0'});`;   // the first box picks what the line does; the C is always the real call
      case 'delay': return `${fn('vTaskDelay')}(pdMS_TO_TICKS(${num('ms')}));`;
      case 'until': return `${fn('vTaskDelayUntil')}(&amp;last_wake, pdMS_TO_TICKS(${num('ms')}));`;
      case 'busy': return `${fn('esp_rom_delay_us')}(${num('ms')} * 1000); <span class="cm">// busy-wait: spins the CPU</span>`;
      // a line inherited from an earlier stage keeps its own function in the list, or the box would show the wrong name
      case 'call': { // the box of a call line offers the same full list as "+ add instruction": any function, or a kernel call that replaces the line
        const fns = L.fns.includes(ins.fn) || !F[ins.fn] ? L.fns : [ins.fn, ...L.fns], o = (f, cls) => `<option class="${cls}" value="${f}" ${ins.fn === f ? 'selected' : ''}>${esc(sigOf(f))}</option>`;
        const ops = dis ? '' : L.ops.filter(x => x !== 'call').map(x => `<option class="o-rtos" value="op:${x}">${OPN[x]}</option>`).join('');
        return `<select data-k="fn" class="swap" ${dis} aria-label="function or instruction"><optgroup class="og-rover" label="ROVER FUNCTIONS (the rover's own code)">${fns.filter(f => !kern(f)).map(f => o(f, 'o-rover')).join('')}</optgroup><optgroup class="og-rtos" label="FREERTOS AND ESP-IDF CALLS">${ops}${fns.filter(kern).map(f => o(f, 'o-rtos')).join('')}</optgroup></select>; <span class="cm">// ${fnInfo(F[ins.fn])}</span>`; }
      case 'fsm': return fsmBlock(ins, dis);
      case 'send': return `${fn('xQueueSend')}(${sel('q', qs)}, &amp;x, ${sel('to', TOS)});`;
      case 'recv': return `${fn('xQueueReceive')}(${sel('q', qs)}, &amp;${L.fsm ? 'ev' : 'x'}, ${sel('to', TOS)});`;
      case 'sendISR': return `${fn('xQueueSendFromISR')}(${sel('q', qs)}, &amp;x, &amp;woken);`;
      case 'take': return `${fn('xSemaphoreTake')}(${sel('s', sems)}, ${sel('to', TOS)});`;
      case 'give': return `${fn('xSemaphoreGive')}(${sel('s', sems)});`;
      case 'giveISR': return `${fn('xSemaphoreGiveFromISR')}(${sel('s', sems)}, &amp;woken);`;
      case 'tReset': return `${fn('xTimerReset')}(${sel('tm', tms)}, 0);`;
      case 'tStop': return `${fn('xTimerStop')}(${sel('tm', tms)}, 0);`;
      case 'wakeTimer': return `${fn('esp_sleep_enable_timer_wakeup')}(${num('ms')} * 1000ULL); <span class="cm">// microseconds</span>`;
      case 'notifyGive': return `${fn('xTaskNotifyGive')}(${sel('task', taskNames().map(n => [n, n + '_handle']))});`;
      case 'notifyGiveISR': return `${fn('vTaskNotifyGiveFromISR')}(${sel('task', taskNames().map(n => [n, n + '_handle']))}, &amp;woken);`;
      case 'notifyTake': return `${fn('ulTaskNotifyTake')}(${sel('clear', [['1', 'pdTRUE'], ['0', 'pdFALSE']])}, ${sel('to', TOS)}); <span class="cm">// ${String(ins.clear) === '0' ? 'pdFALSE: take one, keep the rest of the count' : 'pdTRUE: clear the count, a burst is one wake-up'}</span>`;
      case 'evSet': { const bits = (get().objs[ins.g] || { bits: [] }).bits; return `${fn('xEventGroupSetBits')}(${sel('g', names(['events']))}, ${sel('bit', bits)});`; }
      case 'evWait': { const bits = (get().objs[ins.g] || { bits: [] }).bits, both = bits.join(' | '); return `${fn('xEventGroupWaitBits')}(${sel('g', names(['events']))}, ${sel('mode', [...bits.map(b => ['bit:' + b, b]), ['all', both + ' /* all of them */'], ['any', both + ' /* any of them */']])}, pdTRUE, ${ins.mode === 'all' ? 'pdTRUE' : 'pdFALSE'}, ${sel('to', TOS)});`; }
      case 'wdtAdd': return `${fn('esp_task_wdt_add')}(NULL); <span class="cm">// this task is now watched (once: keep it as the first line, before the loop)</span>`;
      case 'wdtReset': return `${fn('esp_task_wdt_reset')}(); <span class="cm">// "I am still alive"</span>`;
      case 'deepSleep': return `${fn('esp_deep_sleep_start')}(); <span class="cm">// powers down; wake-up is a reset</span>`;
    }
    return '';
  }

  /**
   * A state machine instruction, drawn as the C switch it stands for. Every state is a case; every table row is one
   * "if (ev == E) { action(); state = N; }" line that the player edits. Under it, the same table as a state diagram.
   */
  function fsmBlock(ins, dis) {
    const M = L.fsm, rows = ins.rows || [];
    const pick = (i, k, opts, label) => `<select data-fk="${k}" ${dis} aria-label="${label}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${rows[i][k] === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    let h = `<div class="fsm"><div class="fl">${fn('switch')} (state) {</div>`;
    M.states.forEach(st => {
      const mine = rows.map((r, i) => [r, i]).filter(x => x[0].s === st), seen = new Set();
      h += `<div class="fl fcase" data-st="${st}">case <b>${st}</b>:</div>`;
      if (!mine.length) h += `<div class="fl frow cm">/* no transition: every event is ignored in ${st} */</div>`;
      mine.forEach(([r, i], k) => {
        const dup = seen.has(r.e); seen.add(r.e); const stay = !r.a && r.n === st;
        h += `<div class="fl frow${dup ? ' dup' : ''}" data-r="${i}"><span class="kw">if</span> (ev == ${pick(i, 'e', M.events.map(e => [e, e]), 'event')}) { ${pick(i, 'a', [['', '/* no action */'], ...M.actions.map(a => [a, a + '();'])], 'action')} state = ${pick(i, 'n', M.states.map(x => [x, x]), 'next state')}; }`
          + `${dis ? '' : `<button class="ib" data-act="fsmdel" aria-label="Delete this transition" title="Delete this transition">✕</button>`}${dup || stay || (r.a && F[r.a] && F[r.a].wait) ? `<span class="cm fnote">// ${dup ? 'never reached: this event already has a row above' : stay ? 'stay: this event is ignored on purpose' : F[r.a].waitTxt || 'blocks'}</span>` : ''}</div>`;
      });
      if (!dis) h += `<div class="fl frow"><button class="ib addline" data-act="fsmadd" data-s="${st}" title="Add a transition out of ${st}">+ transition in ${st}</button></div>`;
      h += `<div class="fl frow kw">break;</div>`;
    });
    return h + `<div class="fl">}</div>${fsmDiagram(rows)}</div>`;
  }
  /** the table as a diagram: one arrow per pair of states, labelled with the events that take it */
  function fsmDiagram(rows) {
    const M = L.fsm, W = 520, H = 250, bw = 104, bh = 34;
    const pos = [[W / 2, 30], [78, 125], [W - 78, 125], [W / 2, 220]], P = Object.fromEntries(M.states.map((st, i) => [st, pos[i % 4]]));
    const edges = {}, stay = {};
    rows.forEach(r => { if (!P[r.s] || !P[r.n]) return; if (r.s === r.n) (stay[r.s] = stay[r.s] || []).push(r.e); else (edges[r.s + '>' + r.n] = edges[r.s + '>' + r.n] || []).push(r.e); });
    let g = '';
    for (const k in edges) {
      const [a, b] = k.split('>'), [x1, y1] = P[a], [x2, y2] = P[b], dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len, off = edges[b + '>' + a] ? 9 : 0;
      // start and end on the box edges, shifted sideways when the pair has arrows in both directions
      const cut = (ux, uy) => Math.min(Math.abs(ux) > 0.001 ? (bw / 2 + 3) / Math.abs(ux) : 1e9, Math.abs(uy) > 0.001 ? (bh / 2 + 3) / Math.abs(uy) : 1e9), c = cut(dx / len, dy / len);
      const sx = x1 + dx / len * c + nx * off, sy = y1 + dy / len * c + ny * off, ex = x2 - dx / len * c + nx * off, ey = y2 - dy / len * c + ny * off, mx = (sx + ex) / 2 + nx * 9, my = (sy + ey) / 2 + ny * 9;
      const txt = edges[k].map(e => e.replace('CMD_', '')).join(', ');
      g += `<line class="fe" x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" marker-end="url(#fsmAh)"/><text class="ft" x="${mx.toFixed(1)}" y="${(my + 3).toFixed(1)}" text-anchor="${Math.abs(nx) < 0.3 ? 'middle' : nx * (off || 1) > 0 ? 'start' : 'end'}">${esc(txt)}</text>`;
    }
    M.states.forEach(st => { const [x, y] = P[st];
      g += `<g class="fn-node" data-node="${st}"><rect x="${x - bw / 2}" y="${y - bh / 2}" width="${bw}" height="${bh}" rx="6"/><text x="${x}" y="${y + (stay[st] ? 0 : 4)}" text-anchor="middle">${st}</text>${stay[st] ? `<text class="fs" x="${x}" y="${y + 12}" text-anchor="middle">stays on ${stay[st].length} event${stay[st].length > 1 ? 's' : ''}</text>` : ''}</g>`; });
    return `<div class="fsmdia"><div class="cm">// the same table as a state diagram (CMD_ left out of the labels); the bright box is the current state during a run</div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="State diagram of the table"><defs><marker id="fsmAh" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>${g}</svg></div>`;
  }

  // Folded blocks: view state only, kept per stage for this visit. Tasks are keyed by name, the startup code by ''.
  const folded = new Set();
  const foldBtn = (key, what) => `<button class="ib fold" data-act="fold" aria-expanded="${!folded.has(key)}" title="${folded.has(key) ? 'Show' : 'Hide'} the code of ${what}" aria-label="${folded.has(key) ? 'Show' : 'Hide'} the code of ${what}">${folded.has(key) ? '▸' : '▾'}</button>`;
  /** one line that stands for a folded block: what the task calls, in order */
  const brief = u => u.code.length ? u.code.map(i => i.op === 'call' ? i.fn + '()' : OPN[i.op].replace(/[ (].*$/, '') + (i.ms ? '(' + i.ms + ')' : '')).join(' → ') : 'empty';

  /** app_main(): pin setup, kernel objects and one xTaskCreate line per task (stack and priority are edited here). */
  function appMain(P) {
    const two = L.cores === 2; let h = '';
    if (L.pins.length) h += cm('pins: outputs that can also be read back') + L.pins.map(p => `<div class="ln">${fn('gpio_set_direction')}(${p}_GPIO, GPIO_MODE_INPUT_OUTPUT);</div>`).join('');
    const on = Object.keys(P.objs);
    if (on.length) h += cm(on.every(k => P.objs[k].type === 'pm') ? 'power management' : 'kernel objects and power management') + on.map(k => {
      const o = P.objs[k], DB = `<button class="ib" data-act="delobj" data-k="${k}">delete</button>`;
      if (o.type === 'pm') return `<div class="ln">${fn('esp_pm_configure')}(&amp;(esp_pm_config_t){ .max_freq_mhz = 160, .min_freq_mhz = 40, .light_sleep_enable = <select data-o="${k}" data-ok="lightSleep" aria-label="automatic light sleep"><option value="0" ${o.lightSleep ? '' : 'selected'}>false</option><option value="1" ${o.lightSleep ? 'selected' : ''}>true</option></select> });</div>`;
      if (o.type === 'events') return `<div class="ln">${k} = ${fn('xEventGroupCreate')}(); <span class="cm">// bits: ${o.bits.join(', ')}</span> ${DB}</div>`;
      if (o.type === 'queue') return `<div class="ln">${k} = ${fn('xQueueCreate')}(<input type="number" min="1" max="20" data-o="${k}" data-ok="len" value="${o.len}" aria-label="queue length">, ${o.item}); <span class="cm">// length, item size</span> ${DB}</div>`;
      if (o.type === 'timer') return `<div class="ln">${k} = ${fn('xTimerCreate')}("${k}", pdMS_TO_TICKS(<input type="number" min="1" max="9999" data-o="${k}" data-ok="period" value="${o.period}" aria-label="period">), <select data-o="${k}" data-ok="auto" aria-label="reload"><option value="1" ${o.auto ? 'selected' : ''}>pdTRUE</option><option value="0" ${o.auto ? '' : 'selected'}>pdFALSE</option></select>, NULL, ${o.cb});</div>`;
      const mk = { binary: o.init ? 'xSemaphoreCreateBinary(); xSemaphoreGive(' + k + ')' : 'xSemaphoreCreateBinary()', counting: `xSemaphoreCreateCounting(${o.max}, 0)`, mutex: 'xSemaphoreCreateMutex()' };
      return `<div class="ln">${k} = ${o.types ? `<select data-o="${k}" data-ok="type" aria-label="object type">${o.types.map(t => `<option value="${t}" ${o.type === t ? 'selected' : ''}>${mk[t]}</option>`).join('')}</select>` : fn(mk[o.type])}; ${DB}</div>`;
    }).join('');
    // an object the stage started with can always be put back after a delete
    const gone = Object.keys(L.startObjs ? L.startObjs() : {}).filter(k => !P.objs[k]);
    h += gone.map(k => `<div class="ln"><span class="cm">// ${k} was deleted</span> <button class="ib" data-act="addobj" data-k="${k}">put ${k} back</button></div>`).join('');
    const tasks = P.units.map((u, i) => [u, i]).filter(x => x[0].kind === 'task');
    h += cm(`tasks: function, name, stack (bytes), argument, priority, handle${two ? ', core' : ''}`);
    h += tasks.length ? tasks.map(([u, i]) => {
      const dis = u.locked ? 'disabled' : '';
      return `<div class="ln" data-u="${i}">${fn(two ? 'xTaskCreatePinnedToCore' : 'xTaskCreate')}(<b style="color:${PALETTE[i % 5]}">${esc(u.name)}</b>, "${esc(u.name)}", <input type="number" min="256" max="16384" step="64" data-uk="stack" value="${u.stack}" ${dis} aria-label="stack size of ${esc(u.name)}">, NULL, <input type="number" class="sm" min="0" max="24" data-uk="prio" value="${u.prio}" ${dis} aria-label="priority of ${esc(u.name)}">, NULL${two ? `, <select data-uk="core" ${dis} aria-label="core"><option value="0" ${u.core === 0 ? 'selected' : ''}>0</option><option value="1" ${u.core === 1 ? 'selected' : ''}>1</option><option value="-1" ${u.core === -1 ? 'selected' : ''}>tskNO_AFFINITY</option></select>` : ''});<span class="lnend">${L.isNew && L.isNew(u.name) ? ' <span class="newtag">NEW</span>' : ''}${u.locked ? '' : ` <button class="ib" data-act="deltask" title="Delete this task: its xTaskCreate() line and its function" aria-label="Delete task ${esc(u.name)}">✕</button>`}</span></div>`;
    }).join('') : cm('no tasks yet');
    // the same action as the + TASK button under the editor, offered where a task is really created: in app_main()
    h += `<div class="ln"><button class="ib addline" data-act="addtask" title="Adds an xTaskCreate() line here and an empty task function below">+ ${two ? 'xTaskCreatePinnedToCore' : 'xTaskCreate'}(…);  add a new task</button></div>`;
    const nT = tasks.length, nO = on.length;
    return `<div class="unit${folded.has('') ? ' folded' : ''}" style="--uc:#e8f2ff"><div class="uh">${foldBtn('', 'app_main()')}<span>STARTUP CODE</span><span class="sp"></span><span class="tip">${folded.has('') ? `app_main(): ${nT} task${nT === 1 ? '' : 's'}, ${nO} object${nO === 1 ? '' : 's'}` : 'runs once, in the main task'}</span></div><div class="ub"><div class="fr">void app_main(void)\n{</div>${h}<div class="fr">}</div></div></div>`;
  }

  // The add list names every rover function itself, in its own group and colour, so nothing hides behind "call a function".
  // Two of them are really heap calls (pvPortMalloc, vPortFree), so they go with the kernel calls.
  const sigOf = f => F[f].sig || f + '()', kern = f => /pvPortMalloc|vPortFree/.test(sigOf(f));
  const fnOpt = (f, cls) => `<option class="${cls}" value="call:${f}">${esc(sigOf(f))}</option>`, callable = L.ops.includes('call') ? L.fns : [];
  const addOpts = (callable.some(f => !kern(f)) ? `<optgroup class="og-rover" label="ROVER FUNCTIONS (the rover's own code)">${callable.filter(f => !kern(f)).map(f => fnOpt(f, 'o-rover')).join('')}</optgroup>` : '')
    + `<optgroup class="og-rtos" label="FREERTOS AND ESP-IDF CALLS">${L.ops.filter(o => o !== 'call').map(o => `<option class="o-rtos" value="${o}">${OPN[o]}</option>`).join('')}${callable.filter(kern).map(f => fnOpt(f, 'o-rtos')).join('')}</optgroup>`;

  function draw() {
    const P = get(); let h = appMain(P);
    P.units.forEach((u, ui) => {
      const dis = u.locked ? 'disabled' : '', col = u.kind === 'isr' ? '#9fb0b9' : PALETTE[ui % 5];
      const fresh = L.isNew && L.isNew(u.name) ? '<span class="newtag">NEW IN THIS STAGE</span>' : '';
      const head = u.kind === 'task'
        ? `<label>TASK FUNCTION <input type="text" data-uk="name" value="${esc(u.name)}" ${dis} maxlength="14" aria-label="task name"></label>`
        : `<span>${u.kind === 'isr' ? 'INTERRUPT HANDLER' : 'TIMER CALLBACK'}</span>`;
      const open = u.kind === 'task' ? `static void ${esc(u.name)}(void *arg)\n{\n  for (;;) {` : u.kind === 'isr' ? `static void IRAM_ATTR ${u.name}(void *arg)\n{` : `static void ${u.name}(TimerHandle_t t)\n{`;
      // a task subscribes to the watchdog once, before its loop: when that call is the first line it is drawn above for (;;)
      const hoist = u.kind === 'task' && u.code.length && u.code[0].op === 'wdtAdd';
      const fo = folded.has(u.name), n = u.code.length;
      h += `<div class="unit${fo ? ' folded' : ''}" data-u="${ui}" style="--uc:${col}"><div class="uh">${foldBtn(u.name, esc(u.name))}${head}${fresh}${fo ? `<span class="tip sum" title="${esc(brief(u))}">${u.kind === 'task' ? `prio ${u.prio} · stack ${u.stack} B · ` : ''}${n} line${n === 1 ? '' : 's'}: ${esc(brief(u))}</span>` : ''}<span class="sp"></span>${u.locked ? '' : u.kind === 'task' ? '<button class="ib" data-act="delunit">delete</button>' : ''}</div>
        <div class="ub"><div class="fr">${hoist ? open.replace(/\n  for \(;;\) \{$/, '') : open}</div><ol class="lines">${u.code.map((ins, li) => `<li data-l="${li}"${ins.op === 'fsm' ? ' class="fsmli"' : ''}><span class="tx">${line(ins, dis)}</span>${u.locked || ins.op === 'fsm' ? '' : '<button class="ib" data-act="up" aria-label="Move up">↑</button><button class="ib" data-act="down" aria-label="Move down">↓</button><button class="ib" data-act="del" aria-label="Delete line">✕</button>'}</li>${hoist && li === 0 ? '<li class="loopopen" aria-hidden="true">  for (;;) {</li>' : ''}`).join('')}</ol>
        ${u.locked ? '' : `<div class="addrow"><select data-add aria-label="Add an instruction"><option value="">+ add instruction…</option>${addOpts}</select></div>`}
        <div class="fr">${u.kind === 'task' ? '  }\n}' : '}'}</div></div></div>`;
    });
    root.innerHTML = h; mark(); fsmState(curState);
  }

  // the state the machine is in at the playback cursor (null before a run): lights its box in the diagram and its case in the switch
  let curState = null;
  function fsmState(st) { curState = st; root.querySelectorAll('.fn-node').forEach(n => n.classList.toggle('cur', n.dataset.node === st)); root.querySelectorAll('.fcase').forEach(n => n.classList.toggle('cur', n.dataset.st === st)); }
  // Where the next "+ add instruction" goes, per unit: an index into its code, or undefined for the end.
  let at = {};
  const mark = () => root.querySelectorAll('.unit[data-u]').forEach(un => {
    const pos = at[+un.dataset.u], lis = [...un.querySelectorAll('ol.lines > li[data-l]')], n = lis.length, here = pos !== undefined && pos < n;
    lis.forEach((li, i) => li.classList.toggle('insat', here && i === pos));
    const first = un.querySelector('[data-add] option'); if (first) first.textContent = here ? `+ add instruction above the marked line…` : '+ add instruction…';
  });
  const onEdit = live => e => {
    const el = e.target, P = get(), uEl = el.closest('[data-u]'), redraw = live ? () => {} : draw;
    if (live && el.tagName === 'SELECT') return;
    if (el.dataset.o) { const o = P.objs[el.dataset.o], k = el.dataset.ok; o[k] = k === 'type' ? el.value : (k === 'auto' || k === 'lightSleep') ? el.value === '1' : Math.max(1, +el.value || 1); changed(); if (k === 'type') redraw(); return; }
    if (!uEl) return;
    const u = P.units[+uEl.dataset.u];
    if (el.dataset.add !== undefined) { if (el.value) { const ui = +uEl.dataset.u, pos = Math.min(at[ui] === undefined ? u.code.length : at[ui], u.code.length); const fnName = el.value.startsWith('call:') ? el.value.slice(5) : '', ins = defIns(fnName ? 'call' : el.value); if (!ins) return; if (fnName && F[fnName]) ins.fn = fnName; u.code.splice(pos, 0, ins); at[ui] = pos + 1; changed(); draw(); } return; }
    if (el.dataset.uk) { const k = el.dataset.uk, was = u.name; u[k] = k === 'name' ? (el.value.replace(/[^A-Za-z0-9_]/g, '') || 'task') : +el.value || 0; if (k === 'name' && folded.delete(was)) folded.add(u.name); changed(); if (k === 'name') redraw(); return; }
    const li = el.closest('li');
    if (li && el.dataset.fk) { const r = (u.code[+li.dataset.l].rows || [])[+el.closest('[data-r]').dataset.r]; if (r) { r[el.dataset.fk] = el.value; changed(); draw(); } return; }
    if (li && el.dataset.k === 'fn' && el.value.startsWith('op:')) { const ins = defIns(el.value.slice(3)); if (ins) { u.code[+li.dataset.l] = ins; changed(); } draw(); return; }
    if (li && el.dataset.k) { const ins = u.code[+li.dataset.l], k = el.dataset.k; ins[k] = (k === 'ms' || k === 'to') ? (+el.value || 0) : el.value; changed(); if (k === 'fn' || k === 'pin' || k === 'v' || k === 'g' || k === 'mode' || k === 'clear') redraw(); }
  };
  root.addEventListener('change', onEdit(false));
  root.addEventListener('input', onEdit(true));
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    // clicking a line makes it the place where the next new instruction goes (right after it)
    if (!b) { const li = e.target.closest('ol.lines li[data-l]'), un = li && li.closest('.unit[data-u]'); if (un) { at[+un.dataset.u] = +li.dataset.l + 1; mark(); } return; }
    if (b.dataset.act === 'fsmadd' || b.dataset.act === 'fsmdel') { // a transition row of the state machine table
      const un = b.closest('.unit'), ins = get().units[+un.dataset.u].code[+b.closest('li').dataset.l], rows = ins.rows = ins.rows || [];
      if (b.dataset.act === 'fsmdel') rows.splice(+b.closest('[data-r]').dataset.r, 1);
      else { const st = b.dataset.s, used = rows.filter(r => r.s === st).map(r => r.e), e = L.fsm.events.find(x => !used.includes(x)) || L.fsm.events[0]; let k = rows.length; for (let i = 0; i < rows.length; i++) if (rows[i].s === st) k = i + 1; rows.splice(k, 0, { s: st, e, a: '', n: st }); }   /* a new row starts as "stay": the player decides what it does */
      changed(); draw(); return; }
    if (b.dataset.act === 'fold') { const un = b.closest('.unit'), key = un.dataset.u === undefined ? '' : get().units[+un.dataset.u].name; if (!folded.delete(key)) folded.add(key); draw(); return; }
    // the cross on an xTaskCreate() line removes the whole task, so it asks once more (the same as "delete" on the task function)
    if (b.dataset.act === 'deltask') { if (b.dataset.arm) { get().units.splice(+b.closest('.ln').dataset.u, 1); at = {}; changed(); draw(); } else { b.dataset.arm = 1; b.textContent = 'delete task? click again'; setTimeout(() => { if (b.isConnected) { delete b.dataset.arm; b.textContent = '✕'; } }, 4000); } return; }
    if (b.dataset.act === 'addtask') { if (!addTask()) b.textContent = `${MAX_TASKS} tasks is all this board has room for`; return; }
    if (b.dataset.act === 'addobj') { const o = (L.startObjs ? L.startObjs() : {})[b.dataset.k]; if (o) { get().objs[b.dataset.k] = JSON.parse(JSON.stringify(o)); changed(); draw(); } return; }
    if (b.dataset.act === 'delobj') { const k = b.dataset.k, user = get().units.find(u => u.code.some(ins => Object.values(ins).includes(k))); if (user) { b.textContent = 'in use by ' + user.name; return; } if (b.dataset.arm) { delete get().objs[b.dataset.k]; changed(); draw(); } else { b.dataset.arm = 1; b.textContent = 'click again'; } return; }
    const P = get(), ui = +b.closest('.unit').dataset.u, u = P.units[ui], li = b.closest('li'), i = li ? +li.dataset.l : -1, a = b.dataset.act;
    if (a === 'del') { u.code.splice(i, 1); at[ui] = i; }   // a replacement for the deleted line lands in its place
    else if (a === 'up' && i > 0) { u.code.splice(i - 1, 0, u.code.splice(i, 1)[0]); at[ui] = i; }
    else if (a === 'down' && i < u.code.length - 1) { u.code.splice(i + 1, 0, u.code.splice(i, 1)[0]); at[ui] = i + 2; }
    else if (a === 'delunit') { if (b.dataset.arm) { P.units.splice(ui, 1); at = {}; } else { b.dataset.arm = 1; b.textContent = 'click again'; return; } }
    changed(); draw();
  });
  draw();
  // open the editor on the code this stage adds, not on firmware the player already wrote
  const MAX_TASKS = 14;
  /** add an empty task: its xTaskCreate() line appears in app_main() and its function at the end, which is scrolled into view */
  function addTask() {
    const P = get(); if (P.units.filter(u => u.kind === 'task').length >= MAX_TASKS) return false;
    let k = 1; while (P.units.some(u => u.name === 'task' + k)) k++;
    P.units.push(task('task' + k, 1, [])); changed(); draw(); root.lastElementChild.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return true;
  }
  const focusNew = () => { const t = root.querySelector('.unit[data-u] .newtag'); if (t) t.closest('.unit').scrollIntoView({ block: 'start' }); };
  setTimeout(focusNew, 0);
  return {
    draw, focusNew, fsmState,
    addTask,
    /** hide the code of every task function (the startup code stays open: it is the task list), or show everything again */
    foldAll(on) { folded.clear(); if (on) get().units.forEach(u => folded.add(u.name)); draw(); },
    allFolded: () => get().units.length > 0 && get().units.every(u => folded.has(u.name)),
  };
}
