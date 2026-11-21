// Field-manual building blocks: a small SVG diagram kit and the interactive theory widgets.
// A widget is a function (el) => void that fills a <div data-w="name"> placeholder.
import { runSim, task, c, d, g, bz, maxGap, S_ } from './kernel.js';
import { drawTimeline, describe } from './timeline.js';
import { PALETTE } from './editor.js';

/* ---------- diagram kit ---------- */
export const svg = (w, h, body, label) => `<svg class="dia" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}"><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="ahp"/></marker></defs>${body}</svg>`;
/** box with centred text; "|" starts a new line; cls: a (amber) c (cyan) g (green) r (red) d (dim); key makes it addressable */
export const box = (x, y, w, h, t, cls = '', key = '') => {
  const ls = t.split('|'), y0 = y + h / 2 - (ls.length - 1) * 7.5 + 4;
  return `<g ${key ? `data-k="${key}"` : ''}><rect class="bx ${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="5"/>` + ls.map((l, i) => `<text class="${i ? 'bs' : 'bt'}" x="${x + w / 2}" y="${y0 + i * 15}" text-anchor="middle">${l}</text>`).join('') + '</g>';
};
export const arrow = (x1, y1, x2, y2, t = '', dx = 0, dy = -6, anchor = 'middle') => `<line class="ar" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#ah)"/>` + (t ? `<text class="at" x="${(x1 + x2) / 2 + dx}" y="${(y1 + y2) / 2 + dy}" text-anchor="${anchor}">${t}</text>` : '');
export const note = (x, y, t, anchor = 'start') => `<text class="at" x="${x}" y="${y}" text-anchor="${anchor}">${t}</text>`;

/* ---------- one state vocabulary, shared with the timeline chart ----------
   Running = solid cyan, Ready = pale cyan, Blocked on time = dotted cyan outline, Blocked on a queue/mutex = red outline,
   idle = slate, interrupt = light grey. Orange (.cur) is only ever the current selection. Disabled = dashed border. */
const STATE_CSS = `
.dia .bx.run { fill: #5fe3ff; stroke: #5fe3ff; } .dia .bx.run ~ text { fill: #06121a; }
.dia [data-k].cur .bx.run ~ text { fill: #e8f2ff; }
.dia .bx.rdy { fill: rgba(95, 227, 255, .14); stroke: rgba(95, 227, 255, .7); }
.dia .bx.blk { fill: rgba(4, 7, 14, .4); stroke: #5fe3ff; stroke-width: 1.8; stroke-dasharray: 2 4; }
.dia .bx.blko { fill: rgba(255, 93, 77, .06); stroke: #ff5d4d; stroke-width: 1.8; }
.dia .bx.isr { fill: rgba(159, 176, 185, .22); stroke: #9fb0b9; }
.dia [data-k].cur .bx { stroke-dasharray: none; }
.dia .dash.blk { stroke: #5fe3ff; stroke-width: 1.8; stroke-dasharray: 2 4; } .dia .dash.n { stroke: #b9cbe0; } .dia .tick.n { stroke: #7f97b3; }
.wg .hb:disabled { opacity: 1; color: #a9bbd1; background: transparent; border: 1px dashed #8aa0ba; cursor: default; }
.whor.rdy { color: var(--ink); border: 1px solid rgba(95, 227, 255, .7); background: rgba(95, 227, 255, .12); }
.whor.run { background: #5fe3ff; border: 1px solid #5fe3ff; color: #06121a; }
.whor.run.idle { background: #5d738c; border-color: #5d738c; color: #fff; } .whor.run.isr { background: #9fb0b9; border-color: #9fb0b9; color: #06121a; }
.whor:not(.rdy):not(.run) { color: #a9bbd1; border: 1px dotted var(--cyan); }
.whor[aria-disabled="true"] { cursor: default; }`;
if (typeof document !== 'undefined' && !document.getElementById('state-vocab')) { const st = document.createElement('style'); st.id = 'state-vocab'; st.textContent = STATE_CSS; document.head.appendChild(st); }
/** key row for the state colours; the swatch sits in its own <g> so the text keeps its normal colour */
export const stateKey = (x, y) => [['run', 'Running', 0], ['rdy', 'Ready', 92], ['blk', 'Blocked, time', 172], ['blko', 'Blocked, queue or mutex', 290]]
  .map(([k, t, dx]) => `<g><rect class="bx ${k}" x="${x + dx}" y="${y - 10}" width="22" height="12" rx="2"/></g>` + note(x + dx + 28, y, t)).join('');

/* ---------- one task colour table, the same one the game's chart uses (editor PALETTE, by task order in the stage-2 firmware) ----------
   beacon, heart, motor, camera, telemetry. Diagrams use class "t-<name>" on a box or bar; the labs recolour their chart rows with taskColours(K). */
export const TASK_NAMES = ['beacon', 'heart', 'motor', 'camera', 'telemetry'];
export const TASK_COL = Object.fromEntries(TASK_NAMES.map((n, i) => [n, PALETTE[i]]));
/** recolour a finished simulation's rows by task name so a lab chart matches the game chart; unknown names keep their own colour */
export const taskColours = K => { K.units.forEach(u => { const i = TASK_NAMES.indexOf(u.name); if (i >= 0) u.i = i; }); return K; };
if (typeof document !== 'undefined' && !document.getElementById('task-vocab')) {
  const st = document.createElement('style'); st.id = 'task-vocab';
  st.textContent = TASK_NAMES.map(n => `.dia .bx.t-${n} { stroke: ${TASK_COL[n]}; fill: ${TASK_COL[n]}; fill-opacity: .85; }`).join(' ');
  document.head.appendChild(st);
}

const manualOpen = () => { const m = document.querySelector('#manual'); return m && !m.hidden; };
/** run fn on an interval, but only while the manual is on screen */
const live = (fn, ms) => setInterval(() => { if (manualOpen()) fn(); }, ms);
const frame = (title, body) => `<div class="wg"><div class="wgh">INTERACTIVE · ${title}</div>${body}</div>`;

