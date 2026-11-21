// Field manual for stage 101 (side mission, ESP-IDF): idle, light sleep, deep sleep and what a wake-up costs.
// Colour code used in every figure (and named in a legend under each one):
//   running = cyan (c) · idle = plain grey-blue (no class) · light sleep = green (g) · deep sleep = dim grey (d)
//   Wi-Fi radio = amber (a) · cost or lost = red (r)
import { svg as rawSvg, box, arrow, note } from '../widgets.js';
import { PWR, BOOT } from '../kernel.js';

// Every figure gets 12 px of padding left and right, so no label touches the frame.
const svg = (w, h, body, label) => rawSvg(w + 24, h, `<g transform="translate(12 0)">${body}</g>`, label);
// idle = light outline, no fill; deep sleep ('D') = solid fill. The two stay distinct in bars and legends.
const BAR_STYLE = { '': 'fill:none;stroke:#b9cbe0', D: 'fill:#52657a;stroke:#9fb0b9' };
const bar = (x, y, w, cls, h = 20) => `<rect class="bx ${cls === 'D' ? 'd' : cls}" ${BAR_STYLE[cls] ? `style="${BAR_STYLE[cls]}" ` : ''}x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>`;
const axis = (x0, x1, y) => `<line class="ar" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" marker-end="url(#ah)"/>`;
// one legend row under a figure, on its own line: swatch + word, 24 px between entries, so colour is never the only signal
const legend = (y, items) => { let x = 20, s = ''; items.forEach(([cls, t]) => { s += bar(x, y - 9, 12, cls, 12) + note(x + 18, y + 1, t); x += 18 + Math.ceil(t.length * 6.6) + 24; }); return s; };
const cap = t => `<p class="cap">${t}</p>`;

// 1. The current model on a log scale
const currentDia = svg(720, 276, (() => {
  const rows = [['deep sleep', 0.01, 'D'], ['light sleep', 0.8, 'g'], ['idle task (no Wi-Fi)', 25, ''], ['running', 40, 'c'], ['idle, Wi-Fi started', 105, 'a'], ['running, radio transmitting', 170, 'a']];
  const X0 = 214, W = v => Math.max(4, 80 * (Math.log10(v) + 2));
  let s = note(X0, 14, 'mA, log scale: one gridline = 10x');
  [0.01, 0.1, 1, 10, 100].forEach(v => { const x = X0 + W(v); s += `<line class="dash" x1="${x}" y1="24" x2="${x}" y2="226"/>` + note(x, 242, v + '', 'middle'); });
  // value labels sit in their own column, clear of the gridlines
  rows.forEach(([n, v, cls], i) => { const y = 30 + i * 32; s += note(X0 - 10, y + 15, n, 'end') + bar(X0, y, W(v), cls, 22) + note(590, y + 15, v + ' mA'); });
  return s + legend(266, [['c', 'running'], ['', 'idle'], ['g', 'light sleep'], ['D', 'deep sleep'], ['a', 'Wi-Fi radio']]);
})(), 'Current drawn in each power state, log scale');

// 2. Idle task: clock running against clock gated
const idleDia = svg(720, 196, (() => {
  const X = t => 150 + t * 54;
  let s = note(140, 40, 'idle task, no sleep', 'end') + note(140, 120, 'light sleep', 'end');
  for (let t = 0; t <= 10; t++) s += `<line class="tick" x1="${X(t)}" y1="60" x2="${X(t)}" y2="72"/>`;
  s += bar(X(0), 26, X(10) - X(0), '') + note(X(5), 41, 'CPU clocked, waiting on WAITI (WFI): 25 mA', 'middle');
  s += axis(140, 710, 66);
  s += bar(X(0), 106, X(0.4) - X(0), 'c') + bar(X(0.4), 106, X(9.6) - X(0.4), 'g') + bar(X(9.6), 106, X(10) - X(9.6), 'c');
  s += note(X(5), 121, 'CPU clock gated, no tick interrupts: 0.8 mA', 'middle') + note(X(0), 150, 'enter sleep') + note(X(10), 150, 'timer wake-up', 'middle');
  s += `<line class="dash" x1="${X(10)}" y1="96" x2="${X(10)}" y2="140"/>`;
  return s + legend(180, [['', 'idle'], ['g', 'light sleep'], ['c', 'running']]);
})(), 'The idle task at full clock against light sleep');
const idleCap = cap('Both lanes show the same 10 ticks with nothing to do. In the top lane the chip waits for the next interrupt at full clock. In the bottom lane the kernel skips the ticks, programs a timer for the next wake-up and gates the clock.');

// 3. Tickless idle decision
const ticklessDia = svg(720, 244, (() => {
  const X = t => 60 + t * 40;
  let s = box(20, 12, 140, 44, 'idle task runs|nothing else is Ready', '') + arrow(160, 34, 210, 34) + box(210, 12, 180, 44, 'next wake-up|ticks away: n', '') + arrow(390, 34, 470, 34, 'n >= 3 ?', 0, -12) + box(470, 12, 230, 44, 'yes: light sleep|stop tick, set wake timer', 'g');
  s += arrow(300, 56, 300, 84, 'no', 14, 3) + box(190, 84, 220, 44, 'wait for an interrupt|(WAITI / WFI), tick runs', '');
  for (let t = 0; t <= 14; t++) s += `<line class="tick" x1="${X(t)}" y1="166" x2="${X(t)}" y2="${t % 5 === 0 ? 182 : 176}"/>`;
  s += axis(50, 640, 170) + bar(X(2), 148, X(10) - X(2), 'g', 12) + note(X(2), 142, 'tick stopped, chip asleep, tick count corrected on wake', 'start') + note(X(0), 204, 'ticks');
  s += `<line class="dash" x1="${X(12)}" y1="130" x2="${X(12)}" y2="188"/>` + note(X(12) + 6, 160, 'timer wakes the chip');
  return s + legend(232, [['', 'idle'], ['g', 'light sleep']]);
})(), 'Idle task decides whether to enter light sleep');

