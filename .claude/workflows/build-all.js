export const meta = {
  name: 'build-all',
  description: 'Build a range of RTOS Quest stages with two overlapping chains: designs run ahead, theory and dialogue for every stage run in parallel, builds follow in order',
  whenToUse: 'Building several consecutive stages. Pass args: { from: 6, to: 14 }. Faster than one build-stage run per stage because only the parts that share files are serialised.',
  phases: [
    { title: 'Design', detail: 'one stage after another, each from the previous spec', model: 'sonnet' },
    { title: 'Content', detail: 'theory (sonnet) and dialogue (haiku) for every designed stage, in parallel across stages' },
    { title: 'Facts', detail: 'one fact check per stage, corrections applied once', model: 'sonnet' },
    { title: 'Build', detail: 'lesson code in stage order, loops on the verifier', model: 'sonnet' },
    { title: 'Verify', detail: 'verifier after each build', model: 'haiku' },
    { title: 'Repair', detail: 'only if a build is red; the third round escalates the model' },
  ],
}
// What can run in parallel, and what cannot:
//   - a design needs only the previous stage's spec, so designs form a chain that runs ahead of the builds
//   - theory and dialogue need only their own spec and write their own files, so they run in parallel across stages
//   - a build needs the previous stage built (it registers in shared files and its start code inherits), so builds are a chain
const from = Number(args && args.from), to = Number(args && args.to)
if (!from || !to || to < from) throw new Error('Pass args: { from: <first stage>, to: <last stage> }')
const root = (args && args.root) || '.'
const stages = []; for (let s = from; s <= to; s++) stages.push(s)
const nn = s => String(s).padStart(2, '0')

