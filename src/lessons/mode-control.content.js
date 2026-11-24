// Field manual for side mission 102 (ESP-IDF v5): state machines in one task that waits on an event queue.
// Colour code in the figures: green = a row that changes state, amber = "stay" row (decided, does nothing),
// dim = ignored (no row), red = the emergency event or an illegal case, cyan = the current state.
import { svg, box, arrow, note } from '../widgets.js';

const cap = t => `<p class="cap">${t}</p>`;
const frame = (title, body) => `<div class="wg"><div class="wgh">INTERACTIVE · ${title}</div>${body}</div>`;

/* ================= shared data: the 12 rows of the reference solution ================= */
const STATES = ['IDLE', 'DRIVING', 'SAMPLING', 'SAFE'];
const EVENTS = ['CMD_DRIVE', 'CMD_STOP', 'CMD_SAMPLE', 'CMD_RESUME', 'HAZARD', 'DRILL_DONE'];
/* [state, event, action ('' = none), next state] */
const ROWS = [
  ['IDLE', 'CMD_DRIVE', 'startMotors()', 'DRIVING'], ['IDLE', 'CMD_SAMPLE', 'startDrill()', 'SAMPLING'], ['IDLE', 'HAZARD', '', 'SAFE'],
  ['DRIVING', 'CMD_STOP', 'stopMotors()', 'IDLE'], ['DRIVING', 'HAZARD', 'stopMotors()', 'SAFE'], ['DRIVING', 'CMD_SAMPLE', '', 'DRIVING'],
  ['SAMPLING', 'DRILL_DONE', 'sendReport()', 'IDLE'], ['SAMPLING', 'HAZARD', 'retractDrill()', 'SAFE'], ['SAMPLING', 'CMD_DRIVE', '', 'SAMPLING'],
  ['SAFE', 'CMD_RESUME', '', 'IDLE'], ['SAFE', 'CMD_DRIVE', '', 'SAFE'], ['SAFE', 'CMD_SAMPLE', '', 'SAFE'],
];
const findRow = (s, e) => ROWS.find(r => r[0] === s && r[1] === e);

/* ================= diagrams ================= */

// 1. Three flags: eight combinations, four legal. Next to them the four states.
const flagsDia = svg(720, 232, (() => {
  const combos = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const legal = ['IDLE', 'DRIVING', 'SAMPLING', 'SAFE'];
  let s = note(10, 14, 'three flags: wheels, drill, safe = 8 combinations');
  combos.forEach((c, i) => {
    const x = 10 + (i % 4) * 170, y = i < 4 ? 24 : 98, ok = i < 4;
    s += box(x, y, 156, 58, `wheels ${c[0]}, drill ${c[1]}|safe ${c[2]}|${ok ? 'legal: ' + legal[i] : 'illegal, possible'}`, ok ? 'g' : 'r');
  });
  s += note(10, 176, 'The flags allow all 8. Only 4 make sense. One missed check puts the rover in an illegal row.');
  s += note(10, 202, 'A state variable has exactly 4 values:');
  legal.forEach((n, i) => { s += box(250 + i * 116, 184, 104, 30, n, 'g'); });
  return s;
})(), 'Eight flag combinations of which four are legal, and the four states');

// 2. From diagram to C: one arrow, one line of code
const toCDia = svg(720, 130, (() => {
  let s = box(10, 14, 250, 70, 'one arrow in the diagram|IDLE --CMD_DRIVE--&gt; DRIVING|action: startMotors()', 'c');
  s += arrow(260, 49, 300, 49) + box(300, 14, 410, 70, 'one branch in the C code|case ST_IDLE: if (ev == EV_CMD_DRIVE)|{ startMotors(); state = ST_DRIVING; }', 'g');
  s += note(10, 112, 'Every arrow becomes one branch. Every branch is one row of the table.');
  return s;
})(), 'One transition arrow and the C branch it becomes');

// 3. Sources, queue, one task, actuators
const taskDia = svg(720, 232, (() => {
  let s = box(10, 8, 200, 56, 'bumper / tilt ISR|xQueueSendFromISR()', 'isr') + box(10, 88, 200, 56, 'radio task: commands|xQueue_Send()'.replace('_', ''), '') + box(10, 168, 200, 56, 'drill driver, timers|post DRILL_DONE, timeouts', '');
  s += arrow(210, 36, 280, 100) + arrow(210, 116, 280, 116) + arrow(210, 196, 280, 132);
  s += box(280, 88, 130, 56, 'events queue|FIFO of event_t', 'a') + arrow(410, 116, 460, 116);
  s += box(460, 76, 130, 80, 'mode_task|owns "state"|run to completion', 'c') + arrow(590, 116, 620, 116);
  s += box(620, 76, 90, 80, 'motors|drill|report', '');
  s += note(10, 228, 'Everyone posts. Only mode_task reads the queue and changes state.');
  return s;
})(), 'Event sources post to one queue read by the mode task, which drives the actuators');

