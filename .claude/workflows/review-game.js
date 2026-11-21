export const meta = {
  name: 'review-game',
  description: 'Learning-design review of the whole game and each lesson, then one bounded round that applies the accepted proposals and re-verifies',
  whenToUse: 'After new stages are built, or to raise teaching quality. Pass args: { lessons: [1, 2, 3, 101] }. Add apply: false for a review only, or mode: "visual" to review only what is on screen (screenshots).',
  phases: [
    { title: 'Capture', detail: 'screenshots of every screen, for the reviewers to look at', model: 'haiku' },
    { title: 'Review', detail: 'one reviewer for the game, one per lesson, in parallel', model: 'sonnet' },
    { title: 'Apply lesson changes', detail: 'objectives, hints and dialogue, one builder per lesson', model: 'sonnet' },
    { title: 'Apply theory changes', detail: 'manual, diagrams, widgets, questions; one lesson at a time', model: 'sonnet' },
    { title: 'Verify', detail: 'verifier on every stage', model: 'haiku' },
  ],
}

const lessons = (args && args.lessons) || []
if (!lessons.length) throw new Error('Pass args: { lessons: [1, 2, ...] }')
const root = (args && args.root) || '.'
const apply = !(args && args.apply === false)
// Which severities are applied automatically. Low-severity polish is reported, not applied: it is where loops go to die.
const ACCEPT = (args && args.accept) || ['high', 'medium']

const MODEL = { 'learning-reviewer': 'sonnet', 'theory-author': 'sonnet', 'stage-builder': 'sonnet', 'stage-verifier': 'haiku' }
const run = (prompt, opts) => {
  const { agentType, ...rest } = opts
  return agent(`You are the "${agentType}" agent for the project in ${root}. Work in that directory and use paths relative to it. First read ${root}/.claude/agents/${agentType}.md and follow it exactly: it defines your role, reading list, rules and what to report.\n\nTask: ${prompt}`, { model: MODEL[agentType], ...rest })
}
const FINDING = { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['high', 'medium', 'low'] }, owner: { type: 'string', enum: ['lesson', 'copy', 'theory', 'ui'] }, where: { type: 'string' }, problem: { type: 'string' }, principle: { type: 'string' }, change: { type: 'string' }, effort: { type: 'string', enum: ['S', 'M', 'L'] } }, required: ['id', 'severity', 'owner', 'where', 'problem', 'change'] }
const REVIEW = { type: 'object', properties: { verdict: { type: 'string' }, keep: { type: 'array', items: { type: 'string' } }, findings: { type: 'array', items: FINDING } }, required: ['verdict', 'findings'] }
const DONE = { type: 'object', properties: { applied: { type: 'array', items: { type: 'string' } }, skipped: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, why: { type: 'string' } }, required: ['id', 'why'] } }, green: { type: 'boolean' } }, required: ['applied', 'skipped'] }
const VERIFY = { type: 'object', properties: { verifierPassed: { type: 'boolean' }, green: { type: 'boolean' }, failures: { type: 'array', items: { type: 'string' } } }, required: ['verifierPassed', 'failures'] }

const visual = !!(args && args.mode === 'visual')
phase('Capture')
const shots = await agent(`In ${root}, run exactly this command with Bash and wait for it to finish (it can take several minutes): tools/shots.sh ${lessons.join(' ')}\nThen run: ls reviews/shots\nReply with the list of files and any line that starts with FAIL. Do nothing else.`, { model: 'haiku', label: 'screenshots' })
log(`Screenshots: ${String(shots || 'no reply').slice(0, 200)}`)
const lens = visual ? ' This is a VISUAL pass: report only what you can see in the screenshots (layout, readability, hierarchy, clipping, consistency, game feel, the phone layout). Do not repeat text-level teaching points. At most 6 findings. Append to the existing review file under a "Visual pass" heading instead of replacing it.' : ' Use the screenshots as well as the source.'