/* ---------- 1. boot sequence player ---------- */
function boot(el) {
  const steps = [
    ['rom', 'ROM bootloader. Code in the chip\'s mask ROM checks the boot-mode pins and loads the second-stage bootloader from flash (offset 0x1000 on the ESP32, 0x0 on the S3 and C3).'],
    ['bl2', 'Second-stage bootloader. Reads the partition table, chooses the app partition (factory or an OTA slot) and loads your application image into memory.'],
    ['start', 'Application startup. Sets up the heap, the clocks, the flash cache and the second core. There is still no RTOS at this point.'],
    ['sched', 'The startup code creates the system tasks (IDLE0, IDLE1, esp_timer, ipc) and starts the FreeRTOS scheduler on each core.'],
    ['main', 'The main task is scheduled for the first time. It has priority 1 and a 3584-byte stack.'],
    ['app', 'The main task calls app_main(): your code. It configures the pins and calls xTaskCreate() for the beacon and heart tasks.'],
    ['tasks', 'app_main() returns and the main task is deleted. From now on the scheduler switches between your tasks and the idle tasks, forever.'],
  ];
  const names = [['rom', 'ROM|bootloader', ''], ['bl2', '2nd stage|bootloader', ''], ['start', 'App startup|heap, clocks', ''], ['sched', 'FreeRTOS|scheduler starts', ''], ['main', 'main task|priority 1', ''], ['app', 'app_main()|your code', '']];
  el.innerHTML = frame('BOOT SEQUENCE', svg(720, 200, names.map(([k, t, cls], i) => box(4 + i * 120, 16, 108, 52, t, cls, k) + (i < 5 ? arrow(112 + i * 120, 42, 122 + i * 120, 42) : '')).join('')
    + arrow(418, 68, 418, 126) + box(330, 128, 176, 60, 'System tasks|IDLE0, IDLE1 (priority 0)|esp_timer, ipc0, ipc1', 'd', 'sched2')
    + arrow(650, 68, 590, 126) + arrow(662, 68, 678, 126) + `<g data-k="tasks">${box(528, 128, 88, 60, 'beacon|task', 'rdy')}${box(626, 128, 88, 60, 'heart|task', 'rdy')}</g>`
    + note(4, 100, 'power on / reset') + note(520, 110, 'xTaskCreate()', 'end'), 'Boot flow from reset to app_main')
    + `<p class="wgcap" data-cap>Press play to follow the chip from reset to your tasks.</p><div class="wgrow"><button class="hb" data-play>▶ PLAY BOOT</button><button class="hb" data-step>STEP</button></div>`);
  let i = -1, timer = 0;
  const show = () => {
    el.querySelectorAll('[data-k]').forEach(g => g.classList.toggle('cur', i >= 0 && (g.dataset.k === steps[i][0] || (steps[i][0] === 'sched' && g.dataset.k === 'sched2'))));
    el.querySelector('[data-cap]').textContent = i < 0 ? '' : `${i + 1}/${steps.length}  ${steps[i][1]}`;
  };
  const next = () => { i = (i + 1) % steps.length; show(); };
  el.querySelector('[data-step]').onclick = () => { clearInterval(timer); next(); };
  el.querySelector('[data-play]').onclick = () => { clearInterval(timer); i = -1; next(); timer = setInterval(() => { if (i >= steps.length - 1) clearInterval(timer); else next(); }, 2600); };
}

/* ---------- 2. super loop vs tasks, running side by side ---------- */
function loopvs(el) {
  const side = (id, title) => `<div class="lv" data-s="${id}"><b>${title}</b><div class="lvleds"><span><i class="lvled a" data-l="b"></i>BEACON <em data-p="b"></em></span><span><i class="lvled g" data-l="h"></i>HEART <em data-p="h"></em></span></div><div class="lvcpu"><span>CPU</span><div class="gbar"><i data-c></i></div><em data-ct></em></div><div class="lvnow" data-now></div></div>`;
  el.innerHTML = frame('THE SAME TWO LEDS, TWO WAYS', `<div class="lvgrid">${side('loop', 'SUPER LOOP')}${side('rtos', 'TWO TASKS')}</div><p class="wgcap">Both sides run the same clock. Watch the rhythm of the LEDs and the CPU meter.</p>`);
  let t = 0;
  const set = (s, b, h, cpu, pb, ph, now) => { const r = el.querySelector(`[data-s="${s}"]`); r.querySelector('[data-l="b"]').classList.toggle('on', b); r.querySelector('[data-l="h"]').classList.toggle('on', h);
    r.querySelector('[data-c]').style.width = cpu + '%'; r.querySelector('[data-c]').classList.toggle('hot', cpu > 90); r.querySelector('[data-ct]').textContent = cpu + '%';
    r.querySelector('[data-p="b"]').textContent = pb; r.querySelector('[data-p="h"]').textContent = ph; r.querySelector('[data-now]').textContent = now; };
  live(() => {
    t += 25; const ph = t % 700;
    set('loop', Math.floor(t / 700) % 2 === 0, Math.floor((t + 200) / 700) % 2 === 1, 100, 'every 700 ms', 'every 700 ms', ph < 500 ? 'spinning in esp_rom_delay_us(500000)' : 'spinning in esp_rom_delay_us(200000)');
    set('rtos', Math.floor(t / 500) % 2 === 0, Math.floor(t / 200) % 2 === 0, 0, 'every 500 ms', 'every 200 ms', 'both tasks Blocked, idle task running');
  }, 50);
}

