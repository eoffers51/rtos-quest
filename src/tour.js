// Guided tour of the mission screen: a spotlight on one part of the UI at a time, with a short card beside it.
// It only points and explains. The page under it cannot be clicked while it runs, and it can be skipped at any step.

/** The steps, in the order a player meets the things they describe. `at` is a CSS selector; a step without one is a centred card. */
export const TOUR = [
  { title: 'A quick tour of the mission screen',
    text: 'Before the first lesson, eleven short stops show where everything is. It takes about a minute. You can skip it now and start it again at any time with TOUR in the top bar.' },
  { at: '.steps', title: 'Every stage has two steps',
    text: 'STEP 1 THEORY is the manual of the stage, with diagrams and check questions. It opens by itself the first time you enter a stage, and you can click here to open it again whenever you need it. STEP 2 MISSION is this screen: here you change the firmware and prove that it works.' },
  { at: '#editor .unit:first-child', title: 'The firmware: startup code',
    text: 'The left panel is the rover\'s C file. It starts with app_main(), which runs once: it sets up the pins, creates kernel objects and creates every task with one xTaskCreate() line. The stack size and the priority of a task are edited in that line.' },
  { at: '#editor .unit[data-u="0"]', title: 'A task function',
    text: 'Below app_main() each task has its own function with an endless for (;;) loop. Every line is one instruction. Change its values in the boxes, move it with the arrows and remove it with the cross. The grey comment under a call shows what it costs in CPU time and stack.' },
  { at: '#editor .unit[data-u="0"] .addrow', title: 'Add an instruction',
    text: 'Pick an instruction from this list to add it to the task. It lands where you are working: after the line you last clicked, or in place of a line you just deleted. An amber mark shows the spot.' },
  { at: '#editor [data-act="addtask"]', title: 'Add a task',
    text: 'This line at the end of app_main() adds a new task: an xTaskCreate() line here and an empty task function at the bottom of the file. The + TASK button under the editor does the same.' },
  { at: '.cfoot', title: 'Help when you are stuck',
    text: 'HINT gives help one step at a time. SHOW SOLUTION runs the reference solution so you can study it, and RESTORE MINE then brings your own code back. RESET CODE returns to the code the stage started with.' },
  { at: '.quest', title: 'Objectives',
    text: 'This list says what the firmware must do. After every run each line shows whether it was met, with the measured value. Meeting them all earns the first star. The two lines at the bottom are the extra stars, for CPU load and RAM.' },
  { at: '.deckrow', title: 'Flash and run',
    text: 'FLASH & RUN sends your code to the simulated ESP32 and runs the test. The rover shows what the firmware does. SPEED sets how fast the run is played back, and pressing the button again jumps to the result.' },
  { at: '.tl', title: 'The timing chart',
    text: 'One row per task, time from left to right in milliseconds. A solid bar means the task is running, a thin line means it is ready and waiting for the CPU, and a dotted line means it is blocked. Move the mouse over the chart to read any millisecond. After a failed run an amber bracket marks where the problem is.' },
  { at: '#serial', title: 'Serial monitor',
    text: 'The log of the rover, as idf.py monitor would show it. Errors and reboots appear here in red with their real ESP-IDF text. The last line of a run gives the CPU load, the RAM in use and the unused stack of every task.' },
  { at: '.top', title: 'Top bar',
    text: 'The CPU gauge and the clock follow the run, and the stars show what this stage has earned. BUILD LOG shows the whole journey and lets you replay a stage. ROTATE stops the camera from turning; you can also drag the scene yourself. SOUND switches the sound off.' },
  { title: 'That is the whole screen',
    text: 'Every stage begins with its theory, and then mission control briefs you. In the mission, flash the code as it is first, read the chart, then change one thing at a time.' },
];

/**
 * Run the tour.
 * @param {object[]} steps see TOUR
 * @param {() => void} done called once when the tour ends, whether finished or skipped
 */
export function startTour(steps, done) {
  if (document.querySelector('#tour')) return;
  const root = document.createElement('div'); root.id = 'tour'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Tour of the mission screen');
  root.innerHTML = '<div id="tourSpot"></div><div id="tourCard" class="panel"><small id="tourN"></small><h3 id="tourT"></h3><p id="tourX"></p>'
    + '<div class="tourBtn"><button class="hb" id="tourSkip">SKIP TOUR</button><span class="sp"></span><button class="hb" id="tourBack">◀ BACK</button><button class="run" id="tourNext"></button></div></div>';
  document.body.appendChild(root);
  const $ = s => root.querySelector(s), spot = $('#tourSpot'), card = $('#tourCard');
  // a step whose target is not on this screen (for example on a narrow layout) is left out
  const usable = steps.filter(s => { if (!s.at) return true; const el = document.querySelector(s.at); return !!el && el.getClientRects().length > 0; });
  let i = 0;

  function place() {
    const s = usable[i], el = s.at ? document.querySelector(s.at) : null, W = innerWidth, H = innerHeight, pad = 6, gap = 14;
    $('#tourN').textContent = `TOUR · ${i + 1} OF ${usable.length}`; $('#tourT').textContent = s.title; $('#tourX').textContent = s.text;
    $('#tourBack').disabled = i === 0; $('#tourNext').textContent = i === usable.length - 1 ? 'START ▶' : i === 0 ? 'START TOUR ▶' : 'NEXT ▶';
    $('#tourSkip').hidden = i === usable.length - 1;
    card.style.left = card.style.top = '0px'; const cw = card.offsetWidth, ch = card.offsetHeight;
    if (!el) { Object.assign(spot.style, { left: W / 2 + 'px', top: H / 2 + 'px', width: '0px', height: '0px', borderWidth: '0' }); card.style.left = Math.round((W - cw) / 2) + 'px'; card.style.top = Math.round((H - ch) / 2) + 'px'; return; }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect(), x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad), w = Math.min(W - 4, r.right + pad) - x, h = Math.min(H - 4, r.bottom + pad) - y;
    Object.assign(spot.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', borderWidth: '' });
    // put the card on the side with room: right, left, below, above; otherwise over the middle of the target
    let cx, cy;
    if (x + w + gap + cw <= W - 8) { cx = x + w + gap; cy = y; }
    else if (x - gap - cw >= 8) { cx = x - gap - cw; cy = y; }
    else if (y + h + gap + ch <= H - 8) { cx = x; cy = y + h + gap; }
    else if (y - gap - ch >= 8) { cx = x; cy = y - gap - ch; }
    else { cx = x + (w - cw) / 2; cy = y + (h - ch) / 2; }
    card.style.left = Math.round(Math.min(Math.max(8, cx), W - cw - 8)) + 'px'; card.style.top = Math.round(Math.min(Math.max(8, cy), H - ch - 8)) + 'px';
  }
  function end() { removeEventListener('keydown', key, true); removeEventListener('resize', place); root.remove(); done && done(); }
  function go(d) { const n = i + d; if (n >= usable.length) return end(); if (n < 0) return; i = n; place(); $('#tourNext').focus(); }
  // keys are taken before the game sees them, so Space or Enter does not also advance a mission control message
  function key(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); end(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopImmediatePropagation(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); go(-1); }
  }
  $('#tourNext').onclick = () => go(1); $('#tourBack').onclick = () => go(-1); $('#tourSkip').onclick = end;
  addEventListener('keydown', key, true); addEventListener('resize', place);
  place(); $('#tourNext').focus();
}