phase('Review')
const skipGame = !!(args && args.skipGame)   // the whole-game review does not need repeating for every batch of lessons
const reviews = await parallel([
  () => skipGame ? Promise.resolve({ verdict: 'skipped', findings: [] }) : run(`Scope: game. Review the whole experience and write reviews/game.md.${lens}`, { agentType: 'learning-reviewer', schema: REVIEW, phase: 'Review', label: 'review game' }),
  ...lessons.map(n => () => run(`Scope: lesson ${n}. Review that one stage and write reviews/lesson-${n}.md.${lens}`, { agentType: 'learning-reviewer', schema: REVIEW, phase: 'Review', label: `review lesson ${n}` })),
])
const game = reviews[0] || { verdict: 'review failed', findings: [] }
const perLesson = lessons.map((n, i) => ({ n, review: reviews[i + 1] || { verdict: 'review failed', findings: [] } }))
const accepted = r => r.findings.filter(f => ACCEPT.includes(f.severity))
log(`Game: ${game.findings.length} finding(s). Lessons: ${perLesson.map(l => `${l.n}: ${accepted(l.review).length}/${l.review.findings.length} accepted`).join(', ')}`)

const outcome = { applied: [], skipped: [] }
const note = (n, r) => { if (!r) return; (r.applied || []).forEach(id => outcome.applied.push(id)); (r.skipped || []).forEach(s => outcome.skipped.push(`${s.id}: ${s.why}`)) }
const guard = `Apply only these findings, each as its "change" field says. Keep everything listed under "Keep". If a finding is wrong, would make the content less accurate, or would change what the simulator measures, skip it and say why. Do not loosen objectives or edit tools/verify.js. Do not edit src/kernel.js, src/main.js, src/editor.js, src/timeline.js or src/world.js in this round.`

if (apply) {
  phase('Apply lesson changes')   // lesson and copy files are separate per stage, so these run in parallel
  const built = await parallel(perLesson.map(l => () => {
    const todo = accepted(l.review).filter(f => f.owner === 'lesson' || f.owner === 'copy')
    if (!todo.length) return Promise.resolve(null)
    return run(`Review round for stage ${l.n}: change only that stage's lesson file and its copy file (stages 1 and 2 keep their dialogue inline in the lesson file). ${guard} Then run the verifier for stage ${l.n} until it is green.\nKeep: ${JSON.stringify(l.review.keep || [])}\nFindings:\n${JSON.stringify(todo, null, 1)}`, { agentType: 'stage-builder', schema: DONE, phase: 'Apply lesson changes', label: `lesson ${l.n} changes` })
  }))
  built.forEach((r, i) => note(perLesson[i].n, r))

  phase('Apply theory changes')   // in parallel: each author stays inside its own stage's content file
  const wrote = await parallel(perLesson.map(l => () => {
    const todo = accepted(l.review).filter(f => f.owner === 'theory')
    if (!todo.length) return Promise.resolve(null)
    return run(`Review round for stage ${l.n}: revise only that stage's .content.js. Do not edit src/widgets.js: if a finding asks for a new or changed widget, put it in that file's own exported "widgets" object (copy and adapt a shared widget there if you must change it). ${guard} Mark any new factual statement you are not sure of with a VERIFY comment. Then run the verifier for stage ${l.n}.\nKeep: ${JSON.stringify(l.review.keep || [])}\nFindings:\n${JSON.stringify(todo, null, 1)}`, { agentType: 'theory-author', schema: DONE, phase: 'Apply theory changes', label: `theory ${l.n} changes` })
  }))
  wrote.forEach((r, i) => note(perLesson[i].n, r))
}

phase('Verify')
const verdict = await run(`Verify all stages (run the verifier with no stage number as well as for stages ${lessons.join(', ')}).`, { agentType: 'stage-verifier', schema: VERIFY, label: 'verifier' })

return {
  green: !!(verdict && verdict.verifierPassed), verifierFailures: verdict && verdict.verifierPassed ? [] : (verdict && verdict.failures) || ['the verifier agent did not report'], otherChecks: verdict && verdict.verifierPassed ? (verdict.failures || []).map(f => String(f).slice(0, 200)).slice(0, 6) : [],
  gameVerdict: game.verdict,
  uiFindings: game.findings,   // game-level changes touch the game loop and styles: the main session decides and applies these
  lessons: perLesson.map(l => ({ lesson: l.n, verdict: l.review.verdict, uiFindings: l.review.findings.filter(f => f.owner === 'ui'), notApplied: l.review.findings.filter(f => !ACCEPT.includes(f.severity)).map(f => `${f.id} (${f.severity}): ${f.problem}`) })),
  applied: outcome.applied, skipped: outcome.skipped,
  reports: ['reviews/game.md', ...lessons.map(n => `reviews/lesson-${n}.md`)],
}
