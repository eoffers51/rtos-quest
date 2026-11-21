export const meta = {
  name: 'build-stage',
  description: 'Build one RTOS Quest stage with a cheap-model-first agent team and a simulator-backed verify loop',
  whenToUse: 'Adding one new stage (lesson) to the game. Pass args: { stage: 3 }; main stages must be built in order. For a stand-alone side mission on another topic pass { stage: 101, brief: "what it should teach" }.',
  phases: [
    { title: 'Design', detail: 'spec with numbers measured on the simulator', model: 'sonnet' },
    { title: 'Content', detail: 'theory (sonnet) and dialogue (haiku) in parallel' },
    { title: 'Build', detail: 'lesson code, loops on the verifier', model: 'sonnet' },
    { title: 'Check', detail: 'verifier (haiku) and fact check (sonnet) in parallel' },
    { title: 'Repair', detail: 'targeted fixes; the third round escalates the model' },
  ],
}

const stage = Number(args && args.stage)
if (!stage) throw new Error('Pass args: { stage: <number> }')
const nn = String(stage).padStart(2, '0')
const root = (args && args.root) || '.'
// Role files in .claude/agents/ are the single source of truth. Each agent is told to read its own file, and its
// model is set here, so the workflow also runs in sessions where those agent types are not registered.
const MODEL = { 'stage-designer': 'sonnet', 'theory-author': 'sonnet', 'copy-writer': 'haiku', 'stage-builder': 'sonnet', 'stage-verifier': 'haiku', 'fact-checker': 'sonnet' }
const run = (prompt, opts) => {
  const { agentType, ...rest } = opts
  return agent(`You are the "${agentType}" agent for the project in ${root}. Work in that directory and use paths relative to it. First read ${root}/.claude/agents/${agentType}.md and follow it exactly: it defines your role, reading list, rules and what to report.\n\nTask: ${prompt}`, { model: MODEL[agentType], ...rest })
}
const spec = `specs/stage-${nn}.md`
const side = stage > 100
const brief = side ? ` This is a SIDE MISSION (see "Side missions" in the lesson contract): stand-alone, registered in SIDE, id ${stage}. Brief from the user: ${(args && args.brief) || 'none given'}` : ''

const DESIGN = { type: 'object', properties: { slug: { type: 'string' }, title: { type: 'string' }, summary: { type: 'string' }, risks: { type: 'array', items: { type: 'string' } } }, required: ['slug', 'title', 'summary'] }
const BUILD = { type: 'object', properties: { green: { type: 'boolean' }, output: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } }, required: ['green', 'output'] }
const VERIFY = { type: 'object', properties: { green: { type: 'boolean' }, failures: { type: 'array', items: { type: 'string' } } }, required: ['green', 'failures'] }
const FACTS = { type: 'object', properties: { issues: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['blocking', 'should-fix', 'unverified'] }, quote: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' }, source: { type: 'string' } }, required: ['severity', 'quote', 'problem'] } } }, required: ['issues'] }

phase('Design')
const design = await run(`Design stage ${stage} of RTOS Quest and write ${spec}. Follow your instructions exactly, including measuring every threshold on the simulator.${brief}`, { agentType: 'stage-designer', schema: DESIGN, label: `design stage ${nn}` })
if (!design) throw new Error('The designer returned nothing; no spec to build from.')
// The slug is derived from the title here, in one place, so every agent names its files the same way.
const slug = String(design.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
log(`Stage ${nn}: "${design.title}", files src/lessons/${slug}.*`)
if (design.risks && design.risks.length) log(`Open design risks: ${design.risks.join(' | ')}`)

phase('Content')
await parallel([
  () => run(`Write src/lessons/${slug}.content.js for stage ${stage} from ${spec}.${side ? ' Side mission: use src/lessons/steady-pulse.content.js as the structural pattern.' : ''}`, { agentType: 'theory-author', phase: 'Content', label: 'theory' }),
  () => run(`Write src/lessons/${slug}.copy.js for stage ${stage} from ${spec}.`, { agentType: 'copy-writer', phase: 'Content', label: 'dialogue' }),
])

phase('Build')
let build = await run(`Implement stage ${stage} (slug ${slug}) from ${spec}. The content and copy files already exist.${side ? ' Side mission: register it in SIDE, set side: true and adds.' : ''} Loop on the verifier until green or until your stop rule applies.`, { agentType: 'stage-builder', schema: BUILD, label: `build stage ${nn}` })

const check = facts => parallel([
  () => run(`Verify stage ${stage}.`, { agentType: 'stage-verifier', schema: VERIFY, phase: 'Check', label: 'verifier' }),
  () => facts ? run(`Fact-check src/lessons/${slug}.content.js.`, { agentType: 'fact-checker', schema: FACTS, phase: 'Check', label: 'fact check' }) : Promise.resolve({ issues: [] }),
])
// Only blocking facts keep the repair loop going. A full re-check always finds new nitpicks, so should-fix
// items are corrected once, in the same pass, and are not a reason to check again.
const blocking = f => ((f && f.issues) || []).filter(i => i.severity === 'blocking')
const mustFix = f => ((f && f.issues) || []).filter(i => i.severity !== 'unverified')
let polished = false

phase('Check')
let [verdict, facts] = await check(true)
let round = 0
while (round < 3 && (!(verdict && verdict.green) || blocking(facts).length || (!polished && mustFix(facts).length))) {
  round++
  phase('Repair')
  const escalate = round === 3 ? { model: 'opus' } : {}   // strong model only when two cheap rounds failed
  log(`Repair round ${round}${round === 3 ? ' (escalated)' : ''}: verifier ${verdict && verdict.green ? 'green' : 'red'}, ${mustFix(facts).length} fact issue(s)`)
  const hadFacts = mustFix(facts).length > 0
  const hadBlocking = blocking(facts).length > 0
  polished = true
  await parallel([
    () => verdict && verdict.green ? Promise.resolve(null) : run(`Stage ${stage} (slug ${slug}) fails the verifier. Fix the cause, not the test. Failures:\n${((verdict && verdict.failures) || ['verifier did not report']).join('\n')}`, { agentType: 'stage-builder', schema: BUILD, phase: 'Repair', label: `fix code r${round}`, ...escalate }),
    () => hadFacts ? run(`Correct these facts in src/lessons/${slug}.content.js. Change only the quoted sentences and anything that depends on them.\n${JSON.stringify(mustFix(facts), null, 1)}`, { agentType: 'theory-author', phase: 'Repair', label: `fix facts r${round}`, ...escalate }) : Promise.resolve(null),
  ])
  const recheck = await check(hadBlocking)    // facts are re-checked only after a blocking error was corrected
  verdict = recheck[0]
  if (hadBlocking) facts = recheck[1]
  else if (hadFacts) facts = { issues: ((facts && facts.issues) || []).filter(i => i.severity === 'unverified') }
}

const green = !!(verdict && verdict.green) && blocking(facts).length === 0
return {
  stage, slug, title: design.title, green, repairRounds: round,
  verifierFailures: green ? [] : (verdict && verdict.failures) || [],
  openFacts: mustFix(facts),
  unverifiedFacts: ((facts && facts.issues) || []).filter(i => i.severity === 'unverified'),
  next: green ? 'Open the stage in the browser once: flash the start code, press SOLVE, click every widget in the field manual.' : 'Still red after three rounds. Read the failures and decide with the user.',
}