// 4. Timeline: blocking action against start-and-wait-in-a-state
const blockDia = svg(720, 258, (() => {
  const X = t => 70 + (t - 400) * 1.2;
  let s = note(10, 14, 'time in ms. CMD_SAMPLE arrives at 400, HAZARD at 500. The drill needs 400 ms.');
  s += note(10, 50, 'A: drillSample()') + note(10, 66, 'blocks');
  s += `<rect class="bx r" x="${X(400)}" y="38" width="${X(800) - X(400)}" height="30" rx="2"/>` + note(X(600), 57, 'task blocked inside the action', 'middle');
  s += `<line class="ar" x1="${X(500)}" y1="92" x2="${X(500)}" y2="72" marker-end="url(#ah)"/>` + note(X(500), 106, 'HAZARD', 'middle');
  s += `<line class="dash" x1="${X(500)}" y1="72" x2="${X(800)}" y2="72"/>` + note(X(800) + 6, 98, 'HAZARD handled at 801', 'start') + note(X(500) + 4, 124, 'waits 301 ms: far over 10 ms', 'start');
  s += note(10, 168, 'B: start') + note(10, 184, '+ state');
  s += `<rect class="bx c" x="${X(400)}" y="152" width="4" height="30" rx="1"/>` + note(X(400) + 10, 148, 'startDrill(), 1 ms', 'start');
  s += `<rect class="bx" style="fill:none;stroke:#b9cbe0;stroke-dasharray:2 4" x="${X(402)}" y="152" width="${X(500) - X(402)}" height="30" rx="2"/>` + note(X(450), 172, 'in SAMPLING', 'middle');
  s += `<line class="ar" x1="${X(500)}" y1="206" x2="${X(500)}" y2="186" marker-end="url(#ah)"/>` + note(X(500) + 8, 214, 'HAZARD: retractDrill() runs at once, 0 ms wait', 'start');
  s += `<line class="dash" x1="${X(800)}" y1="30" x2="${X(800)}" y2="190"/>` + note(X(800) + 6, 180, 'DRILL_DONE', 'start');
  s += `<line class="ar" x1="60" y1="238" x2="710" y2="238" marker-end="url(#ah)"/>`;
  [400, 500, 600, 700, 800].forEach(t => { s += `<line class="tick" x1="${X(t)}" y1="232" x2="${X(t)}" y2="238"/>` + note(X(t), 249, t + '', 'middle'); });
  return s;
})(), 'Timeline of a blocking action against a start action with a waiting state');

// 5. The matrix: 4 states x 6 events of the reference solution
const matrixDia = svg(720, 290, (() => {
  const X0 = 94, CW = 104, CH = 46;
  let s = '';
  EVENTS.forEach((e, k) => { s += box(X0 + k * CW, 4, CW - 4, 30, e, e === 'HAZARD' ? 'r' : 'd'); });
  STATES.forEach((st, i) => {
    const y = 40 + i * (CH + 4);
    s += box(4, y, 86, CH, st, 'c');
    EVENTS.forEach((e, k) => {
      const r = findRow(st, e), x = X0 + k * CW;
      if (!r) s += box(x, y, CW - 4, CH, 'ignored|no row', 'd');
      else if (r[3] === st) s += box(x, y, CW - 4, CH, 'stay|no action', 'a');
      else s += box(x, y, CW - 4, CH, (r[2] || '(no action)') + '|to ' + r[3], 'g');
    });
  });
  s += `<rect class="bx g" x="10" y="258" width="14" height="12" rx="2"/>` + note(30, 268, 'changes state') + `<rect class="bx a" x="150" y="258" width="14" height="12" rx="2"/>` + note(170, 268, 'stay: decided, does nothing');
  s += `<rect class="bx d" x="380" y="258" width="14" height="12" rx="2"/>` + note(400, 268, 'ignored: not decided') + `<rect class="bx r" x="560" y="258" width="14" height="12" rx="2"/>` + note(580, 268, 'emergency event');
  return s;
})(), 'State by event matrix of the reference solution with 12 rows');

// 6. Timeout as an event
const timeoutDia = svg(720, 190, (() => {
  let s = box(10, 14, 190, 56, 'enter SAMPLING|startDrill(), start timer', 'c') + arrow(200, 42, 250, 42);
  s += box(250, 14, 200, 56, 'timer, one shot|expires after 600 ms', 'a') + arrow(450, 42, 500, 42);
  s += box(500, 14, 210, 56, 'timer callback|xQueueSend(EV_TIMEOUT, 0)', '');
  s += arrow(605, 70, 605, 110) + box(500, 110, 210, 56, 'mode_task, SAMPLING|EV_TIMEOUT: retractDrill()', 'g');
  s += note(10, 100, 'If DRILL_DONE comes first,') + note(10, 116, 'the exit action stops the timer.') + note(10, 142, 'The callback only posts.') + note(10, 158, 'It never decides.');
  return s;
})(), 'A timeout is an event posted by a one-shot timer');

/* ================= widgets ================= */