/* ---------- 3. heap: what xTaskCreate allocates ---------- */
function heap(el) {
  const HEAP = 16384, TCB = 352, COL = ['#5fe3ff', '#ff8ad8', '#9ec1ff', '#6dffa8', '#b39bff'];
  let tasks = [];
  el.innerHTML = frame('CREATE TASKS UNTIL THE HEAP RUNS OUT', `<div class="wgrow"><label>stack (bytes) <input type="number" data-st value="4096" min="768" max="16384" step="256"></label><label>priority <input type="number" data-pr value="1" min="0" max="24"></label><button class="hb hot" data-mk>xTaskCreate()</button><button class="hb" data-rs>RESET</button></div>
    <div class="heapbar" data-bar></div><p class="wgcap" data-cap></p><div class="rl" data-rl></div>`);
  const draw = msg => {
    const used = tasks.reduce((a, t) => a + TCB + t.stack, 0);
    el.querySelector('[data-bar]').innerHTML = tasks.map((t, i) => `<i style="width:${TCB / HEAP * 100}%;background:${COL[i % 5]};opacity:.55" title="TCB"></i><i style="width:${t.stack / HEAP * 100}%;background:${COL[i % 5]}" title="stack of task${i + 1}"><b>task${i + 1} stack ${t.stack}</b></i>`).join('') + `<i class="free" style="flex:1"><b>free ${HEAP - used} B</b></i>`;
    el.querySelector('[data-cap]').innerHTML = msg || `A 16 KB heap for the demo. Each task costs its stack plus about ${TCB} bytes of TCB (the pale slice).`;
    const pr = [...new Set(tasks.map(t => t.prio))].sort((a, b) => b - a);
    el.querySelector('[data-rl]').innerHTML = pr.length ? '<span class="cm">ready lists:</span> ' + pr.map(p => `<span class="rlp">priority ${p}: ${tasks.map((t, i) => t.prio === p ? `<b style="color:${COL[i % 5]}">task${i + 1}</b>` : '').filter(Boolean).join(' → ')}</span>`).join('') : '';
  };
  el.querySelector('[data-mk]').onclick = () => {
    const stack = Math.max(768, +el.querySelector('[data-st]').value || 768), prio = Math.min(24, Math.max(0, +el.querySelector('[data-pr]').value || 0)), used = tasks.reduce((a, t) => a + TCB + t.stack, 0);
    if (used + TCB + stack > HEAP) return draw(`<span class="bad">xTaskCreate() returned errCOULD_NOT_ALLOCATE_REQUIRED_MEMORY.</span> ${HEAP - used} bytes are free, but this task needs ${TCB + stack}. No task was created, and code that ignores the return value never finds out.`);
    tasks.push({ stack, prio }); draw(`<span class="good">pdPASS.</span> task${tasks.length} is linked into the ready list for priority ${prio}.`);
  };
  el.querySelector('[data-rs]').onclick = () => { tasks = []; draw(); };
  draw();
}

/* ---------- 4. task state machine you can drive ---------- */
function states(el) {
  const acts = [
    ['Scheduler picks the task', 'Ready', 'Running', 'It is the highest-priority Ready task, so the kernel restores its registers from its own stack and it continues exactly where it stopped.'],
    ['Task calls vTaskDelay(500)', 'Running', 'Blocked', 'The kernel moves it to the delayed list with wake-up tick = now + 500 and switches to another task. It now costs zero CPU.'],
    ['Task waits on an empty queue', 'Running', 'Blocked', 'xQueueReceive() with a timeout parks it on the queue\'s waiting list until data arrives or the timeout runs out.'],
    ['Tick: the delay has expired', 'Blocked', 'Ready', 'The tick interrupt sees that its wake-up time has come and moves it back to the ready list. It still has to wait for the scheduler to pick it.'],
    ['A higher-priority task wakes up', 'Running', 'Ready', 'Preemption. Its registers are saved on its stack in the middle of whatever it was doing. It did nothing wrong, and will carry on later.'],
    ['Someone calls vTaskSuspend()', '*', 'Suspended', 'The task is taken out of scheduling completely. No timeout will bring it back.'],
    ['Someone calls vTaskResume()', 'Suspended', 'Ready', 'Back on the ready list, competing for the CPU again.'],
  ];
  let cur = 'Ready'; const seen = new Set(['Ready']);
  el.innerHTML = frame('DRIVE ONE TASK THROUGH ITS STATES', svg(720, 280,
    box(300, 8, 130, 44, 'Suspended', 'd', 'Suspended') + box(110, 100, 150, 52, 'Ready|could run, waits for CPU', 'rdy', 'Ready') + box(470, 100, 150, 52, 'Running|owns a core now', 'run', 'Running') + box(290, 192, 150, 52, 'Blocked|waits for time or event', 'blk', 'Blocked')
    + arrow(260, 114, 468, 114) + arrow(470, 138, 262, 138) + arrow(545, 152, 442, 210) + arrow(290, 210, 186, 154) + arrow(430, 30, 520, 98) + arrow(190, 98, 298, 32) + stateKey(20, 270), 'Task state machine')
    + `<div class="wgbtns" data-b></div><p class="wgcap" data-cap>The task was just created, so it is Ready. Choose what happens next.</p><p class="wgcap" data-prog></p>`);
  const draw = why => {
    el.querySelectorAll('[data-k]').forEach(g => g.classList.toggle('cur', g.dataset.k === cur));
    el.querySelector('[data-b]').innerHTML = acts.map((a, i) => `<button class="hb" data-i="${i}" ${a[1] === cur || (a[1] === '*' && cur !== 'Suspended') ? '' : 'disabled'}>${a[0]}</button>`).join('');
    if (why) el.querySelector('[data-cap]').textContent = `${cur}. ${why}`;
    el.querySelector('[data-prog]').innerHTML = seen.size === 4 ? '<span class="good">All four states visited.</span>' : `States visited: ${seen.size} of 4.`;
  };
  el.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; const a = acts[+b.dataset.i]; cur = a[2]; seen.add(cur); draw(a[3]); });
  draw();
}