// 4. What deep sleep keeps
const deepDia = svg(720, 196, (() => {
  let s = `<rect class="bx d" x="20" y="14" width="320" height="150" rx="5"/>` + note(34, 34, 'powered in deep sleep (about 10 uA)');
  s += box(36, 46, 125, 44, 'RTC controller|timer, wake-up logic', 'd') + box(169, 46, 157, 44, 'RTC memory|RTC_DATA_ATTR variables', 'd') + box(36, 102, 290, 46, 'wake-up sources (original ESP32)|RTC timer, ext0 / ext1 pins, touch pad', 'd');
  s += `<rect class="bx r" x="380" y="14" width="320" height="150" rx="5"/>` + note(394, 34, 'lost: powered down or reset');
  s += box(396, 46, 140, 44, 'CPU cores|registers, stacks', 'r') + box(546, 46, 140, 44, 'main RAM|heap, .data, .bss', 'r') + box(396, 102, 140, 46, 'Wi-Fi, Bluetooth|radio and driver state', 'r') + box(546, 102, 140, 46, 'FreeRTOS|tasks, queues, ticks', 'r');
  return s + legend(184, [['d', 'deep sleep: still powered'], ['r', 'lost']]);
})(), 'What stays powered and what is lost in deep sleep');
const deepCap = cap('esp_deep_sleep_start() switches the right-hand side off. It does not return. When the timer fires the chip resets and runs the bootloader and app_main() from the top. Only data placed in RTC memory is still there.');

// 5. One report cycle after a wake-up
const bootDia = svg(720, 164, (() => {
  const X = ms => 40 + ms * 3.4; let t = 0, s = '';
  const seg = (ms, cls, label, above) => { s += bar(X(t), 54, Math.max(3, X(t + ms) - X(t)), cls, 28); if (label) s += note(X(t) + (X(t + ms) - X(t)) / 2, above ? 46 : 104, label, 'middle'); t += ms; };
  seg(30, 'c', 'BOOT 30 ms', true); seg(2, 'c', '', false); seg(120, 'a', 'wifiConnect 120 ms', true); seg(27, 'a', 'send', true); seg(1, 'c', '', false);
  // each below-bar label has a short leader straight up to its own segment
  s += `<line class="dash" x1="${X(31)}" y1="84" x2="${X(31)}" y2="94"/>` + note(X(31), 106, 'read 2 ms', 'middle');
  s += `<line class="dash" x1="${X(180) + 2}" y1="84" x2="${X(180) + 2}" y2="94"/>` + note(X(180) + 2, 106, 'wifiStop, wakeTimer, deepSleep', 'end') + axis(30, 710, 126);
  return s + legend(150, [['c', 'running (boot and read)'], ['a', 'Wi-Fi radio']]);
})(), 'One report cycle: boot, read, connect, send, sleep');
const bootCap = cap('Wake-up: ROM, bootloader, app_main(). The chip then sleeps for 10 s. A real boot takes about 100 to 300 ms; the game uses 30 ms.');

// 6. Cost of waiting: light sleep against deep sleep, as a function of the interval
const crossDia = svg(720, 236, (() => {
  const B = 30, ACT = 152, xmax = 4000, ymax = 3.4;
  const light = I => 0.8 * (I - ACT) / 1000, deep = I => (B * 40 + 0.01 * (I - ACT - B)) / 1000;
  const X = v => 50 + v / xmax * 650, Y = v => 160 - v / ymax * 130, cx = (B * 40 - 0.01 * (ACT + B) + 0.8 * ACT) / 0.79;
  let s = `<line class="ar" x1="50" y1="160" x2="706" y2="160"/><line class="ar" x1="50" y1="160" x2="50" y2="20"/>`;
  [0, 1000, 2000, 3000, 4000].forEach(v => { s += note(X(v), 176, (v / 1000) + ' s', 'middle'); });
  [0, 1, 2, 3].forEach(v => { s += `<line class="tick" x1="46" y1="${Y(v)}" x2="54" y2="${Y(v)}"/>` + note(42, Y(v) + 3, v + '', 'end'); });
  s += `<polyline class="bx g" style="fill:none;stroke-width:2.5" points="${X(ACT)},${Y(0)} ${X(xmax)},${Y(light(xmax))}"/><polyline class="bx d" style="fill:none;stroke-width:2.5;stroke-dasharray:7 4" points="${X(ACT + B)},${Y(deep(ACT + B))} ${X(xmax)},${Y(deep(xmax))}"/>`;
  s += `<line class="dash" x1="${X(cx)}" y1="${Y(0)}" x2="${X(cx)}" y2="28"/>` + note(X(cx) + 6, 36, 'curves cross at about ' + (cx / 1000).toFixed(1) + ' s');
  s += note(54, 14, 'extra charge per report cycle, mA·s') + note(690, Y(light(xmax)) + 16, 'light sleep (green line)', 'end') + note(690, Y(deep(xmax)) - 8, 'deep sleep (dashed line)', 'end') + note(X(0) + 8, Y(deep(ACT + B)) + 3, 'boot', 'start');
  s += note(50, 200, 'report interval (wake-up to wake-up)');
  return s + legend(224, [['g', 'light sleep'], ['d', 'deep sleep']]);
})(), 'Charge cost of light sleep and deep sleep against the report interval');