/* 1. rovermode: click events, see the transition of the reference table */
function rovermode(el) {
  const NODE = { IDLE: [20, 117, 'waiting'], DRIVING: [295, 20, 'wheels on'], SAMPLING: [295, 214, 'drill down'], SAFE: [570, 117, 'all stopped'] };
  const EDGE = {
    'IDLE>DRIVING': [115, 117, 295, 40, 'CMD_DRIVE', 190, 66, 'end'], 'DRIVING>IDLE': [295, 62, 145, 117, 'CMD_STOP', 205, 118, 'start'],
    'IDLE>SAMPLING': [115, 163, 295, 240, 'CMD_SAMPLE', 200, 220, 'end'], 'SAMPLING>IDLE': [295, 218, 145, 163, 'DRILL_DONE', 205, 172, 'start'],
    'DRIVING>SAFE': [425, 50, 590, 117, 'HAZARD', 515, 76, 'start'], 'SAMPLING>SAFE': [425, 230, 590, 163, 'HAZARD', 515, 212, 'start'],
    'IDLE>SAFE': [150, 132, 570, 132, 'HAZARD', 360, 126, 'middle'], 'SAFE>IDLE': [570, 148, 150, 148, 'CMD_RESUME', 360, 164, 'middle'],
  };
  let st = 'IDLE', wheels = 0, drill = 0, last = null, msg = 'The rover is IDLE. Press an event button. The same six events are sent in the mission test.', hist = [];
  el.innerHTML = frame('ROVER STATE DIAGRAM: SEND AN EVENT', `<div data-out></div><div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0">${EVENTS.map(e => `<button type="button" class="hb" data-ev="${e}">${e}</button>`).join('')}<button type="button" class="hb" data-reset>RESET</button></div><p class="wgcap" data-cap></p><p class="wgcap" data-hist></p>`);
  const draw = () => {
    let s = '';
    Object.entries(EDGE).forEach(([k, [x1, y1, x2, y2, t, tx, ty, an]]) => {
      const on = last === k;
      s += `<line class="ar" ${on ? 'style="stroke:#ffb347;stroke-width:3.5"' : ''} x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#ah)"/>` + note(tx, ty, t, an);
    });
    Object.entries(NODE).forEach(([n, [x, y, sub]]) => { s += box(x, y, 130, 46, n + '|' + sub, n === st ? (n === 'SAFE' ? 'r' : 'c') : 'd'); });
    el.querySelector('[data-out]').innerHTML = svg(720, 270, s, 'Clickable state diagram of the rover mode manager');
    el.querySelector('[data-cap]').innerHTML = msg + `<br>Now: <b>${st}</b>, wheels <b>${wheels ? 'turning' : 'stopped'}</b>, drill <b>${drill ? 'down' : 'up'}</b>.`;
    el.querySelector('[data-hist]').textContent = hist.length ? 'Last events: ' + hist.slice(-4).join('  |  ') : '';
  };
  const send = ev => {
    const r = findRow(st, ev);
    if (!r) { last = null; msg = `<b class="bad">${ev} in ${st}: no row.</b> The event is ignored and the monitor prints "state ${st}: no transition for ${ev}, event ignored".`; hist.push(`${ev}: ignored`); return; }
    const [, , act, nx] = r;
    if (act === 'startMotors()') wheels = 1; if (act === 'stopMotors()') wheels = 0;
    if (act === 'startDrill()') drill = 1; if (act === 'retractDrill()' || act === 'sendReport()') drill = 0;
    last = nx === st ? null : st + '>' + nx;
    msg = nx === st ? `<b>${ev} in ${st}: explicit "stay" row.</b> No action, no new state. It was decided on purpose.` : `<b class="good">${ev} in ${st}:</b> ${act ? 'run <code>' + act + '</code>, then ' : ''}go to <b>${nx}</b>.`;
    hist.push(`${ev}: ${st} to ${nx}`); st = nx;
  };
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ev) send(b.dataset.ev);
    else if (b.hasAttribute('data-reset')) { st = 'IDLE'; wheels = 0; drill = 0; last = null; hist = []; msg = 'Reset: the rover is IDLE.'; }
    draw();
  });
  draw();
}

/* 2. blocklab: how long a HAZARD waits behind a blocking action */
function blocklab(el) {
  el.innerHTML = frame('HOW LONG DOES A HAZARD WAIT?',
    `<div class="wgrow"><label>action <select data-md><option value="blk" selected>drillSample() blocks the task</option><option value="st">startDrill() and a SAMPLING state</option></select></label><label>drill time <input type="range" data-d min="50" max="400" step="10" value="400"> <b data-dv></b></label><label>HAZARD arrives after <input type="range" data-h min="20" max="400" step="10" value="100"> <b data-hv></b></label></div><div data-out></div>`);
  const draw = () => {
    const mode = el.querySelector('[data-md]').value, D = +el.querySelector('[data-d]').value, h = +el.querySelector('[data-h]').value;
    el.querySelector('[data-dv]').textContent = D + ' ms'; el.querySelector('[data-hv]').textContent = h + ' ms';
    const X = t => 60 + t * 1.2, busy = mode === 'blk' ? D : 1, wait = h < busy ? busy - h + 1 : 0, at = h + wait;
    let s = note(60, 16, mode === 'blk' ? 'drillSample(): the task is blocked, the queue is not read' : 'startDrill() returns at once, the task waits on the queue in SAMPLING', 'start');
    s += `<rect class="bx ${mode === 'blk' ? 'r' : 'c'}" x="${X(0)}" y="30" width="${Math.max(3, X(busy) - X(0))}" height="28" rx="2"/>` + note(10, 49, 'mode task');
    s += `<line class="ar" x1="${X(h)}" y1="100" x2="${X(h)}" y2="62" marker-end="url(#ah)"/>` + note(X(h), 114, 'HAZARD', 'middle');
    s += `<line class="dash" x1="${X(h)}" y1="124" x2="${X(at)}" y2="124"/>` + note(X(h), 142, wait ? `waits ${wait} ms` : 'handled at once: 0 ms', 'start');
    s += `<line class="ar" x1="50" y1="166" x2="700" y2="166" marker-end="url(#ah)"/>`;
    [0, 100, 200, 300, 400, 500].forEach(t => { s += `<line class="tick" x1="${X(t)}" y1="160" x2="${X(t)}" y2="166"/>` + note(X(t), 180, t + '', 'middle'); });
    s += note(10, 180, 'ms');
    el.querySelector('[data-out]').innerHTML = svg(720, 192, s, 'Wait of a HAZARD event behind a blocking action')
      + `<p class="wgcap">The HAZARD waits <b class="${wait <= 10 ? 'good' : 'bad'}">${wait} ms</b>. The mission limit is 10 ms. `
      + (mode === 'blk' ? (wait ? 'The queue is not read until the action returns, so the emergency stands in line behind a drill that is still moving.' : 'The drill is already finished when the HAZARD arrives, so nothing waits. A shorter drill time only hides the problem: the order is still wrong in the worst case.') : 'The action takes 1 ms. After that the task is back on the queue and the HAZARD runs at once, whatever the drill time. The drill finishes by itself and posts DRILL_DONE later.') + '</p>';
  };
  el.addEventListener('input', draw); el.addEventListener('change', draw); draw();
}