const MODEL = { 'stage-designer': 'sonnet', 'theory-author': 'sonnet', 'copy-writer': 'haiku', 'stage-builder': 'sonnet', 'stage-verifier': 'haiku', 'fact-checker': 'sonnet' }
const run = (prompt, opts) => {
  const { agentType, ...rest } = opts
  return agent(`You are the "${agentType}" agent for the project in ${root}. Work in that directory and use paths relative to it. First read ${root}/.claude/agents/${agentType}.md and follow it exactly: it defines your role, reading list, rules and what to report.\n\nTask: ${prompt}`, { model: MODEL[agentType], ...rest })
}
const DESIGN = { type: 'object', properties: { title: { type: 'string' }, summary: { type: 'string' }, risks: { type: 'array', items: { type: 'string' } } }, required: ['title', 'summary'] }
const BUILD = { type: 'object', properties: { green: { type: 'boolean' }, output: { type: 'string' } }, required: ['green', 'output'] }
// verifierPassed is the only thing that decides red or green here: both verifier commands exited 0. Free-text failure lines are for the report.
const VERIFY = { type: 'object', properties: { verifierPassed: { type: 'boolean' }, green: { type: 'boolean' }, failures: { type: 'array', items: { type: 'string' } } }, required: ['verifierPassed', 'failures'] }
const FACTS = { type: 'object', properties: { issues: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['blocking', 'should-fix', 'unverified'] }, quote: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' }, source: { type: 'string' } }, required: ['severity', 'quote', 'problem'] } } }, required: ['issues'] }
const slugOf = title => String(title).toLowerCase().replace(/\(.*?\)/g, '').replace(/^stage\s*\d+\s*(spec)?\s*(written)?\s*[:.\-]?\s*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const designed = (args && args.designed) || {}   // { 12: 'Pathfinder' }: stages whose spec already exists

// one promise per stage that the design chain resolves and the build chain awaits
const ready = {}, release = {}
for (const s of stages) ready[s] = new Promise(r => { release[s] = r })
let abort = false
const report = {}

async function content(s, slug) {   // everything about a stage that touches only its own content files
  const spec = `specs/stage-${nn(s)}.md`
  await parallel([
    () => run(`Write src/lessons/${slug}.content.js for stage ${s} from ${spec}. Use src/lessons/steady-pulse.content.js as the pattern. Put any new widget in your own file as the exported "widgets" object.`, { agentType: 'theory-author', phase: 'Content', label: `theory ${nn(s)}` }),
    () => run(`Write src/lessons/${slug}.copy.js for stage ${s} from ${spec}.`, { agentType: 'copy-writer', phase: 'Content', label: `dialogue ${nn(s)}` }),
  ])
  const facts = await run(`Fact-check src/lessons/${slug}.content.js.`, { agentType: 'fact-checker', schema: FACTS, phase: 'Facts', label: `facts ${nn(s)}` })
  const issues = (facts && facts.issues) || [], fix = issues.filter(i => i.severity !== 'unverified')
  if (fix.length) await run(`Correct these facts in src/lessons/${slug}.content.js. Change only the quoted sentences and anything that depends on them, and remove any VERIFY comment you resolve.\n${JSON.stringify(fix, null, 1)}`, { agentType: 'theory-author', phase: 'Facts', label: `fix facts ${nn(s)}` })
  return { corrected: fix.length, unverified: issues.filter(i => i.severity === 'unverified').map(i => `${i.quote}`.slice(0, 160)) }
}

const designChain = (async () => {
  for (const s of stages) {
    if (abort) { release[s](null); continue }
    if (designed[s]) { const slug = slugOf(designed[s]); log(`Stage ${nn(s)}: using the existing spec, files src/lessons/${slug}.*`); release[s]({ slug, title: designed[s], content: content(s, slug) }); continue }
    const d = await run(`Design stage ${s} of RTOS Quest and write specs/stage-${nn(s)}.md. Follow your instructions exactly, including measuring every threshold and the chart readability on the simulator. Reply with title set to exactly the stage title from JOURNEY, nothing else in that field.`, { agentType: 'stage-designer', schema: DESIGN, phase: 'Design', label: `design ${nn(s)}` })
    if (!d) { abort = true; release[s](null); continue }
    const slug = slugOf(d.title)
    log(`Stage ${nn(s)} designed: "${d.title}" -> src/lessons/${slug}.*${d.risks && d.risks.length ? ' | risks: ' + d.risks.join(' | ').slice(0, 200) : ''}`)
    release[s]({ slug, title: d.title, content: content(s, slug) })   // content starts now and is not awaited here
  }
})()

const buildChain = (async () => {
  for (const s of stages) {
    const d = await ready[s]
    if (!d) { report[s] = { stage: s, error: 'not designed' }; continue }
    if (abort) { report[s] = { stage: s, title: d.title, skipped: 'an earlier stage is red' }; continue }
    const facts = (await d.content.catch(() => null)) || { corrected: 0, unverified: ['content step failed'] }
    let b = await run(`Implement stage ${s} (slug ${d.slug}) from specs/stage-${nn(s)}.md. The content and copy files already exist. Loop on the verifier until green or until your stop rule applies.`, { agentType: 'stage-builder', schema: BUILD, phase: 'Build', label: `build ${nn(s)}` })
    let v = await run(`Verify stage ${s}.`, { agentType: 'stage-verifier', schema: VERIFY, phase: 'Verify', label: `verify ${nn(s)}` })
    let round = 0
    const red = () => v && v.verifierPassed ? [] : ((v && v.failures) || ['the verifier agent did not report'])
    while (round < 3 && (!v || red().length || !(b && b.green))) {
      round++
      log(`Stage ${nn(s)} repair round ${round}${round === 3 ? ' (escalated)' : ''}`)
      b = await run(`Stage ${s} (slug ${d.slug}) fails the verifier. Fix the cause, not the test. Failures:\n${(red().length ? red() : [(b && b.output) || 'the build did not report green']).join('\n').slice(0, 3000)}`, { agentType: 'stage-builder', schema: BUILD, phase: 'Repair', label: `fix ${nn(s)} r${round}`, ...(round === 3 ? { model: 'opus' } : {}) })
      v = await run(`Verify stage ${s}.`, { agentType: 'stage-verifier', schema: VERIFY, phase: 'Verify', label: `verify ${nn(s)} r${round}` })
    }
    const green = !!v && !red().length
    report[s] = { stage: s, title: d.title, slug: d.slug, green, repairRounds: round, verifierFailures: red(), otherChecks: v && v.verifierPassed ? ((v.failures) || []).slice(0, 4).map(f => String(f).slice(0, 200)) : [], factsCorrected: facts.corrected, unverifiedFacts: facts.unverified }
    log(`Stage ${nn(s)} "${d.title}": ${green ? 'green' : 'RED'} after ${round} repair round(s)`)
    if (!green) abort = true   // later stages inherit this one's firmware
  }
})()

await Promise.all([designChain, buildChain])
return { built: stages.map(s => report[s] || { stage: s, error: 'no result' }), stoppedEarly: abort }