// 7. Wake-up sources of deep sleep and which RTC parts must stay powered for each (original ESP32)
const wakeDia = svg(720, 292, (() => {
  const CX = [290, 440, 590];
  let s = box(225, 8, 130, 44, 'RTC controller|and RTC timer', 'd') + box(375, 8, 130, 44, 'RTC peripherals|RTC pins, touch', 'd') + box(525, 8, 130, 44, 'RTC slow memory|ULP code, RTC data', 'd');
  s += note(20, 34, 'wake-up source', 'start');
  // [label, controller, peripherals (1 = needed, 0.5 = only if used, 0 = no), slow memory]
  const rows = [['timer', 1, 0, 0], ['ext0: one RTC pin', 1, 1, 0], ['ext1: several RTC pins', 1, 0.5, 0], ['touch pad', 1, 1, 0], ['ULP coprocessor', 1, 0.5, 1]];
  rows.forEach(([n, ...v], i) => {
    const y = 66 + i * 34;
    s += box(20, y, 185, 26, n, 'd');
    v.forEach((on, k) => { s += on ? `<circle class="bx g" ${on < 1 ? 'style="fill:none" ' : ''}cx="${CX[k]}" cy="${y + 13}" r="8"/>` : note(CX[k], y + 17, '-', 'middle'); });
  });
  s += note(20, 252, 'RTC_DATA_ATTR variables also live in RTC slow memory, so it stays powered whatever the source.', 'start');
  s += note(20, 270, 'After the reset, esp_sleep_get_wakeup_cause() tells app_main() which source fired.', 'start');
  return s + legend(288, [['g', 'powered for this source'], ['', 'only if used (pull resistors, ULP reads pins)']]);
})(), 'Wake-up sources of deep sleep and the RTC parts each one needs powered');
const wakeCap = cap('Every source goes through the RTC controller, the one part that is always awake. The timer needs nothing else. A pin or the touch pad needs the RTC peripherals domain on, which costs a little extra current. The main cores, main RAM and Wi-Fi stay off in all cases.');

/* ================= widgets ================= */

const frame = (title, body) => `<div class="wg"><div class="wgh">INTERACTIVE · ${title}</div>${body}</div>`;
const sl = (id, label, min, max, val, step = 1) => `<label>${label} <input type="range" data-${id} min="${min}" max="${max}" step="${step}" value="${val}"> <b data-${id}v></b></label>`;
const val = (el, id, unit = '') => { const v = +el.querySelector('[data-' + id + ']').value; el.querySelector('[data-' + id + 'v]').textContent = v + unit; return v; };

// All currents come from the simulator (src/kernel.js): PWR = { run 40, idle 25, wifi 80, tx 50, light 0.8, deep 0.01 } mA and BOOT = 30 ms.
// Charge of one active part, measured on the simulator's current trace (read, wifiConnect 120 ms, wifiSend 25 ms, wifiStop), in mA·ms:
const RADIO_MS = 145, RADIO_MA = PWR.idle + PWR.wifi + PWR.tx;   // 120 ms connect + 25 ms send; the CPU waits (idle) with the radio started and transmitting: 155 mA
const ACT_AWAKE = 154, Q_AWAKE = 23645;     // active part when the program goes on to delay(10000): 154 ms, 23645 mA·ms
const ACT_DEEP = 156, Q_DEEP = 23725;       // with wakeTimer and deepSleep: 156 ms, 23725 mA·ms (they run 2 ms at 40 mA)
const WAIT = 10000, CELL = 2000;            // the program waits 10 s; battery 2000 mAh

// 1. current calculator for the report cycle
function cyclelab(el) {
  el.innerHTML = frame('REPORT CYCLE: AVERAGE CURRENT AND BATTERY LIFE',
    `<div class="wgrow">${sl('rm', 'radio on time per cycle', 20, 400, RADIO_MS, 5)}<label>while waiting for the next report <select data-md><option value="idle">awake idle (no power management)</option><option value="light">light sleep</option><option value="deep" selected>deep sleep</option></select></label></div><div data-out></div>`);
  const draw = () => {
    const R = val(el, 'rm', ' ms'), dx = R - RADIO_MS, extra = dx * RADIO_MA, mode = el.querySelector('[data-md]').value;
    const avg = {
      idle: (Q_AWAKE + extra + PWR.idle * WAIT) / (ACT_AWAKE + dx + WAIT),
      light: (Q_AWAKE + extra + PWR.light * WAIT) / (ACT_AWAKE + dx + WAIT),
      deep: (Q_DEEP + extra + BOOT * PWR.run + PWR.deep * WAIT) / (ACT_DEEP + dx + BOOT + WAIT),
    };
    const X0 = 190, W = v => Math.max(4, 150 * (Math.log10(v) + 1)), names = { idle: 'awake idle', light: 'light sleep', deep: 'deep sleep' }, cls = { idle: '', light: 'g', deep: 'D' };
    let s = note(X0, 14, 'average current in mA, log scale: one gridline = 10x');
    [0.1, 1, 10].forEach(v => { const x = X0 + W(v); s += `<line class="dash" x1="${x}" y1="22" x2="${x}" y2="126"/>` + note(x, 142, v + '', 'middle'); });
    ['idle', 'light', 'deep'].forEach((k, i) => {
      const y = 30 + i * 34;
      if (k === mode) s += `<rect class="grp" x="6" y="${y - 4}" width="700" height="30" rx="4"/>`;
      s += note(X0 - 10, y + 15, names[k], 'end') + bar(X0, y, W(avg[k]), cls[k], 22) + note(X0 + 390, y + 15, avg[k].toFixed(2) + ' mA');
    });
    const a = avg[mode], days = CELL / a / 24, radioShare = Math.round(100 * (RADIO_MA * R) / (a * (mode === 'deep' ? ACT_DEEP + dx + BOOT + WAIT : ACT_AWAKE + dx + WAIT)));
    const life = days >= 100 ? Math.round(days) + ' days' : days >= 2 ? days.toFixed(1) + ' days' : (days * 24).toFixed(0) + ' hours';
    el.querySelector('[data-out]').innerHTML = svg(720, 152, s, 'Average current for awake idle, light sleep and deep sleep')
      + `<p class="wgcap">${names[mode][0].toUpperCase() + names[mode].slice(1)}, radio on ${R} ms per 10 s cycle: <b>${a.toFixed(2)} mA</b> on average. A 2000 mAh cell lasts about <b class="${days >= 30 ? 'good' : 'bad'}">${life}</b>. `
      + `The radio part (${RADIO_MA} mA for ${R} ms) is about ${radioShare}% of the charge of one cycle. `
      + (mode === 'idle' ? 'Waiting awake costs 25 mA for 10 s, so the wait is the biggest part.' : mode === 'light' ? 'The wait is cheap now, so the radio decides the battery life.' : 'The wait is almost free, so the radio and the 30 ms boot are all that is left.') + ' The numbers follow the simulator within about 2%.</p>';
  };
  el.addEventListener('input', draw); el.addEventListener('change', draw); draw();
}