export const widgets = { rovermode, blocklab };

/* ================= the field manual ================= */

export const manual = [
  ['1. The problem: flags that disagree', `<p>The rover can drive, drill and enter safe mode. A first draft of the firmware often keeps one boolean for each: <code>driving</code>, <code>drilling</code>, <code>safe</code>. Every handler then reads the flags and decides what to do. The mission starts with exactly this kind of code: no real states, every event answered the same way whatever the rover is doing.</p>
   ${flagsDia}
   ${cap('Three flags give 2 x 2 x 2 = 8 combinations. Only 4 are legal. The other 4 can still happen if one handler forgets one check.')}
   <ul><li>The starting code of the mission shows the result. <code>CMD_SAMPLE</code> arrives while the wheels turn and the drill goes down, because nothing checks the wheels. The drill bit snaps.</li>
   <li>The <code>HAZARD</code> at 500 ms stops the wheels, but nothing remembers that the hazard is open. The next <code>CMD_DRIVE</code> starts the wheels again.</li>
   <li>Each new flag doubles the combinations (4 flags: 16, 5 flags: 32). The number of checks grows with them, and nobody can read the code and say which combinations are covered.</li>
   <li>A <b>state machine</b> replaces the flags with one variable. The variable has exactly one value at any time, and each value stands for one legal situation of the rover. An illegal combination cannot even be written down.</li></ul>`],

  ['2. States, events, transitions, actions', `<p>Four words describe every state machine. Learn them once and the rest of this mission is bookkeeping.</p>
   <ul><li>A <b>state</b> is a situation the rover can be in: <code>IDLE</code>, <code>DRIVING</code>, <code>SAMPLING</code>, <code>SAFE</code>. The machine is in exactly one state. It starts in <code>IDLE</code>.</li>
   <li>An <b>event</b> is something that happened: <code>CMD_DRIVE</code>, <code>CMD_STOP</code>, <code>CMD_SAMPLE</code>, <code>CMD_RESUME</code> (commands from Mission Control), <code>HAZARD</code> (bumper or tilt sensor) and <code>DRILL_DONE</code> (sent by the drill driver).</li>
   <li>A <b>transition</b> is one row: in state S, on event E, do action A and go to state N. A <b>stay</b> row has the same state as next state.</li>
   <li>An <b>action</b> is a function the rover runs during the transition: <code>startMotors()</code>, <code>stopMotors()</code>, <code>startDrill()</code>, <code>retractDrill()</code>, <code>sendReport()</code>. A row may also have no action.</li></ul>
   <p>If the current state has no row for the event, the event is <b>ignored</b>. The mission prints <code>state X: no transition for Y, event ignored</code>. Ignoring is the safe default: a command the rover may not obey does nothing.</p>
   <p>Press the events below. The amber arrow is the transition that was taken. Try <code>CMD_SAMPLE</code> while DRIVING, then <code>HAZARD</code> while SAMPLING, then <code>CMD_DRIVE</code> in SAFE.</p>
   <div data-w="rovermode"></div>
   <ul><li>A <code>HAZARD</code> stays active until <code>CMD_RESUME</code>. That rule needs no flag: it is the state <code>SAFE</code>. The only way out of <code>SAFE</code> is the row <code>CMD_RESUME</code>.</li>
   <li>The drill is never down while the wheels turn because no state is both. <code>SAMPLING</code> has no row that calls <code>startMotors()</code>.</li></ul>`],

  ['3. From diagram to C', `<p>The diagram is the design. The C code is a direct copy of it. Start with two <code>enum</code> types, one for the states and one for the events:</p>
   <pre>typedef enum { ST_IDLE, ST_DRIVING, ST_SAMPLING, ST_SAFE } state_t;
typedef enum { EV_CMD_DRIVE, EV_CMD_STOP, EV_CMD_SAMPLE, EV_CMD_RESUME,
               EV_HAZARD, EV_DRILL_DONE } event_t;</pre>
   ${toCDia}
   <p><b>Form 1: nested switch.</b> This is the form the game's editor shows for your table. The outer <code>switch</code> picks the state, the inner tests pick the event:</p>
   <pre>switch (state) {
case ST_IDLE:
    if (ev == EV_CMD_DRIVE)       { startMotors(); state = ST_DRIVING; }
    else if (ev == EV_CMD_SAMPLE) { startDrill();  state = ST_SAMPLING; }
    else if (ev == EV_HAZARD)     { state = ST_SAFE; }
    else                          { log_unhandled(state, ev); }
    break;
case ST_DRIVING:
    ...
default:                          /* a state value that does not exist */
    ESP_LOGE(TAG, "bad state %d", state);
    state = ST_SAFE;
}</pre>
   <p><b>Form 2: table-driven.</b> The rows become data. One short loop runs every machine:</p>
   <pre>typedef struct { state_t from; event_t ev; void (*act)(void); state_t to; } transition_t;
static const transition_t table[] = {
    { ST_IDLE,    EV_CMD_DRIVE,  startMotors, ST_DRIVING },
    { ST_DRIVING, EV_CMD_STOP,   stopMotors,  ST_IDLE    },
    /* ... one line per row ... */
};
for (size_t i = 0; i &lt; sizeof table / sizeof table[0]; i++) {
    if (table[i].from == state &amp;&amp; table[i].ev == ev) {
        if (table[i].act) table[i].act();
        state = table[i].to;
        return;
    }
}
log_unhandled(state, ev);</pre>
   <ul><li><b>The switch is better</b> for a small machine (up to about 20 rows), when a row needs a few lines of code, or when you want to read one state at a time. The compiler can also warn about a <code>switch</code> over an <code>enum</code> that misses a case.</li>
   <li><b>The table is better</b> when the machine is large, when the rows are generated or checked by a tool, or when you want to print or test the whole machine. A <code>static const</code> table lives in flash and costs no RAM.</li>
   <li><b>Both forms need an unhandled branch.</b> Rows you did not write must at least log. A silent <code>default:</code> hides a typo: the event is dropped and the rover just does nothing, with no message to explain it.</li>
   <li>Set the new state in the same branch as the action. A row that starts the wheels but keeps the old state leaves the machine blind: it does not know the wheels turn.</li></ul>`],

  ['4. One task, one queue', `<p>A state machine needs one place where events are handled one after the other. In FreeRTOS that place is a task that waits on a queue. Nobody calls the state machine. Everybody posts to its queue.</p>
   ${taskDia}
   <pre>static void mode_task(void *arg)
{
    state_t state = ST_IDLE;
    event_t ev;
    for (;;) {
        xQueueReceive(s_events, &amp;ev, portMAX_DELAY);   /* blocks: no CPU used */
        dispatch(&amp;state, ev);                          /* one event, completely */
    }
}</pre>
   <ul><li><b>All sources only post.</b> The bumper interrupt calls <code>xQueueSendFromISR()</code> (an ISR must never block, see the interrupt stage). Other tasks call <code>xQueueSend()</code>. A software timer callback or the drill driver does the same.</li>
   <li><b>No mutex is needed.</b> The variable <code>state</code> is a local of <code>mode_task</code>. Only that task reads and writes it, so no other task can see it half-changed. This is the reason to use the pattern: you share events, not variables.</li>
   <li><b>Run to completion.</b> The task reads the next event only after the current one is fully handled. Two events never overlap, so a transition can never be cut in the middle. Order is kept: the queue is FIFO.</li>
   <li><b>An idle machine costs nothing.</b> Blocked in <code>xQueueReceive()</code> with <code>portMAX_DELAY</code> the task is on the wait list of the queue. It uses no CPU until an event arrives (queue stage).</li>
   <li><b>Priority and size.</b> The mission task runs at priority 3. The queue length must cover a burst of events: if the queue is full, a send with timeout 0 fails and an event is lost. The deepest call is <code>sendReport()</code> with 1100 B of stack on top of 768 B of task overhead in the game's model: 768 + 1100 = 1868 B. A stack of 2048 B is enough, the starting 4096 B wastes half of it. Stack sizes in ESP-IDF are in bytes.</li>
   <li>The ESP-IDF default tick is 100 Hz (10 ms). The game runs at 1000 Hz (1 ms). With <code>pdMS_TO_TICKS()</code> the code is correct for both.</li></ul>`],

  ['5. Actions must not block', `<p>Run to completion has a price. While an action runs, the task does not read the queue. If an action blocks for 400 ms, every event that arrives in that time waits, and that includes the emergency event.</p>
   <p>The starting code of the mission uses <code>drillSample()</code> for <code>CMD_SAMPLE</code>. The call blocks 400 ms until the drill is back up. The <code>HAZARD</code> at 500 ms arrives 100 ms after the call started, so it waits <b>301 ms</b> in the queue. The objective is 10 ms.</p>
   ${blockDia}
   ${cap('Version A blocks inside the action. Version B starts the drill and returns at once. In B the task is free for the whole 400 ms.')}
   <p>The fix turns the wait into a state. <code>startDrill()</code> takes 1 ms and returns. The machine goes to <code>SAMPLING</code>. The drill works by itself. After 400 ms the driver posts <code>DRILL_DONE</code>, and the row <code>SAMPLING + DRILL_DONE</code> sends the report. Meanwhile the queue is open: a <code>HAZARD</code> in <code>SAMPLING</code> runs <code>retractDrill()</code> at once.</p>
   <div data-w="blocklab"></div>
   <ul><li><b>Rule of thumb:</b> an action takes microseconds to a few milliseconds. Anything longer becomes <b>a state plus a completion event</b>: start the work, change state, wait for the "done" event.</li>
   <li>The same rule covers <code>vTaskDelay()</code>, waiting for a semaphore, a slow flash write and a blocking network call. None of them belongs inside an action.</li>
   <li>The response objective of the mission is 10 ms. With the actions of the reference (the longest is <code>sendReport()</code> at 3 ms), every event is handled in 0 ms of waiting.</li>
   <li>Not every wait has a driver that posts "done". Then a timer posts the event (section 7).</li></ul>`],

  ['6. Every state answers the emergency; ignoring is a decision', `<p>A transition table can be checked cell by cell. List the states down the side and the events across the top. Each of the 24 cells is one of three things: a row that changes state, a <b>stay</b> row (no action, same state), or empty. An empty cell means the event is <b>ignored</b>. Here is the reference solution.</p>
   ${matrixDia}
   <ul><li><b>The <code>HAZARD</code> column is the safety case.</b> Every state except <code>SAFE</code> has a row, and the actions are different: <code>stopMotors()</code> while DRIVING, <code>retractDrill()</code> while SAMPLING, no action while IDLE (nothing moves). In SAFE a second hazard changes nothing. A state without a <code>HAZARD</code> row is a hole: the emergency event would be ignored there.</li>
   <li><b>Match the action to the state.</b> A <code>HAZARD</code> row in SAMPLING that calls <code>stopMotors()</code> has a row, but the drill stays down. The action must make that state safe.</li>
   <li><b>SAFE obeys no command</b> except <code>CMD_RESUME</code>. This is the rule "nothing may move until CMD_RESUME", written as rows.</li>
   <li><b>Make ignoring explicit.</b> The four amber cells (<code>CMD_SAMPLE</code> while DRIVING, <code>CMD_DRIVE</code> while SAMPLING, and both commands in SAFE) work as empty cells too. As rows with no action they say "someone thought about this". A reviewer cannot tell a forgotten cell from a decided one if the cell is empty. In the game this is the "Deliberate" star: every event that arrives finds a row.</li>
   <li>The dim cells are still ignored on purpose, for example <code>DRILL_DONE</code> while DRIVING cannot happen. Leave them empty, and let the log line catch the case that "cannot happen" and does.</li>
   <li>Check <b>columns</b> as well as rows. A column that is all dim except one cell shows an event with only one meaning. A column with a missing state is the question to ask first.</li></ul>`],

  ['7. Timeouts, entry actions and bigger machines (Go deeper)', `<p>Real machines grow past four states. These tools keep them readable.</p>
   ${timeoutDia}
   <ul><li><b>A timeout is an event.</b> Do not wait with <code>vTaskDelay()</code> inside a state. Create a one-shot software timer with <code>xTimerCreate(name, pdMS_TO_TICKS(600), pdFALSE, NULL, cb)</code> (<code>pdFALSE</code> = no auto reload). Start it on entry to <code>SAMPLING</code>. The callback runs in the timer service task, so it must not block: it only calls <code>xQueueSend(s_events, &amp;ev, 0)</code> with <code>EV_TIMEOUT</code>. Stop the timer when <code>DRILL_DONE</code> arrives first.</li>
   <li><b>Or let the receive time out.</b> <code>xQueueReceive(q, &amp;ev, pdMS_TO_TICKS(600))</code> returns <code>pdFALSE</code> when no event came in time. The task can then treat that as <code>EV_TIMEOUT</code>. This is simple but the time starts again after every event, so it measures "quiet time", not "time in this state".</li>
   <li><b>Entry and exit actions.</b> Work that belongs to the state, not to one arrow, goes in the state: start the timer on entry to <code>SAMPLING</code>, stop it on exit. Then every arrow into the state does it, and no arrow can forget it.</li>
   <li><b>Guards.</b> A guard is a condition on a row: "on CMD_DRIVE in IDLE, if the battery is above 20 percent, go to DRIVING". A guard makes the same event lead to different transitions. Keep guards short and free of side effects.</li>
   <li><b>Hierarchical machines.</b> A state can contain sub-states. A row on the outer state (for example <code>HAZARD</code> on "any active mode") then covers all its sub-states, so the hazard row is written once instead of in every state.</li>
   <li><b>A ready-made dispatcher.</b> The ESP-IDF <code>esp_event</code> library has an event loop with its own task. You register handlers with <code>esp_event_handler_register(base, id, handler, arg)</code> and post with <code>esp_event_post()</code>. Wi-Fi and IP events use it. It fits when many components must react to the same event. For one machine with strict ordering, an own queue and task are simpler and use less RAM.</li>
   <li>The game uses a 1 ms tick. On a real ESP32 build the default tick is 100 Hz, so a 600 ms timeout is 60 ticks and its precision is 10 ms.</li></ul>`],
];