/* ---------- 5. tick rounding calculator ---------- */
function ticks(el) {
  el.innerHTML = frame('HOW LONG DOES vTaskDelay(pdMS_TO_TICKS(ms)) REALLY BLOCK?', `<div class="wgrow"><label>CONFIG_FREERTOS_HZ <select data-hz><option value="100">100 (ESP-IDF default)</option><option value="1000">1000</option></select></label><label>ms <input type="range" data-ms min="1" max="60" value="5"> <b data-msv></b></label></div><div data-out></div>`);
  const draw = () => {
    const hz = +el.querySelector('[data-hz]').value, ms = +el.querySelector('[data-ms]').value, tick = 1000 / hz, n = Math.floor(ms * hz / 1000);
    el.querySelector('[data-msv]').textContent = ms + ' ms';
    const span = Math.max(ms * 1.6, tick * 4), X = v => 20 + v / span * 680; let s = '';
    for (let v = 0; v <= span; v += tick) s += `<line class="tick n" x1="${X(v)}" y1="34" x2="${X(v)}" y2="${hz === 100 ? 62 : 52}"/>`;
    s += `<line class="ar" x1="20" y1="48" x2="704" y2="48"/>` + note(20, 84, '0') + note(X(ms), 20, `asked for ${ms} ms`, 'middle') + `<line class="dash n" x1="${X(ms)}" y1="24" x2="${X(ms)}" y2="70"/>`;
    if (n > 0) s += `<rect class="bx blk" x="${X((n - 1) * tick)}" y="40" width="${X(n * tick) - X((n - 1) * tick)}" height="16" rx="2"/>` + note(X((n - 0.5) * tick), 84, 'wakes somewhere here', 'middle');
    el.querySelector('[data-out]').innerHTML = svg(720, 92, s, 'Tick grid and the real delay')
      + `<p class="wgcap"><code>pdMS_TO_TICKS(${ms})</code> = ${ms} × ${hz} / 1000 = <b>${n} tick${n === 1 ? '' : 's'}</b> of ${tick} ms. `
      + (n === 0 ? `<span class="bad">Zero ticks: vTaskDelay(0) does not block at all, it only yields to tasks of equal priority. A loop built on this spins and trips the watchdog.</span>`
        : `The task blocks for between <b>${(n - 1) * tick}</b> and <b>${n * tick} ms</b>, depending on how close the next tick was when it called.` + (n * tick !== ms ? ` <span class="bad">You asked for ${ms} ms and can get as little as ${(n - 1) * tick}.</span>` : '')) + '</p>';
  };
  el.addEventListener('input', draw); draw();
}

/* ---------- 6. who gets the CPU? ---------- */
function whoruns(el) {
  const rows = [['isr', 'Interrupt (ISR)', 99, 'r'], ['hi', 'sensor task · priority 5', 5, ''], ['b', 'beacon · priority 1', 1, 'g'], ['h', 'heart · priority 1', 1, 'g'], ['idle', 'idle task · priority 0', 0, 'd']];
  const ready = { isr: false, hi: false, b: true, h: false, idle: true }; let flip = 0;
  el.innerHTML = frame('WHO GETS THE CPU?', `<p class="wgcap">Click a row to make it Ready or Blocked. The scheduler always runs the highest Ready row.</p><div class="who" data-rows></div><p class="wgcap" data-cap></p>`);
  const draw = () => {
    const top = Math.max(...rows.filter(r => ready[r[0]]).map(r => r[2])), run = rows.filter(r => ready[r[0]] && r[2] === top), cur = run[flip % run.length][0];
    el.querySelector('[data-rows]').innerHTML = rows.map(r => `<button class="whor ${ready[r[0]] ? 'rdy' : ''} ${r[0] === cur ? 'run' : ''} ${r[0]}" data-r="${r[0]}" ${r[0] === 'idle' ? 'aria-disabled="true" title="The idle task is always Ready and cannot be blocked"' : ''}><span>${r[1]}</span><b>${r[0] === cur ? 'RUNNING' : ready[r[0]] ? 'READY' : 'BLOCKED'}</b></button>`).join('');
    el.querySelector('[data-cap]').textContent = cur === 'idle' ? 'Everything else is Blocked, so the idle task runs and feeds the watchdog. This is the healthy resting state.'
      : run.length > 1 ? 'Two Ready tasks share the top priority: round-robin, they swap every tick. The idle task gets nothing while this lasts.'
        : cur === 'isr' ? 'An interrupt beats every task, whatever its priority. Tasks only run when no ISR is active.' : `Only the highest-priority Ready task runs. Everything below it waits${ready.idle && cur !== 'idle' ? ', including the idle task. If this lasts 5 seconds, task_wdt fires' : ''}.`;
  };
  el.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (!b || b.dataset.r === 'idle') return; ready[b.dataset.r] = !ready[b.dataset.r]; draw(); });
  live(() => { flip++; if (ready.b && ready.h && !ready.hi && !ready.isr) draw(); }, 600); draw();
}

/* ---------- 7. scheduling lab: change priorities, watch the real kernel ---------- */
function schedlab(el) {
  const defs = [['motor', 'motorStep', 8, '2 ms of work every 10 ms'], ['telemetry', 'sendTelemetry', 38, '12 ms of work every 50 ms'], ['camera', 'compressFrame', 100, '60 ms of work every 160 ms']];
  const prio = [1, 1, 1];
  el.innerHTML = frame('SCHEDULING LAB: THE GAME\'S OWN KERNEL, LIVE', `<div class="wgrow">${defs.map((t, i) => `<label>${t[0]} <span class="cm">(${t[3]})</span> <select data-p="${i}">${[1, 2, 3].map(p => `<option value="${p}">priority ${p}</option>`).join('')}</select></label>`).join('')}</div>
    <div class="tl"><div class="tll" data-ll></div><div class="tlw"><div class="tli"><canvas data-cv></canvas></div></div></div><p class="wgcap" data-cap></p>`);
  const Ld = { T: 400, cores: 1, pins: [], irqs: {} };
  const draw = () => {
    const K = runSim(Ld, { objs: {}, units: defs.map((t, i) => task(t[0], prio[i], [c(t[1]), d(t[2])])) });
    taskColours(K); drawTimeline(el.querySelector('[data-cv]'), el.querySelector('[data-ll]'), K, Ld, 1);
    const g = maxGap(S_(K, 'motorStep')), tg = maxGap(S_(K, 'sendTelemetry'));
    el.querySelector('[data-cap]').innerHTML = `Longest gap between motor steps: <b class="${g <= 11 ? 'good' : 'bad'}">${g} ms</b> (limit 11). Between telemetry packets: <b class="${tg <= 55 ? 'good' : 'bad'}">${tg} ms</b> (limit 55). `
      + (new Set(prio).size === 1 ? 'All equal: round-robin. Look how the 2 ms motor step is smeared across several milliseconds while the others are busy.' : prio[0] > prio[1] && prio[1] > prio[2] ? 'Shortest period highest: every deadline is met and the camera takes whatever is left.' : 'Faded bars are a task that is Ready but kept off the CPU by a higher or equal priority.');
  };
  el.addEventListener('change', e => { if (e.target.dataset.p !== undefined) { prio[+e.target.dataset.p] = +e.target.value; draw(); } });
  setTimeout(draw, 0);
  const ro = new ResizeObserver(() => { if (el.querySelector('.tlw').clientWidth) draw(); }); ro.observe(el);
}

