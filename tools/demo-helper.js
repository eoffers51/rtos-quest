// Test helper for playing a stage through the real page (used from the browser console or an automation tool):
//   const H = (await import('/tools/demo-helper.js')).H;  await H.enter();  await H.theory();  await H.go('label', out, ['task']);
// It only drives the same controls a player uses: clicks, selects and inputs in the editor and the theory pages.
const sl = ms => new Promise(r => setTimeout(r, ms)), q = s => document.querySelector(s), ev = (el, t) => el.dispatchEvent(new Event(t, { bubbles: true }));
const G = () => window.__game;

/** layout problems of one widget or diagram container: bad numbers, text cut off or overlapping, sideways scroll */
function audit(w) {
  const bad = [];
  if (/NaN|undefined|Infinity/.test(w.innerText)) bad.push('BADTEXT:' + w.innerText.match(/.{0,30}(NaN|undefined|Infinity).{0,20}/)[0]);
  w.querySelectorAll('svg').forEach(s => {
    const r = s.getBoundingClientRect(); if (!r.width) return;
    const T = [...s.querySelectorAll('text')].filter(t => t.textContent.trim()), B = T.map(t => t.getBoundingClientRect());
    T.forEach((t, a) => { const b = B[a]; if (b.width && (b.left < r.left - 1 || b.right > r.right + 1 || b.top < r.top - 1 || b.bottom > r.bottom + 1)) bad.push('CUT:' + t.textContent.slice(0, 30)); });
    for (let a = 0; a < T.length; a++) for (let b = a + 1; b < T.length; b++) { const A = B[a], C = B[b]; if (A.width && C.width && A.left < C.right - 3 && C.left < A.right - 3 && A.top < C.bottom - 3 && C.top < A.bottom - 3) bad.push('OVERLAP:' + T[a].textContent.slice(0, 20) + '~' + T[b].textContent.slice(0, 20)); }
  });
  if (w.scrollWidth > w.clientWidth + 4) bad.push('HSCROLL');
  return bad;
}