// 2. tickless idle: sleep only if the next wake-up is at least 3 ticks away, and never while Wi-Fi is started (the game's rule)
function tickslab(el) {
  const TH = 3;
  el.innerHTML = frame('TICKLESS IDLE: SLEEP OR STAY AWAKE?',
    `<div class="wgrow">${sl('n', 'time until the next wake-up', 1, 12, 5, 1)}<label><input type="checkbox" data-wf> Wi-Fi is started</label></div><div data-out></div>`);
  const draw = () => {
    const n = val(el, 'n', ' ticks'), wifi = el.querySelector('[data-wf]').checked, far = n >= TH, sleeps = far && !wifi;
    const mA = (sleeps ? PWR.light : PWR.idle) + (wifi ? PWR.wifi : 0), X = t => 60 + t * 46;
    const why = sleeps ? `${n} >= ${TH}: sleep pays off|stop the tick, set a timer, light sleep` : wifi ? `Wi-Fi is started: the game never sleeps|(a real chip could, with modem sleep)` : `${n} < ${TH}: too close to be worth it|wait for an interrupt, the tick keeps running`;
    let s = box(60, 8, 600, 46, why, sleeps ? 'g' : 'a');
    for (let t = 0; t <= 12; t++) s += `<line class="tick" x1="${X(t)}" y1="108" x2="${X(t)}" y2="${t % 5 === 0 ? 124 : 118}"/>` + note(X(t), 140, t, 'middle');
    s += bar(X(0), 82, X(n) - X(0), sleeps ? 'g' : '', 20) + axis(50, 640, 112);
    s += `<line class="dash" x1="${X(TH)}" y1="66" x2="${X(TH)}" y2="108"/>` + note(X(TH) + 6, 76, 'threshold: 3 ticks') + `<line class="ar" x1="${X(n)}" y1="78" x2="${X(n)}" y2="108"/>` + note(X(n), 158, 'next wake-up', 'middle') + note(50, 158, 'ticks', 'end');
    el.querySelector('[data-out]').innerHTML = svg(720, 170, s, 'Distance to the next wake-up against the sleep threshold of 3 ticks')
      + `<p class="wgcap">Next wake-up in <b>${n}</b> tick${n === 1 ? '' : 's'} (${n} ms at the game's 1000 Hz): the idle task <b class="${sleeps ? 'good' : 'bad'}">${sleeps ? 'enters light sleep' : 'stays awake'}</b>, drawing <b>${mA} mA</b>${wifi ? ' (25 idle + 80 for the radio)' : ''}. `
      + (sleeps ? 'The kernel adds the missed ticks when the timer wakes the chip.' : wifi ? 'Turn Wi-Fi off in the program first, then light sleep can start.' : 'Going to sleep and waking up costs time and charge, so a gap this short is not worth it.') + '</p>';
  };
  el.addEventListener('input', draw); el.addEventListener('change', draw); draw();
}