/* ---------- 8. drift labs: delay vs delay-until, jitter, overrun (pure arithmetic, no randomness) ---------- */
/** start times (ms) of a sampling loop over T ms. mode 'delay' = vTaskDelay(P), 'until' = vTaskDelayUntil(&last, P). */
function laps(mode, P, work, lat, T = 3000) {
  const st = []; let s = 0, mark = 0;
  for (let k = 0; s < T && k < 4000; k++) {
    st.push(s); const e = s + work(k);
    let wake; if (mode === 'delay') wake = e + P; else { mark += P; wake = Math.max(mark, e); }
    s = wake + lat(k);
  }
  return st;
}
const LAT = [0, 1, .4, .8, .2];
const lapChart = (st, P, work, span = 300) => {
  const X = v => 20 + v / span * 680; let s = '';
  for (let k = 0; k * P <= span; k++) s += `<line class="tick" x1="${X(k * P)}" y1="22" x2="${X(k * P)}" y2="60"/>`;
  st.forEach(t => { if (t <= span) s += `<rect class="bx ${work >= P ? 'r' : 'c'}" x="${X(t)}" y="34" width="${Math.max(2, X(t + work) - X(t))}" height="16" rx="2"/>`; });
  s += note(20, 14, `amber ticks: where sample k should start (k × ${P} ms). Blue bars: when it really runs.`) + note(20, 78, '0 ms') + note(704, 78, span + ' ms', 'end');
  return svg(720, 86, s, 'Planned sample times against real sample times');
};
const lapStats = (st, P) => {
  const n = st.length, drift = Math.max(...st.map((t, k) => Math.abs(t - k * P))), last = st[n - 1] - (n - 1) * P;
  return { n, drift, last };
};
function driftlab(el) {
  el.innerHTML = frame('DELAY OR DELAY-UNTIL? 3 SECONDS OF A 50 Hz SAMPLER', `<div class="wgrow"><label>work per sample <input type="range" data-work min="1" max="15" value="5"> <b data-wv></b></label><label>loop ends with <select data-m><option value="delay">vTaskDelay(pdMS_TO_TICKS(20))</option><option value="until">vTaskDelayUntil(&amp;last, pdMS_TO_TICKS(20))</option></select></label></div><div data-out></div>`);
  const draw = () => {
    const w = +el.querySelector('[data-work]').value, m = el.querySelector('[data-m]').value;
    el.querySelector('[data-wv]').textContent = w + ' ms';
    const st = laps(m, 20, () => w, () => 0), r = lapStats(st, 20);
    el.querySelector('[data-out]').innerHTML = lapChart(st, 20, w)
      + `<p class="wgcap">Period: <b>${m === 'delay' ? 20 + w : 20} ms</b>. Samples in 3 s: <b class="${r.n >= 145 && r.n <= 155 ? 'good' : 'bad'}">${r.n}</b> of 150. Sample ${r.n - 1} starts <b class="${r.last <= 25 ? 'good' : 'bad'}">${r.last} ms</b> after its slot. `
      + (m === 'delay' ? `Every lap adds ${w} ms to the lateness. This model has no other tasks, so the real game is a little worse (91 samples at 3 to 7 ms of work).` : 'The delay shrinks by exactly the time the work took, so the lateness never grows.') + '</p>';
  };
  el.addEventListener('input', draw); el.addEventListener('change', draw); draw();
}
function jitterlab(el) {
  el.innerHTML = frame('JITTER IS NOT DRIFT: LATE WAKE-UPS FROM HIGHER-PRIORITY WORK', `<div class="wgrow"><label>wake-up delayed by up to <input type="range" data-j min="0" max="15" value="8"> <b data-jv></b></label><label>loop ends with <select data-m><option value="until">vTaskDelayUntil</option><option value="delay">vTaskDelay</option></select></label></div><div data-out></div>`);
  const draw = () => {
    const J = +el.querySelector('[data-j]').value, m = el.querySelector('[data-m]').value;
    el.querySelector('[data-jv]').textContent = J + ' ms';
    const st = laps(m, 20, () => 5, k => Math.round(LAT[k % 5] * J)), r = lapStats(st, 20);
    el.querySelector('[data-out]').innerHTML = lapChart(st, 20, 5)
      + `<p class="wgcap">Samples in 3 s: <b>${r.n}</b>. Worst distance from its slot: <b class="${r.drift <= 25 ? 'good' : 'bad'}">${r.drift} ms</b>. `
      + (m === 'until' ? 'With vTaskDelayUntil a late wake-up only moves that one sample. The next wake time is computed from the mark, not from the late start, so the error does not carry over.' : 'With vTaskDelay every late wake-up and every millisecond of work is added to all later samples. The jitter has become drift.') + '</p>';
  };
  el.addEventListener('input', draw); el.addEventListener('change', draw); draw();
}
function limitlab(el) {
  el.innerHTML = frame('WHEN THE WORK DOES NOT FIT IN THE PERIOD (vTaskDelayUntil)', `<div class="wgrow"><label>period <input type="range" data-p min="5" max="40" value="20"> <b data-pv></b></label><label>work per sample <input type="range" data-work min="1" max="40" value="12"> <b data-wv></b></label></div><div data-out></div>`);
  const draw = () => {
    const P = +el.querySelector('[data-p]').value, w = +el.querySelector('[data-work]').value;
    el.querySelector('[data-pv]').textContent = P + ' ms'; el.querySelector('[data-wv]').textContent = w + ' ms';
    const st = laps('until', P, () => w, () => 0), cpu = Math.min(100, Math.round(w / P * 100)), over = w >= P;
    el.querySelector('[data-out]').innerHTML = lapChart(st, P, w, 300)
      + `<p class="wgcap">Load of this task: <b class="${over ? 'bad' : cpu > 70 ? '' : 'good'}">${cpu}%</b>. Samples in 3 s: <b>${st.length}</b> (wanted ${Math.floor(3000 / P)}). `
      + (over ? '<span class="bad">The work takes as long as the period or longer. vTaskDelayUntil finds the wake time already passed, returns at once (xTaskDelayUntil returns pdFALSE) and the task never blocks. The idle task starves and task_wdt fires after 5 s.</span>' : `The task blocks ${P - w} ms of every ${P} ms and the idle task gets the rest.`) + '</p>';
  };
  el.addEventListener('input', draw); draw();
}

