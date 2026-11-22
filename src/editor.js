// Firmware editor. The code shown is ESP-IDF style C: app_main() creates the kernel objects and tasks,
// and each task / interrupt handler is a list of FreeRTOS calls the player assembles.
import { F, fnInfo, g, d, un, bz, c, tk, gv, gi, sn, rc, si, trs, tst, wt, ds, ng, ngi, nt, es, ew, wa, wr, task } from './kernel.js';

export const PALETTE = ['#5fe3ff', '#ff8ad8', '#ffb347', '#6dffa8', '#b39bff'];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const TOS = [[0, '0'], [10, 'pdMS_TO_TICKS(10)'], [50, 'pdMS_TO_TICKS(50)'], [100, 'pdMS_TO_TICKS(100)'], [300, 'pdMS_TO_TICKS(300)'], [-1, 'portMAX_DELAY']];
const OPN = { gpio: 'gpio_set_level(pin, level)', call: 'call a rover function', delay: 'vTaskDelay', until: 'vTaskDelayUntil', busy: 'esp_rom_delay_us (busy-wait)', send: 'xQueueSend', recv: 'xQueueReceive', take: 'xSemaphoreTake', give: 'xSemaphoreGive', giveISR: 'xSemaphoreGiveFromISR', sendISR: 'xQueueSendFromISR', tReset: 'xTimerReset', tStop: 'xTimerStop', wakeTimer: 'esp_sleep_enable_timer_wakeup', deepSleep: 'esp_deep_sleep_start', notifyGive: 'xTaskNotifyGive', notifyGiveISR: 'vTaskNotifyGiveFromISR', notifyTake: 'ulTaskNotifyTake', evSet: 'xEventGroupSetBits', evWait: 'xEventGroupWaitBits', wdtAdd: 'esp_task_wdt_add', wdtReset: 'esp_task_wdt_reset' };
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
      case 'call': return `${sel('fn', (L.fns.includes(ins.fn) || !F[ins.fn] ? L.fns : [ins.fn, ...L.fns]).map(f => [f, F[f].sig || f + '()']))}; <span class="cm">// ${fnInfo(F[ins.fn])}</span>`;
      case 'send': return `${fn('xQueueSend')}(${sel('q', qs)}, &amp;x, ${sel('to', TOS)});`;
      case 'recv': return `${fn('xQueueReceive')}(${sel('q', qs)}, &amp;x, ${sel('to', TOS)});`;
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
        <div class="ub"><div class="fr">${hoist ? open.replace(/\n  for \(;;\) \{$/, '') : open}</div><ol class="lines">${u.code.map((ins, li) => `<li data-l="${li}"><span class="tx">${line(ins, dis)}</span>${u.locked ? '' : '<button class="ib" data-act="up" aria-label="Move up">↑</button><button class="ib" data-act="down" aria-label="Move down">↓</button><button class="ib" data-act="del" aria-label="Delete line">✕</button>'}</li>${hoist && li === 0 ? '<li class="loopopen" aria-hidden="true">  for (;;) {</li>' : ''}`).join('')}</ol>
        ${u.locked ? '' : `<div class="addrow"><select data-add aria-label="Add an instruction"><option value="">+ add instruction…</option>${L.ops.map(o => `<option value="${o}">${OPN[o]}</option>`).join('')}</select></div>`}
        <div class="fr">${u.kind === 'task' ? '  }\n}' : '}'}</div></div></div>`;
    });
    root.innerHTML = h; mark();
  }

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
    if (el.dataset.add !== undefined) { if (el.value) { const ui = +uEl.dataset.u, pos = Math.min(at[ui] === undefined ? u.code.length : at[ui], u.code.length); const ins = defIns(el.value); if (!ins) return; u.code.splice(pos, 0, ins); at[ui] = pos + 1; changed(); draw(); } return; }
    if (el.dataset.uk) { const k = el.dataset.uk, was = u.name; u[k] = k === 'name' ? (el.value.replace(/[^A-Za-z0-9_]/g, '') || 'task') : +el.value || 0; if (k === 'name' && folded.delete(was)) folded.add(u.name); changed(); if (k === 'name') redraw(); return; }
    const li = el.closest('li');
    if (li && el.dataset.k) { const ins = u.code[+li.dataset.l], k = el.dataset.k; ins[k] = (k === 'ms' || k === 'to') ? (+el.value || 0) : el.value; changed(); if (k === 'fn' || k === 'pin' || k === 'v' || k === 'g' || k === 'mode' || k === 'clear') redraw(); }
  };
  root.addEventListener('change', onEdit(false));
  root.addEventListener('input', onEdit(true));
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    // clicking a line makes it the place where the next new instruction goes (right after it)
    if (!b) { const li = e.target.closest('ol.lines li[data-l]'), un = li && li.closest('.unit[data-u]'); if (un) { at[+un.dataset.u] = +li.dataset.l + 1; mark(); } return; }
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
    draw, focusNew,
    addTask,
    /** hide the code of every task function (the startup code stays open: it is the task list), or show everything again */
    foldAll(on) { folded.clear(); if (on) get().units.forEach(u => folded.add(u.name)); draw(); },
    allFolded: () => get().units.length > 0 && get().units.every(u => folded.has(u.name)),
  };
}