// 3. what survives deep sleep: the boot counter in three places
function survivelab(el) {
  el.innerHTML = frame('WHAT SURVIVES DEEP SLEEP? THE BOOT COUNTER',
    `<div class="wgrow"><label>where the counter lives <select data-lo><option value="g">plain global</option><option value="r" selected>RTC_DATA_ATTR</option><option value="n">NVS (flash)</option></select></label>${sl('n', 'starts so far', 2, 6, 4)}<label>last start <select data-ev><option value="wake">a deep-sleep wake-up</option><option value="cut">after power was cut</option></select></label></div><div data-out></div>`);
  const code = {
    g: 'static uint32_t s_boot_count;                    // main RAM, .bss: zero at every start',
    r: 'static RTC_DATA_ATTR uint32_t s_boot_count;      // RTC slow memory: kept in deep sleep',
    n: 'nvs_get_u32(h, "boots", &n); n++; nvs_set_u32(h, "boots", n); nvs_commit(h);   // flash',
  };
  const draw = () => {
    const lo = el.querySelector('[data-lo]').value, n = val(el, 'n'), cut = el.querySelector('[data-ev]').value === 'cut';
    let prev = 0, s = '', allOk = true;
    const rows = [];
    for (let k = 1; k <= n; k++) {
      const cold = k === 1 || (cut && k === n);
      const v = lo === 'g' ? 1 : lo === 'r' ? (cold ? 1 : prev + 1) : prev + 1;
      prev = v; rows.push([k, cold, v]);
    }
    const BW = 104, GAP = 10;
    rows.forEach(([k, cold, v], i) => {
      const x = 10 + i * (BW + GAP), ok = v === k; if (!ok) allOk = false;
      s += box(x, 14, BW, 62, `start ${k}|${cold ? 'cold boot' : 'wake-up'}|counter = ${v}`, ok ? 'g' : 'r');
      if (i) s += `<line class="ar" x1="${x - GAP}" y1="45" x2="${x - 1}" y2="45" marker-end="url(#ah)"/>`;
    });
    s += note(10, 100, 'The counter should read the start number. Red = value lost.', 'start');
    const last = rows[rows.length - 1][2], where = { g: 'plain global', r: 'RTC_DATA_ATTR variable', n: 'NVS value' }[lo];
    el.querySelector('[data-out]').innerHTML = svg(720, 112, s, 'Value of the boot counter at each start for the chosen storage')
      + `<p class="wgcap"><code>${code[lo]}</code></p><p class="wgcap">After ${cut ? 'the power cut' : 'the last wake-up'} the ${where} reads <b class="${last === n ? 'good' : 'bad'}">${last}</b>. `
      + (lo === 'g' ? 'Main RAM is powered off in deep sleep, so a plain global is back at its initial value every time. In light sleep it would survive.'
        : lo === 'r' ? (cut ? 'A power cut also removes the power of the RTC domain, so the counter starts again: RTC memory survives deep sleep only.' : 'RTC memory stays powered in deep sleep, and the startup code does not clear it after a deep-sleep wake-up. It is zeroed on a cold boot.')
        : 'Flash keeps its data without power, so the count survives both. The price: a write takes time and charge, and flash wears out, so write rarely.') + '</p>';
  };
  el.addEventListener('input', draw); el.addEventListener('change', draw); draw();
}

export const widgets = { cyclelab, tickslab, survivelab };

export const realCode = `// main/night_report.c   (ESP-IDF v5.x)   stage 101: one temperature report every 10 s, then deep sleep
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_attr.h"      // RTC_DATA_ATTR
#include "esp_sleep.h"
#include "esp_system.h"
#include "esp_wifi.h"
#include "rover.h"   // rover_read_temperature(), rover_wifi_connect(), rover_wifi_send() (not shown)
                     // rover_wifi_connect() runs nvs_flash_init() (Wi-Fi needs NVS), esp_netif/event setup, esp_wifi_init(), esp_wifi_start() and esp_wifi_connect()

#define PRIO_REPORTER     2
#define REPORT_PERIOD_US  (10 * 1000 * 1000ULL)   // esp_sleep_enable_timer_wakeup() takes MICROSECONDS (the game's wakeTimer takes ms)

static const char *TAG = "night";

// RTC memory survives deep sleep; ordinary variables do not. Counting wake-ups is the usual use.
static RTC_DATA_ATTR uint32_t s_report_count;

// After a deep-sleep wake-up this runs from the first line every time: the chip has reset.
static void reporter_task(void *arg)
{
    float t = rover_read_temperature();        // the game's "x": lost on every sleep, so read it again
    ESP_ERROR_CHECK(rover_wifi_connect());     // Wi-Fi driver is not initialised after a reset: init, start, connect (about 120 ms in the game)
    ESP_ERROR_CHECK(rover_wifi_send(t));       // must come BEFORE esp_deep_sleep_start(): nothing after it runs
    s_report_count++;
    ESP_LOGI(TAG, "report %u sent, %.1f C", (unsigned)s_report_count, t);

    ESP_ERROR_CHECK(esp_wifi_stop());          // valid because rover_wifi_connect() ran esp_wifi_init()/start(); else ESP_ERR_WIFI_NOT_INIT aborts here
    ESP_ERROR_CHECK(esp_sleep_enable_timer_wakeup(REPORT_PERIOD_US));   // without a wake source the chip sleeps until reset is pressed
    esp_deep_sleep_start();                    // does not return
}

void app_main(void)
{
    // Reset reason: ESP_RST_DEEPSLEEP after a wake-up; anything else (ESP_RST_POWERON, ESP_RST_SW, ESP_RST_EXT...) means a cold start.
    ESP_LOGI(TAG, "reset reason %d, wake-up cause %d", (int)esp_reset_reason(), (int)esp_sleep_get_wakeup_cause());
    // Return value unchecked for brevity: check == pdPASS in real code.
    xTaskCreate(reporter_task, "reporter", 4096, NULL, PRIO_REPORTER, NULL);   // game stack size
    // A simple firmware could do this work directly in app_main(). The game models it as one task.
}

// Light-sleep variant (the two-star answer): no esp_deep_sleep_start(), no wake timer. Stop Wi-Fi, then delay.
//   #include "esp_pm.h"
//   esp_pm_config_t cfg = { .max_freq_mhz = 240, .min_freq_mhz = 80, .light_sleep_enable = true };
//   ESP_ERROR_CHECK(esp_pm_configure(&cfg));
//   for (;;) { read; connect; send; esp_wifi_stop(); vTaskDelay(pdMS_TO_TICKS(10000)); }

// Build notes
//   idf.py menuconfig   Component config > Power Management > Support for power management (CONFIG_PM_ENABLE)       (light sleep variant only)
//   idf.py menuconfig   Component config > FreeRTOS > Kernel > configUSE_TICKLESS_IDLE (CONFIG_FREERTOS_USE_TICKLESS_IDLE)   (light sleep variant only)
//   The ESP-IDF default tick is 100 Hz (10 ms). The game runs at 1000 Hz (1 ms). Deep sleep does not depend on the tick rate.
//   The game's numbers are rounded; measure a real board with a current meter (see section 7).
//   idf.py build flash monitor`;