/* ---------- 9. sleep lab: light sleep against deep sleep for one report cycle (pure arithmetic, no randomness) ---------- */
// Model of stage 101: every report pays the same Wi-Fi connect and send (23750 mA*ms over 152 ms). What differs is how the rest of the interval is spent.
function sleeplab(el) {
  const A = 23750, ACT = 152;
  const wait = (I, B) => ({ idle: 25 * (I - ACT), light: 0.8 * (I - ACT), deep: B * 40 + 0.01 * (I - ACT - B) });
  const cross = B => (B * 40 - 0.01 * (ACT + B) + 0.8 * ACT) / 0.79;
  el.innerHTML = frame('LIGHT OR DEEP SLEEP? ONE REPORT CYCLE, WI-FI STOPPED BEFORE SLEEPING', `<div class="wgrow"><label>report interval <input type="range" data-i min="500" max="60000" step="500" value="10000"> <b data-iv></b></label><label>boot time at 40 mA <input type="range" data-b min="10" max="300" step="10" value="30"> <b data-bv></b></label></div><div data-out></div>`);
  const draw = () => {
    const I = +el.querySelector('[data-i]').value, B = +el.querySelector('[data-b]').value, x = cross(B);
    el.querySelector('[data-iv]').textContent = (I / 1000).toFixed(1) + ' s'; el.querySelector('[data-bv]').textContent = B + ' ms';
    const xmax = Math.max(4000, Math.ceil(x * 1.5 / 1000) * 1000), ymax = Math.max(wait(xmax, B).light, wait(xmax, B).deep) * 1.1 / 1000;
    const X = v => 50 + v / xmax * 650, Y = v => 150 - v / ymax * 120;
    let s = `<line class="ar" x1="50" y1="150" x2="706" y2="150"/><line class="ar" x1="50" y1="150" x2="50" y2="18"/>`;
    for (let v = 0; v <= xmax; v += xmax / 4) s += note(X(v), 166, (v / 1000) + ' s', 'middle');
    const line = (key, col) => `<polyline fill="none" stroke="${col}" stroke-width="2.5" points="${[0, xmax].map(v => X(v) + ',' + Y(wait(Math.max(v, ACT + B), B)[key] / 1000)).join(' ')}"/>`;
    s += line('light', '#ffb347') + line('deep', '#5fe3ff');
    s += `<line class="dash" x1="${X(x)}" y1="${Y(0)}" x2="${X(x)}" y2="22"/>` + note(X(x) + 6, 30, 'break-even ' + (x / 1000).toFixed(2) + ' s');
    if (I <= xmax) s += `<line class="dash" x1="${X(I)}" y1="${Y(0)}" x2="${X(I)}" y2="60"/>` + note(X(I) + 6, 72, 'your interval');
    s += note(54, 14, 'cost of waiting per cycle, mA·s (the Wi-Fi part is the same in both modes and left out)') + note(690, Y(wait(xmax, B).light / 1000) + 14, 'light sleep', 'end') + note(690, Y(wait(xmax, B).deep / 1000) - 8, 'deep sleep', 'end');
    const w = wait(I, B), av = k => (A + w[k]) / I, days = k => 2000 / av(k) / 24;
    const best = av('light') < av('deep') ? 'light' : 'deep';
    el.querySelector('[data-out]').innerHTML = svg(720, 176, s, 'Waiting cost of light sleep and deep sleep against the report interval')
      + `<p class="wgcap">At ${(I / 1000).toFixed(1)} s: no sleep (idle, 25 mA) <b>${av('idle').toFixed(2)} mA</b>, light sleep <b class="${best === 'light' ? 'good' : ''}">${av('light').toFixed(2)} mA</b>, deep sleep <b class="${best === 'deep' ? 'good' : ''}">${av('deep').toFixed(2)} mA</b>. `
      + `A 2000 mAh pack lasts about ${days('idle').toFixed(0)}, ${days('light').toFixed(0)} and ${days('deep').toFixed(0)} days. <b>${best === 'deep' ? 'Deep' : 'Light'} sleep wins here.</b> `
      + `Deep sleep pays ${(B * 40 / 1000).toFixed(2)} mA·s for the boot; light sleep pays 0.8 mA for every second of the interval. Below ${(x / 1000).toFixed(2)} s the boot costs more than it saves.</p>`;
  };
  el.addEventListener('input', draw); draw();
}