export const H = {
  sl, q, ev, audit,
  idx: n => G().prog.units.findIndex(u => u.name === n),
  U: n => document.querySelector('#editor .unit[data-u="' + H.idx(n) + '"]'),
  code: n => H.idx(n) < 0 ? '(none)' : G().prog.units[H.idx(n)].code.map(c => (c.fn || c.op) + (c.to !== undefined ? '(' + c.to + ')' : '') + (c.ms ? c.ms : '') + (c.task ? '>' + c.task : '') + (c.clear !== undefined ? '/clear' + c.clear : '')).join(','),
  /** leave the title screen; returns the stage and inherited firmware */
  async enter() {
    await sl(1500); const b = q('#title button'); if (!q('#title').hidden && b) { b.click(); await sl(2800); }
    return 'stage ' + q('#mNum').textContent + ' ' + q('#mTitle').textContent + ' | theory open ' + !q('#manual').hidden + ' ' + q('#manProg').textContent
      + '\nunits: ' + G().prog.units.map(u => u.name + '(' + (u.kind === 'task' ? 'p' + u.prio + ',s' + u.stack + (u.core !== undefined && G().L.cores > 1 ? ',c' + u.core : '') : u.kind) + ')').join(', ') + '\nobjs: ' + JSON.stringify(G().prog.objs);
  },
  /** walk every theory section: operate every widget control, answer each check wrongly then rightly */
  async theory() {
    const out = [], errs = []; window.addEventListener('error', e => errs.push(e.message));
    if (q('#manual').hidden) { q('#openManual').click(); await sl(500); }
    const body = q('#manBody'), cur = () => [...body.children].find(c => !c.hidden), navs = [...document.querySelectorAll('#manNav > *')];
    for (let i = 0; i < navs.length; i++) {
      navs[i].click(); await sl(300); const sec = cur(), wr = [];
      for (const w of sec.querySelectorAll('[data-w]')) {
        if (!w.dataset.w) continue;
        const probs = new Set(audit(w)), n = w.querySelectorAll('input,select,button').length, ctl = k => [...w.querySelectorAll('input,select,button')][k];
        for (let k = 0; k < n; k++) {
          const c = ctl(k); if (!c) continue;
          if (c.tagName === 'SELECT') for (const o of [...c.options]) { c.value = o.value; ev(c, 'input'); ev(c, 'change'); await sl(50); audit(w).forEach(x => probs.add(o.value + '>' + x)); }
          else if (c.type === 'range') for (const v of [c.min, c.max, (+c.min + +c.max) / 2]) { c.value = v; ev(c, 'input'); ev(c, 'change'); await sl(50); audit(w).forEach(x => probs.add('r' + v + '>' + x)); }
          else if (c.tagName === 'BUTTON') for (let m = 0; m < 3; m++) { const bb = ctl(k); if (bb && !bb.disabled) bb.click(); await sl(200); audit(w).forEach(x => probs.add('btn>' + x)); }
          else if (c.type === 'checkbox') { c.click(); await sl(50); audit(w).forEach(x => probs.add('cb>' + x)); }
        }
        wr.push(w.dataset.w + '(' + n + 'ctl): ' + ([...probs].slice(0, 5).join(' ; ') || 'ok'));
      }
      const stat = audit(sec).filter(x => !/HSCROLL/.test(x));
      const qz = sec.querySelector('.quiz'); let qr = 'no check';
      if (qz) { const a = G().L.quiz[i].a, btns = [...qz.querySelectorAll('button')]; btns.find(b => +b.dataset.j !== a).click(); await sl(120); const w = qz.querySelector('.qw').textContent; btns.find(b => +b.dataset.j === a).click(); await sl(120); qr = 'wrong-> ' + w.slice(0, 80); }
      out.push('S' + (i + 1) + ' ' + sec.querySelector('h2,h3,h4').textContent.slice(0, 50) + ' | words ' + sec.innerText.split(/\s+/).length + ' svg ' + sec.querySelectorAll('svg').length + (stat.length ? ' STATIC[' + stat.slice(0, 3).join(';') + ']' : '') + ' | ' + wr.join(' || ') + ' | ' + qr);
    }
    out.push('progress ' + q('#manProg').textContent + ' | js errors: ' + (errs.join(' | ') || 'none'));
    return out.join('\n');
  },
  /** close the theory and read the whole briefing */
  async briefing() {
    if (!q('#manual').hidden) { q('#closeManual').click(); await sl(700); }
    const br = []; for (let i = 0; i < 16 && !q('#brief').hidden; i++) { br.push(q('#brief .btext').textContent); q('#bNext').click(); await sl(120); }
    return 'briefing: ' + br.join(' // ');
  },
  async flights() { const fl = []; for (let i = 0; i < 6 && !q('#dialog').hidden; i++) { q('#dialog').click(); await sl(80); fl.push(q('#dtext').textContent); q('#dialog').click(); await sl(150); } return fl.filter((x, i, a) => !a[i + 1] || !a[i + 1].startsWith(x)).join(' // '); },
  goals: () => [...document.querySelectorAll('#goals > li.no')].map(l => l.innerText.replace(/\n+/g, ' ').slice(0, 130)).join(' | ') || '(all met)',
  async close() { if (!q('#result').hidden) { [...document.querySelectorAll('#result button')].find(b => /KEEP|STAY/i.test(b.textContent)).click(); await sl(200); } },
  /** FLASH & RUN at instant speed and report what the player sees */
  async go(label, o, names) {
    q('#speed').value = '0'; ev(q('#speed'), 'change'); q('#run').click(); await sl(3300);
    const f = await H.flights(), K = G().runSim(G().L, JSON.parse(JSON.stringify(G().prog))), { evidenceOf } = await import('/src/timeline.js');
    const call = []; G().prog.units.forEach((u, ui) => u.code.forEach((ins, li) => { if (ins.op !== 'call') return; const s = document.querySelector('#editor .unit[data-u="' + ui + '"] li[data-l="' + li + '"] select[data-k=fn]'); if (!s || s.value !== ins.fn) call.push(u.name + ':' + ins.fn); }));
    o.push(label + ' [' + (names || []).map(n => n + ': ' + H.code(n)).join(' | ') + ']\n   unmet: ' + H.goals().slice(0, 330) + '\n   Flight: ' + (f.slice(0, 520) || '(none)') + '\n   evidence: ' + JSON.stringify(evidenceOf(K, G().L)).slice(0, 260)
      + '\n   serial errs: ' + [...document.querySelectorAll('#serial .e')].slice(0, 2).map(e => e.textContent.slice(0, 120)).join(' | ')
      + '\n   result: ' + (q('#result').hidden ? '-' : q('#result').innerText.split('\n')[1] + ', top stars ' + q('#stars').textContent + ', cpu ' + K.m.cpu + ' ram ' + K.m.ram) + (call.length ? '\n   EDITOR SHOWS WRONG FUNCTION: ' + call.join(',') : ''));
    await H.close();
  },
  async add(n, op) { const s = H.U(n).querySelector('[data-add]'); s.value = op; ev(s, 'change'); await sl(180); },
  async up(n, l, times = 1) { for (let i = 0; i < times; i++) { H.U(n).querySelector('li[data-l="' + (l - i) + '"] [data-act=up]').click(); await sl(120); } },
  async del(n, l) { H.U(n).querySelector('li[data-l="' + l + '"] [data-act=del]').click(); await sl(120); },
  async set(n, l, k, v) { const s = H.U(n).querySelector('li[data-l="' + l + '"] [data-k=' + k + ']'); s.value = v; ev(s, 'input'); ev(s, 'change'); await sl(120); },
  opts: (n, l) => [...H.U(n).querySelectorAll('li[data-l="' + l + '"] select')].map(s => s.dataset.k + '=' + s.value + '{' + [...s.options].map(o => o.value).join('|') + '}').join(' '),
  async create(n, k, v) { const row = [...document.querySelectorAll('#editor .ln[data-u]')].find(r => r.textContent.includes('"' + n + '"')); const inp = row.querySelector('[data-uk=' + k + ']'); inp.value = v; ev(inp, 'input'); ev(inp, 'change'); await sl(120); },
  async rename(n, to) { const i = H.U(n).querySelector('[data-uk=name]'); i.value = to; ev(i, 'input'); ev(i, 'change'); await sl(150); },
  async newTask(name) { q('#addTask').click(); await sl(400); const u = G().prog.units[G().prog.units.length - 1]; if (name) await H.rename(u.name, name); },
  async obj(name, key, v) { const i = document.querySelector('#editor [data-o="' + name + '"][data-ok="' + key + '"]'); i.value = v; ev(i, 'input'); ev(i, 'change'); await sl(150); },
  async delObj(name) { const b = () => document.querySelector('#editor [data-act=delobj][data-k="' + name + '"]'); b().click(); await sl(100); const t = b() ? b().textContent : ''; if (b() && b().dataset.arm) { b().click(); await sl(150); } return t; },
  objLines: () => [...document.querySelectorAll('#editor .unit:first-child .ln')].filter(l => !l.dataset.u).map(l => l.innerText.replace(/\s+/g, ' ')).join(' ## '),
};