export const manual = [
  ['1. Where the current goes', `<p>A battery lasts for charge, and charge is current multiplied by time. A chip that reports one number every 10 s spends nearly all of that time doing nothing. So the question is what "nothing" costs.</p>
   ${currentDia}
   <ul><li><b>Running</b> (CPU executing code): 40 mA. Real chips use roughly 30 to 70 mA, depending on clock and activity.</li>
   <li><b>Idle</b>: every task is Blocked and the idle task runs. In the game this costs 25 mA, because the CPU is still clocked.</li>
   <li><b>Wi-Fi</b>: +80 mA while the radio is started, and another +50 mA during a connect or a send. Real transmit peaks are 160 to 240 mA.</li>
   <li><b>Light sleep</b>: 0.8 mA. <b>Deep sleep</b>: 0.01 mA (10 uA). Four orders of magnitude separate the lowest and highest bars.</li>
   <li>The game uses rounded figures that follow the real ESP32 datasheet. Real values differ by board, clock and temperature.</li></ul>
   <p>The average current over a long run is what counts. A 2000 mAh pack lasts about 20 hours at 100 mA, and over 30 days at 2.5 mA.</p>
   <p>Try the numbers: how long the radio stays on, and what the chip does while it waits.</p>
   <div data-w="cyclelab"></div>
   <p><b>Your question:</b> flash the start program and read its average current. Which row of the chart accounts for most of it?</p>`],

  ['2. Idle is not sleep', `<p>A task that calls <code>vTaskDelay()</code> is Blocked and uses no CPU time. But nothing is switched off. When all tasks are Blocked, the scheduler runs the <b>idle task</b>.</p>
   ${idleDia}
   ${idleCap}
   <ul><li>The idle task waits for the next interrupt. <code>WAITI</code> (Xtensa ESP32) and <code>WFI</code> (RISC-V chips) are CPU instructions that stop the core until an interrupt arrives.</li>
   <li>The clock and the rest of the chip stay on, and the tick interrupt still fires every tick. That is the 25 mA row of the chart.</li>
   <li>The ESP-IDF idle task does <b>not</b> sleep by itself. Light sleep must be switched on with power management (section 3).</li>
   <li><b>Never wait by spinning.</b> A busy loop never blocks, so the idle task never runs and the task watchdog fires. It also costs 40 mA instead of 25 mA.</li></ul>`],

  ['3. Automatic light sleep and tickless idle', `<p><b>Light sleep</b> gates the CPU clock and most peripherals. RAM and CPU registers stay powered, so the program continues at the next instruction. Tasks, stacks and variables all survive. The cost is 0.8 mA instead of 25 mA.</p>
   ${ticklessDia}
   <ul><li>ESP-IDF enters light sleep from the idle task. You turn it on with <code>esp_pm_configure()</code> and <code>light_sleep_enable = true</code>.</li>
   <li>The kernel checks when the next task wakes. If that is far enough away, it stops the tick, sets a timer and sleeps. If not, it just waits for an interrupt.</li>
   <li>On wake-up the kernel adds the missed ticks in one step, so delays still last the right time.</li>
   <li>Game rule: <b>the simulator never light-sleeps while Wi-Fi is started.</b> A real ESP32 can, with Wi-Fi modem sleep. The game leaves that out, so the radio is the first thing to turn off.</li></ul>
   <p>Move the next wake-up closer and farther away, and see where the kernel decides to sleep:</p>
   <div data-w="tickslab"></div>
   <pre style="white-space:pre-wrap;overflow-wrap:anywhere">#include "esp_pm.h"
esp_pm_config_t cfg = {
    .max_freq_mhz = 240,           // CPU speed when something needs it
    .min_freq_mhz = 80,            // CPU speed when idle but awake
    .light_sleep_enable = true,    // the idle task may enter light sleep
};
ESP_ERROR_CHECK(esp_pm_configure(&amp;cfg));   // returns ESP_ERR_NOT_SUPPORTED if tickless idle is not enabled</pre>
   <p>Older code uses <code>esp_pm_config_esp32_t</code>, a backward-compatibility alias of the same type. The Kconfig options and the exact sleep threshold are listed under "Going further" in section 7.</p>`],

  ['4. Deep sleep: switching almost everything off', `<p><b>Deep sleep</b> turns off the CPU, the main RAM and the radios. Only the <b>RTC domain</b> stays powered: a small part of the chip with a timer, the wake-up logic and a little RTC memory. It draws about 10 uA, which is 0.01 mA in the game.</p>
   ${deepDia}
   ${deepCap}
   <pre style="white-space:pre-wrap;overflow-wrap:anywhere">esp_sleep_enable_timer_wakeup(10 * 1000 * 1000ULL);  // microseconds: 10 s
esp_deep_sleep_start();                              // never returns
// nothing written here ever runs</pre>
   <ul><li><code>esp_sleep_enable_timer_wakeup()</code> takes <b>microseconds</b>. The game's <code>wakeTimer</code> takes milliseconds. A 10 that you meant as 10 s is only 10 ms in the game.</li>
   <li><code>esp_deep_sleep_start()</code> does not return. Code after it is dead code, so send the report before it.</li>
   <li>With <b>no wake source</b>, the chip sleeps until reset or power-cycle. In the game you get one report, then silence.</li>
   <li>Call <code>esp_wifi_stop()</code> before sleeping to shut the radio down cleanly. The reset kills Wi-Fi anyway.</li></ul>`],

  ['5. Waking is a reset', `<p>The CPU was off, so there is nothing to continue. <b>The chip resets.</b> The ROM code runs, then the bootloader, then <code>app_main()</code> starts again from its first line. <code>esp_reset_reason()</code> returns <code>ESP_RST_DEEPSLEEP</code>.</p>
   ${bootDia}
   ${bootCap}
   <ul><li><b>Every task, queue and variable is gone.</b> A plain global is back at its initial value. In the game the temperature <code>x</code> is lost, so read it again after waking.</li>
   <li><b>Wi-Fi is down.</b> Each cycle pays the full connect again: 120 ms in the game, and <code>wifiSend</code> without <code>wifiConnect</code> fails.</li>
   <li><b>Boot costs time and charge.</b> The game uses 30 ms at 40 mA, which is 1.2 mA·s. A real boot takes longer.</li>
   <li>Data that must survive goes in RTC memory: <code>static RTC_DATA_ATTR uint32_t count;</code>. It keeps its value across deep sleep and is initialised on a cold boot.</li>
   <li>The program shape changes from "work, delay, repeat" to "work, sleep". The hardware does the repeat: <b>read, connect, send, stop, set the wake timer, sleep.</b></li></ul>
   <p>Pick where a boot counter lives and see what it reads after each start:</p>
   <div data-w="survivelab"></div>`],

  ['6. Light or deep: the trade-off', `<p>Both modes pay the same Wi-Fi connect and send on every report, so those costs cancel out. The difference is how the rest of the interval is spent. Light sleep costs <b>0.8 mA for every second it lasts</b>. Deep sleep costs <b>a fixed boot</b>, about 1.2 mA·s in the game, plus almost nothing while it sleeps.</p>
   ${crossDia}
   <ul><li>Over a 10 s interval, light sleep pays 0.8 mA × about 9.8 s, near 7.8 mA·s. Deep sleep pays 1.2 mA·s.</li>
   <li>The break-even is where the two costs are equal. A rough estimate is boot charge ÷ light-sleep current = 1.2 ÷ 0.8 = <b>1.5 s</b>. The chart includes the active time and lands near 1.7 s.</li>
   <li>Below the break-even interval light sleep is cheaper. Above it deep sleep is cheaper.</li>
   <li>The gap is small because the Wi-Fi connect (about 24 mA·s per report) dominates both. A design that keeps Wi-Fi associated shifts the balance a lot.</li>
   <li>Light sleep keeps your state and wakes much faster than deep sleep. If you must wake on a pin within milliseconds, light sleep is the right tool even when it is not the cheapest.</li></ul>
   <p>Move the interval and the boot time, and see which mode wins:</p>
   <div data-w="sleeplab"></div>`],

  ['7. Real hardware notes', `<ul><li><b>Dev boards sleep badly.</b> The USB-to-UART chip, the power LED and the regulator draw milliamps, which hides the 10 uA of the chip. Use a low-power board or measure the bare module.</li>
   <li><b>Wi-Fi modem sleep.</b> A connected station can switch the radio off between beacons (<code>esp_wifi_set_ps(WIFI_PS_MIN_MODEM)</code> or <code>WIFI_PS_MAX_MODEM</code>). This avoids the 120 ms reconnect but costs a few mA continuously. Reconnecting every 10 s is one design; staying associated is another.</li>
   <li><b>Wake sources.</b> Timer, GPIO (<code>ext0</code> on one RTC pin, <code>ext1</code> on several), touch pad, ULP coprocessor (a tiny CPU that runs while the main cores sleep). <code>esp_sleep_get_wakeup_cause()</code> says which one fired.</li>
   <li><b>Game simplifications:</b> the 120 ms connect is paid every time, boot is 30 ms instead of 100 to 300 ms, the mA values are rounded, and the game tick is 1 ms (ESP-IDF default 10 ms).</li></ul>
   <p>Which wake-up sources need which part of the chip to stay powered in deep sleep:</p>
   ${wakeDia}
   ${wakeCap}
   <h4>Going further</h4>
   <ul><li><b>Light sleep switches.</b> Menuconfig: <code>CONFIG_PM_ENABLE</code> and <code>CONFIG_FREERTOS_USE_TICKLESS_IDLE</code>.</li>
   <li><b>Sleep threshold.</b> <code>CONFIG_FREERTOS_IDLE_TIME_BEFORE_SLEEP</code> is the smallest wake-up distance, in ticks, that is worth sleeping for. The minimum is 2. The default is 3. The game fixes it at 3 ticks, which is 3 ms at 1000 Hz. So the game sleeps a little more eagerly than a real board.</li>
   <li><b>Wi-Fi error codes after a reset.</b> <code>esp_wifi_*</code> calls return <code>ESP_ERR_WIFI_NOT_INIT</code> until <code>esp_wifi_init()</code> and <code>esp_wifi_start()</code> run again. On an initialised but disconnected station, <code>esp_wifi_sta_get_ap_info()</code> returns <code>ESP_ERR_WIFI_NOT_CONNECT</code>.</li>
   <li><b>Measuring boot time.</b> Log levels, image validation, flash mode and speed, and secure boot all change it. ESP-IDF's <code>system/startup_time</code> example, tuned for the fastest start, prints its first app log at about 37 ms. Read the timestamp of your first <code>app_main()</code> log line to measure your own board. <code>CONFIG_BOOTLOADER_SKIP_VALIDATE_IN_DEEP_SLEEP</code> shortens the wake from deep sleep.</li>
   <li><b>Task watchdog.</b> A spinning task triggers <code>E (xxx) task_wdt: Task watchdog got triggered</code> after <code>CONFIG_ESP_TASK_WDT_TIMEOUT_S</code> (5 s by default).</li>
   <li><b>RTC data on a cold boot.</b> The bootloader reloads RTC data and the startup code clears RTC bss, unless the reset reason is a deep-sleep wake-up. <code>esp_sleep_get_wakeup_cause()</code> returns <code>ESP_SLEEP_WAKEUP_TIMER</code> after a timer wake-up and <code>ESP_SLEEP_WAKEUP_UNDEFINED</code> after power-on.</li>
   <li><b>Faster Wi-Fi after a wake-up.</b> Keep the channel and the access point's address (BSSID) in RTC memory and pass them to the connect call. The game does not model it.</li></ul>`],
];