/* ================= quiz: one entry per section ================= */

export const quiz = [
  { q: 'A rover keeps three boolean flags: wheels, drill and safe. How many flag combinations exist, and how many of them are legal?',
    opts: ['3 combinations, all legal', '8 combinations, 4 legal', '6 combinations, 4 legal'], a: 1,
    why: 'Three flags give 2 x 2 x 2 = 8 combinations. Only "all off" and the three single flags make sense. The other four are illegal but the code can still reach them. A state variable with 4 values has no illegal values.',
    wrong: ['Three flags are not three possible values. Each flag is on or off by itself, so they combine: 2 x 2 x 2, not 3.', null, 'Count again: two options for each of the three flags multiply to 8. The 4 legal ones are right, but the total is not 6.'] },
  { q: 'The rover is in DRIVING. CMD_SAMPLE arrives and the table has no row for DRIVING plus CMD_SAMPLE. What happens?',
    opts: ['The drill starts anyway, because CMD_SAMPLE always means drill', 'The event is ignored, the state stays DRIVING, and the monitor prints a "no transition" line', 'The machine goes to IDLE to be safe'],
    a: 1, why: 'An event with no row for the current state is ignored. Nothing changes and the log line says so. That is what keeps the drill up while the wheels turn.',
    wrong: ['An action runs only through a row. With no row there is no action, so the event cannot start the drill.', null, 'Only a row can change the state. No row means no state change. Going to IDLE would also stop nothing: the wheels would still be on.'] },
  { q: 'In the switch form the else branch (or default) of a state is empty. A table row has a typo: DRIVING + CMD_STOP was written as DRIVING + CMD_STP and does not compile to a real event. What is the consequence?',
    opts: ['The compiler stops with an error and nothing can be flashed', 'The task crashes at the first CMD_STOP', 'CMD_STOP is dropped without any trace, and the rover keeps driving while the log says nothing'],
    a: 2, why: 'A silent unhandled branch turns every missing or wrong row into "nothing happens". With a log line in that branch the monitor shows "no transition for CMD_STOP" at once, and you see the missing row.',
    wrong: ['An empty else branch is valid C. The compiler has no way to know a row was missing, so it will not stop you.', 'Nothing crashes. The event is read and then thrown away by the empty branch. That is the problem: nothing shows it.', null] },
  { q: 'mode_task is the only task that reads and writes the variable state. Why does it need no mutex around state?',
    opts: ['Because the queue locks every variable of the task that reads it', 'Because only this task touches state: the other tasks and ISRs only post events, so nobody can see it half-changed', 'Because FreeRTOS makes all global variables atomic'],
    a: 1, why: 'Sharing events instead of variables is the point of the pattern. A mutex is needed when two tasks use one variable. Here only one task does, so there is nothing to protect.',
    wrong: ['A queue protects only its own storage, not other variables. The reason is not the queue.', null, 'FreeRTOS does not make variables atomic. A 32-bit access may be atomic on the ESP32, but a read-modify-write of several variables is not.'] },
  { q: 'The task calls drillSample(), which blocks 400 ms. A HAZARD is posted 100 ms after the call started. How long does it wait before the task reads it?',
    opts: ['0 ms: HAZARD is urgent, so the queue lets it jump the line', 'About 300 ms: until drillSample() returns, and the game measures 301 ms', '400 ms: always the full drill time'],
    a: 1, why: 'A queue is FIFO and the task reads it only between events. The call returns at 400 ms and the HAZARD arrived at 100 ms, so it waits about 300 ms. The fix is startDrill(), a state, and DRILL_DONE.',
    wrong: ['A normal queue has no urgency. Events leave in the order they came in, and the task does not even look while it is blocked.', null, 'The hazard arrived 100 ms into the call, so only the rest of the call counts: 300 ms. The full 400 ms would be the wait for an event that arrived at the very start.'] },
  { q: 'Which statement about the HAZARD column of the reference table is true?',
    opts: ['Every state runs stopMotors() on HAZARD, so one action is enough', 'IDLE, DRIVING and SAMPLING each have a HAZARD row that leads to SAFE, with a different action in each: none, stopMotors(), retractDrill()', 'Only DRIVING needs a HAZARD row, because only wheels are dangerous'],
    a: 1, why: 'Each state is made safe in a different way. In SAMPLING the drill must come up, so stopMotors() would leave it down. IDLE has nothing moving, so its row has no action but still goes to SAFE, which blocks later commands.',
    wrong: ['In SAMPLING the wheels are already off. stopMotors() does nothing for the drill, which stays in the ground.', null, 'A hazard in SAMPLING needs the drill up, and a hazard in IDLE must still lead to SAFE so that no command is obeyed until CMD_RESUME.'] },
  { q: 'The drill must be pulled up if DRILL_DONE does not arrive within 600 ms. Which design fits an event-driven machine?',
    opts: ['Call vTaskDelay(600) inside the startDrill() action, then check', 'On entry to SAMPLING start a one-shot timer whose callback posts EV_TIMEOUT. A SAMPLING + EV_TIMEOUT row runs retractDrill()', 'Poll in a loop in mode_task and read the clock after every event'],
    a: 1, why: 'The timeout becomes an event, so it goes through the same table and the queue stays open for a HAZARD. The callback only posts and never blocks.',
    wrong: ['vTaskDelay() inside an action blocks the task for 600 ms, and the HAZARD waits behind it. That is the same fault as drillSample().', null, 'The task sleeps in xQueueReceive() until an event arrives, so no event means no check. A loop that never sleeps also burns CPU.'] },
];