/* ---------- 10. stage 4 labs: stack sizing against the peak and the RAM budget, and a heap leak (pure arithmetic, no randomness) ---------- */
// Numbers measured in the game: nav needs 768 + 2400 = 3168 B at its peak, mapper 768 + 600 = 1368 B. The rest of the firmware (other stacks, kernel objects) takes 8256 B.
function stacklab(el) {
  const T = [['nav', 3168, 3328, 'planPath() needs 2400 B of locals'], ['mapper', 1368, 1536, 'processFrame() needs 600 B of locals']], REST = 8256, LIM = 14500, STAR = 13024, REST_SPARE = 148, MAXS = 4608; // the Lean star does not count up to 256 B of spare stack per task
  el.innerHTML = frame('SIZE THE STACKS: PEAK, MARGIN, BUDGET', `<div class="wgrow">${T.map((t, i) => `<label>${t[0]} stack <input type="range" data-s="${i}" min="1024" max="${MAXS}" step="32" value="4096"> <b data-sv="${i}"></b></label>`).join('')}</div><div data-out></div>`);
  const draw = () => {
    const st = T.map((t, i) => +el.querySelector(`[data-s="${i}"]`).value);
    let rows = '', ram = REST, lean = REST - REST_SPARE, crash = null, thin = false;
    T.forEach((t, i) => {
      const [name, peak, , why] = t, size = st[i], free = size - peak; ram += size; lean += size - Math.max(0, Math.min(free, 256));
      el.querySelector(`[data-sv="${i}"]`).textContent = size + ' B';
      const W = v => (Math.min(v, MAXS) / MAXS * 100).toFixed(2) + '%';
      const over = free < 0, marg = free >= 0 && free < 128;
      if (over && !crash) crash = name; if (marg) thin = true;
      rows += `<div style="margin:6px 0"><div style="font:600 .72rem var(--display);letter-spacing:.06em;color:var(--dim)">${name.toUpperCase()}: ${why}. Peak use ${peak} B.</div>`
        + `<div style="display:flex;height:20px;background:rgba(255,255,255,.08);position:relative"><i style="width:${W(Math.min(size, peak))};background:#5fe3ff"></i>`
        + (free > 0 ? `<i style="width:${W(free)};background:${marg ? '#ffb347' : 'rgba(95,227,255,.25)'}"></i>` : '')
        + (over ? `<i style="width:${W(peak - size)};background:#ff5d4d"></i>` : '') + '</div>'
        + `<div class="wgcap" style="margin:2px 0">${over ? `<span class="bad">Overflow: the task needs ${-free} B more than it has. It crashes the first time it reaches its deepest call.</span>` : `Unused at the peak (the high-water mark): <b class="${marg ? 'bad' : 'good'}">${free} B</b>${marg ? ' (under 128 B: no safety margin)' : ''}`}</div></div>`;
    });
    const ok = ram <= LIM;
    el.querySelector('[data-out]').innerHTML = rows
      + `<p class="wgcap">RAM for stacks and kernel objects: <b class="${ok ? 'good' : 'bad'}">${ram} B</b> of ${LIM} B allowed (Lean star: ${lean} B counted, limit ${STAR} B, because up to 256 B of spare stack per task is free: ${lean <= STAR ? '<span class="good">earned</span>' : '<span class="bad">missed</span>'}). `
      + (crash ? `<span class="bad">${crash} would overflow.</span> ` : thin ? 'Fits, but a margin under 128 B is one extra local variable from an overflow. ' : ram > LIM ? 'Everything runs, but the board does not have this much RAM. Read the peak and cut. ' : 'Peak plus margin, inside the budget. ') + '</p>';
  };
  el.addEventListener('input', draw); draw();
}
function leaklab(el) {
  const HEAP = 8192;
  el.innerHTML = frame('A BUFFER ALLOCATED EVERY LAP: WHEN DOES THE HEAP RUN OUT?', `<div class="wgrow"><label>lap period <input type="range" data-p min="100" max="500" step="25" value="300"> <b data-pv></b></label><label>frame buffer <select data-f><option value="1024">1024 B</option><option value="2048" selected>2048 B</option><option value="4096">4096 B</option></select></label><label>loop frees <select data-m><option value="never">never (the leak)</option><option value="half">every second lap</option><option value="all">every lap</option></select></label></div><div data-out></div>`);
  const draw = () => {
    const P = +el.querySelector('[data-p]').value, F = +el.querySelector('[data-f]').value, m = el.querySelector('[data-m]').value;
    el.querySelector('[data-pv]').textContent = P + ' ms';
    let free = HEAP, low = HEAP, fail = 0; const hist = [HEAP];
    for (let k = 1; k <= 40; k++) {
      if (free < F) { fail = k; break; }
      free -= F; low = Math.min(low, free);
      if (m === 'all' || (m === 'half' && k % 2 === 0)) free += F;
      hist.push(free);
    }
    const n = hist.length, X = i => 50 + i / Math.max(n - 1, 1) * 640, Y = v => 130 - v / HEAP * 110;
    let s = `<line class="ar" x1="50" y1="130" x2="706" y2="130"/><line class="ar" x1="50" y1="130" x2="50" y2="14"/>` + note(46, 24, '8192', 'end') + note(46, 134, '0', 'end') + note(54, 12, 'free heap after each lap, bytes');
    s += `<polyline fill="none" stroke="#5fe3ff" stroke-width="2.5" points="${hist.map((v, i) => X(i) + ',' + Y(v)).join(' ')}"/>` + hist.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="3" fill="#5fe3ff"/>`).join('');
    if (fail) s += `<circle cx="${X(n - 1)}" cy="${Y(hist[n - 1])}" r="7" fill="none" stroke="#ff5d4d" stroke-width="2.5"/>` + note(X(n - 1) - 10, Y(hist[n - 1]) - 12, 'malloc() returns NULL', 'end');
    s += note(50, 150, 'lap 0') + note(706, 150, 'lap ' + (n - 1), 'end');
    const t = (fail - 1) * P;
    el.querySelector('[data-out]').innerHTML = svg(720, 158, s, 'Free heap after each lap')
      + `<p class="wgcap">` + (fail ? `<span class="bad">Lap ${fail} asks for ${F} B and only ${free} B are left: malloc() returns NULL after about ${t} ms.</span> The code that uses the pointer without checking it writes to address 0 and panics. A slow lap does not fix a leak: ${P} ms or 500 ms, it only moves the crash later.`
        : `<span class="good">Steady state.</span> The heap never drops below ${low} B in 40 laps (${(low / HEAP * 100).toFixed(0)}% of ${HEAP} B). ${m === 'all' ? 'Every allocation has its free().' : ''}`) + `</p>`;
  };
  el.addEventListener('input', draw); el.addEventListener('change', draw); draw();
}

/* ---------- 11. stage 5 lab: a burst of samples against a slow consumer, with a queue of chosen length (pure arithmetic, no randomness) ---------- */
// Model: 5 samples arrive P ms apart. The consumer (radio) takes the oldest waiting sample whenever it is idle and needs C ms per sample.
// Length 0 stands for "no queue, one task": the instrument keeps one sample. A queue of length L holds L items and the reader holds one more while blocked in send, so L + 1 can wait.
function queueSim(P, C, L) {
  const cap = L === 0 ? 1 : L + 1, N = 5, wait = [], arr = [], done = []; let busyUntil = -1, peak = 0, cur = -1;
  const end = (N - 1) * P + N * C + 5;
  for (let t = 0; t <= end; t++) {
    if (busyUntil === t) { busyUntil = -1; cur = -1; }
    if (t % P === 0 && t / P < N) { const k = t / P; if (wait.length >= cap) arr.push({ k, t, lost: true }); else { wait.push(k); arr.push({ k, t, lost: false }); } }
    if (busyUntil < 0 && wait.length) { cur = wait.shift(); busyUntil = t + C; done.push({ k: cur, a: t, b: t + C }); }
    peak = Math.max(peak, wait.length);
  }
  return { arr, done, peak, end, lost: arr.filter(a => a.lost).length };
}
function queuelab(el) {
  el.innerHTML = frame('A BURST OF 5 SAMPLES AGAINST A SLOW RADIO: HOW LONG MUST THE QUEUE BE?', `<div class="wgrow"><label>sample every <input type="range" data-p min="5" max="60" value="20"> <b data-pv></b></label><label>transmit takes <input type="range" data-c min="10" max="100" value="48"> <b data-cv></b></label><label>queue length <input type="range" data-l min="0" max="8" value="0"> <b data-lv></b></label></div><div data-out></div>`);
  const draw = () => {
    const P = +el.querySelector('[data-p]').value, C = +el.querySelector('[data-c]').value, L = +el.querySelector('[data-l]').value;
    el.querySelector('[data-pv]').textContent = P + ' ms'; el.querySelector('[data-cv]').textContent = C + ' ms'; el.querySelector('[data-lv]').textContent = L === 0 ? 'none (one task)' : L;
    const r = queueSim(P, C, L); let need = 1; while (need < 20 && queueSim(P, C, need).lost) need++;
    const X = v => 60 + v / r.end * 640; let s = note(54, 34, 'samples', 'end') + note(54, 78, 'radio', 'end');
    r.arr.forEach(a => { s += `<line class="${a.lost ? 'dash' : 'tick'}" x1="${X(a.t)}" y1="18" x2="${X(a.t)}" y2="42" ${a.lost ? 'style="stroke:#ff5d4d;stroke-width:3"' : ''}/>` + note(X(a.t), 14, (a.lost ? 'x' : '') + a.k, 'middle'); });
    r.done.forEach(b => { s += `<rect class="bx c" x="${X(b.a)}" y="66" width="${Math.max(2, X(b.b) - X(b.a))}" height="20" rx="2"/>` + note((X(b.a) + X(b.b)) / 2, 80, b.k, 'middle'); });
    s += `<line class="ar" x1="60" y1="104" x2="704" y2="104" marker-end="url(#ah)"/>` + note(60, 120, '0 ms') + note(704, 120, r.end + ' ms', 'end');
    const ram = L === 0 ? 0 : 96 + L * 128;
    el.querySelector('[data-out]').innerHTML = svg(720, 128, s, 'Sample arrivals and transmit bars for the chosen queue length')
      + `<p class="wgcap">Samples lost: <b class="${r.lost ? 'bad' : 'good'}">${r.lost}</b> of 5 (a lost one is marked x in red). Delivered: <b>${r.done.length}</b>. `
      + (L === 0 ? '<span class="bad">One task does both jobs: while it transmits, the instrument keeps only the newest sample and the older one is overwritten.</span> ' : `Queue RAM: <b>${ram} B</b> (96 B control block + ${L} x 128 B). `)
      + (need > 0 && r.lost ? `The shortest queue that loses nothing here is <b>${need >= 20 ? 'more than 20' : need}</b>.` : `Shortest queue that loses nothing here: <b>${need}</b>${L > need ? ', so the extra ' + (L - need) + ' slot' + (L - need > 1 ? 's are' : ' is') + ' spare RAM' : ''}.`)
      + (C < P ? ' The radio is faster than the samples, so no backlog ever builds.' : '') + '</p>';
  };
  el.addEventListener('input', draw); draw();
}

/* ---------- a small chart to practise reading, driven by the real kernel ---------- */
function chartguide(el) {
  const Ld = { T: 400, cores: 1, pins: ['LED'], irqs: {} };
  const P = { objs: {}, units: [task('blink', 3, [g('LED'), d(100)]), task('urgent', 2, [bz(10), d(40)]), task('worker', 1, [bz(30), d(30)])] };
  el.innerHTML = frame('A SMALL CHART TO PRACTISE ON', `<p class="wgcap">Three tasks for 400 ms. <b>blink</b> (priority 3) toggles the LED pin and sleeps 100 ms. <b>urgent</b> (priority 2) works 10 ms out of every 50. <b>worker</b> (priority 1) works 30 ms, then sleeps 30 ms.</p>
    <div class="tl"><div class="tll" data-ll></div><div class="tlw" data-tw><div class="tli"><canvas data-cv></canvas></div></div></div>
    <p class="wgcap mono" data-probe>Move the mouse over the chart: this line names the state of every row at that millisecond.</p>
    <ul><li><b>Thin tick</b> on the blink row: it ran for less than a millisecond, exactly under an edge of the LED pin.</li>
    <li><b>Solid bar</b>: Running. urgent and worker never show a solid bar at the same moment, because there is one core.</li>
    <li><b>Faded low bar</b> on the worker row: worker is Ready but urgent has the CPU. Its 30 ms of work finish later than 30 ms after they began.</li>
    <li><b>Dotted line</b>: Blocked on a delay. <b>IDLE task</b> is filled only where all three rows are dotted.</li></ul>`);
  let K = null;
  const draw = () => { K = runSim(Ld, JSON.parse(JSON.stringify(P))); drawTimeline(el.querySelector('[data-cv]'), el.querySelector('[data-ll]'), K, Ld, 1); };
  el.querySelector('[data-tw]').addEventListener('mousemove', e => { if (!K) return; const r = el.querySelector('[data-cv]').getBoundingClientRect(); el.querySelector('[data-probe]').textContent = describe(K, Ld, (e.clientX - r.left) / r.width * K.T); });
  setTimeout(draw, 0);
  new ResizeObserver(() => { if (el.querySelector('.tlw').clientWidth) draw(); }).observe(el);
}

export const WIDGETS = { chartguide, boot, loopvs, heap, states, ticks, whoruns, schedlab, driftlab, jitterlab, limitlab, sleeplab, stacklab, leaklab, queuelab };