export const quiz = [
  { q: 'The start program idles with Wi-Fi started and draws far more than the 40 mA gate. Which single change removes the most current?', opts: ['Lower the priority of the reporter task', 'Make the stack of the reporter task smaller', 'Stop Wi-Fi before the delay'], a: 2, why: 'The radio adds 80 mA while it is started. Priority and stack size change nothing about what the chip draws.', wrong: ["Priority only decides which ready task runs. The radio draws its current whatever priority the reporter has.", "Stack size is reserved RAM and draws no current by itself, so a smaller stack changes nothing on the supply.", null] },
  { q: 'Wi-Fi is stopped and the task waits with vTaskDelay(10000), but no power management is configured. What does the chip draw while it waits?', opts: ['About 0.8 mA: Blocked tasks put the chip into light sleep', 'About 25 mA: the idle task waits for interrupts at full clock', 'About 0.01 mA: an idle CPU powers itself down'], a: 1, why: 'A Blocked task only gives up the CPU. The idle task runs and waits for an interrupt, with the clock on. Light sleep needs power management; deep sleep needs a call.', wrong: ["Blocked tasks only give up the CPU. Light sleep has to be switched on with power management, and without it the idle task does not sleep.", null, "A CPU waiting for an interrupt is not powered down. Deep sleep starts only when the program calls esp_deep_sleep_start()."] },
  { q: 'Automatic light sleep is enabled. Every task is Blocked and the next wake-up is 2 ticks away. What does the idle task do?', opts: ['It waits for an interrupt at full clock: the wake-up is closer than the threshold', 'Light sleep, because there is nothing to do', 'Deep sleep, because the CPU is idle'], a: 0, why: 'The kernel only sleeps when the next wake-up is far enough away (the game fixes it at 3 ticks). A shorter sleep costs more in switching than it saves.', wrong: [null, "Entering light sleep has a cost, so the kernel only does it when the next wake-up is far enough away. Two ticks is under the threshold.", "Deep sleep is never chosen by the idle task. It needs an explicit call and ends in a reset, so it cannot be an automatic choice."] },
  { q: 'What does esp_deep_sleep_start() do when the program calls it?', opts: ['It returns after the wake timer fires', 'It returns an error if no wake source is set', 'It does not return: the chip resets at wake-up and app_main() runs from the start'], a: 2, why: 'Deep sleep powers off the CPU and main RAM. The wake-up is a reset, so the call never returns and any code after it is dead. With no wake source the chip stays asleep until reset.', wrong: ["Returning would need the CPU state and RAM to be kept, and deep sleep powers both off. The wake-up is a reset.", "This call does not hand an error back to the caller. With no wake source the chip simply sleeps until a reset or power-cycle.", null] },
  { q: 'A rover reports every 60 s and keeps a report counter in a plain global. Which design keeps the count correct?', opts: ['Deep sleep with the counter in a plain global', 'Deep sleep with the counter declared RTC_DATA_ATTR (or light sleep with a plain global)', 'Deep sleep, and copy the counter into a queue before sleeping'], a: 1, why: 'Deep sleep resets the chip and clears main RAM, so a plain global restarts at 0 and a queue is gone. RTC memory survives deep sleep. Light sleep keeps all of RAM.', wrong: ["A plain global lives in main RAM, which deep sleep powers off. After the wake-up reset it is back at its initial value.", null, "A queue is also in main RAM and is gone after the reset, so copying the counter into it before sleeping saves nothing."] },
  { q: 'The report interval is 1 s instead of 10 s. Which mode costs less in this model, and why?', opts: ['Light sleep: the boot charge of deep sleep is bigger than light sleep would cost for 1 s', 'Deep sleep: it always draws less', 'They cost the same: the Wi-Fi connect dominates'], a: 0, why: 'Boot costs about 1.2 mA·s. Light sleep for the rest of a 1 s cycle costs about 0.7 mA·s. Break-even is near 1.5 to 1.7 s, so below that light sleep wins.', wrong: [null, "Deep sleep draws almost nothing while it sleeps, but that is only part of the cost: every wake-up pays a boot, and a word like always ignores it.", "The Wi-Fi connect is the same in both modes and cancels out. What differs is how the rest of the interval is paid for, so the costs are not the same."] },
  { q: 'A bumper must wake the rover within a few milliseconds and the task must keep its state. The report interval is 5 min. Which mode fits?', opts: ['Deep sleep with a timer only: it is the cheapest', 'Deep sleep with an ext0 pin wake-up: the chip boots fast enough', 'Light sleep with a GPIO wake-up: state survives and the wake-up is fast'], a: 2, why: 'Light sleep keeps RAM and wakes quickly. Deep sleep with ext0 can wake on a pin, but the chip resets: a boot takes tens to hundreds of ms and RAM is lost. A timer-only deep sleep never sees the bumper.', wrong: ["A timer-only wake source cannot notice a bumper, which is a pin event. Deep sleep also loses the task state.", "A pin can wake deep sleep, but the wake-up is a reset. The boot takes tens to hundreds of ms and RAM, including the task state, is lost.", null] },
];