/* ================= complete ESP-IDF source ================= */

export const realCode = `// main/mode_manager.c   (ESP-IDF v5.x)   side mission 102: mode manager as a state machine
#include <stdint.h>
#include <stdbool.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "driver/gpio.h"
#include "esp_attr.h"      // IRAM_ATTR
#include "esp_log.h"
#include "rover.h"         // startMotors(), stopMotors(), startDrill(), retractDrill(), sendReport() (not shown)

#define PIN_BUMPER     GPIO_NUM_4     // example pin: bumper / tilt sensor, active low
#define PRIO_MODE      3
#define EVENT_QUEUE_LEN 8
#define MODE_STACK     2048           // bytes: 768 task overhead + 1100 for sendReport() = 1868, rounded up

static const char *TAG = "mode";

typedef enum { ST_IDLE, ST_DRIVING, ST_SAMPLING, ST_SAFE } state_t;
typedef enum { EV_CMD_DRIVE, EV_CMD_STOP, EV_CMD_SAMPLE, EV_CMD_RESUME, EV_HAZARD, EV_DRILL_DONE } event_t;

static const char *const STATE_NAME[] = { "IDLE", "DRIVING", "SAMPLING", "SAFE" };
static const char *const EVENT_NAME[] = { "CMD_DRIVE", "CMD_STOP", "CMD_SAMPLE", "CMD_RESUME", "HAZARD", "DRILL_DONE" };

static QueueHandle_t s_events;        // the only way into the state machine

// Anything may post an event. This helper is for tasks (radio commands, the drill driver).
bool mode_post(event_t ev)
{
    return xQueueSend(s_events, &ev, 0) == pdPASS;   // timeout 0: never block the caller; false = queue full
}

// Bumper / tilt interrupt: posts HAZARD and nothing else. FromISR calls never block.
static void IRAM_ATTR bumper_isr(void *arg)
{
    BaseType_t woken = pdFALSE;
    event_t ev = EV_HAZARD;
    xQueueSendFromISR(s_events, &ev, &woken);
    portYIELD_FROM_ISR(woken);        // run mode_task at once if it is now the highest-priority Ready task
}

static void log_unhandled(state_t s, event_t ev)
{
    ESP_LOGW(TAG, "state %s: no transition for %s, event ignored", STATE_NAME[s], EVENT_NAME[ev]);
}

// One event, handled completely. The 12 rows of the reference solution.
static void dispatch(state_t *state, event_t ev)
{
    state_t from = *state;
    switch (*state) {
    case ST_IDLE:
        if (ev == EV_CMD_DRIVE)       { startMotors(); *state = ST_DRIVING; }
        else if (ev == EV_CMD_SAMPLE) { startDrill();  *state = ST_SAMPLING; }   // returns at once; DRILL_DONE comes 400 ms later
        else if (ev == EV_HAZARD)     { *state = ST_SAFE; }                      // nothing moves, but commands must now be refused
        else                          { log_unhandled(from, ev); }
        break;
    case ST_DRIVING:
        if (ev == EV_CMD_STOP)        { stopMotors(); *state = ST_IDLE; }
        else if (ev == EV_HAZARD)     { stopMotors(); *state = ST_SAFE; }
        else if (ev == EV_CMD_SAMPLE) { /* stay: the drill must not go down while the wheels turn */ }
        else                          { log_unhandled(from, ev); }
        break;
    case ST_SAMPLING:
        if (ev == EV_DRILL_DONE)      { sendReport(); *state = ST_IDLE; }
        else if (ev == EV_HAZARD)     { retractDrill(); *state = ST_SAFE; }      // the drill must come up; the sample is lost
        else if (ev == EV_CMD_DRIVE)  { /* stay: the drill is in the ground */ }
        else                          { log_unhandled(from, ev); }
        break;
    case ST_SAFE:
        if (ev == EV_CMD_RESUME)      { *state = ST_IDLE; }
        else if (ev == EV_CMD_DRIVE)  { /* stay: hazard not cleared */ }
        else if (ev == EV_CMD_SAMPLE) { /* stay: hazard not cleared */ }
        else                          { log_unhandled(from, ev); }
        break;
    default:                                  // a state value that does not exist: go to the safe state
        ESP_LOGE(TAG, "bad state %d", (int)*state);
        *state = ST_SAFE;
        break;
    }
    if (*state != from) {
        ESP_LOGI(TAG, "%s + %s -> %s", STATE_NAME[from], EVENT_NAME[ev], STATE_NAME[*state]);
    }
}

static void mode_task(void *arg)
{
    state_t state = ST_IDLE;                  // only this task reads or writes state: no mutex needed
    event_t ev;
    for (;;) {
        // Blocks with no CPU use until an event arrives. portMAX_DELAY = wait forever.
        if (xQueueReceive(s_events, &ev, portMAX_DELAY) == pdPASS) {
            dispatch(&state, ev);             // run to completion: no action may block for long
        }
    }
}

void app_main(void)
{
    // Create the queue BEFORE the task and before the interrupt: both use the handle.
    s_events = xQueueCreate(EVENT_QUEUE_LEN, sizeof(event_t));
    if (s_events == NULL) { ESP_LOGE(TAG, "no heap for the event queue"); return; }

    // Stack sizes are in bytes in ESP-IDF. Return value unchecked for brevity: check == pdPASS in real code.
    xTaskCreate(mode_task, "mode", MODE_STACK, NULL, PRIO_MODE, NULL);

    gpio_config_t io = {
        .pin_bit_mask = 1ULL << PIN_BUMPER,
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .intr_type = GPIO_INTR_NEGEDGE,       // bumper pulls the pin low
    };
    ESP_ERROR_CHECK(gpio_config(&io));
    ESP_ERROR_CHECK(gpio_install_isr_service(0));
    ESP_ERROR_CHECK(gpio_isr_handler_add(PIN_BUMPER, bumper_isr, NULL));
    // The radio task calls mode_post(EV_CMD_DRIVE) etc.; the drill driver calls mode_post(EV_DRILL_DONE).
}

// Build notes
//   idf.py build flash monitor
//   The ESP-IDF default tick is 100 Hz (CONFIG_FREERTOS_HZ, 10 ms). The game runs at 1000 Hz (1 ms).
//   Nothing here depends on the tick rate: the machine waits on the queue, not on time.
//   Table-driven variant: replace dispatch() by a static const transition_t table[] and a lookup loop (manual, section 3).
//   Check the stack on real hardware: uxTaskGetStackHighWaterMark(NULL) in mode_task.`;
