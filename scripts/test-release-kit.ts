import { readFileSync } from 'fs'
import { extractDocxText } from '@/lib/marketing/docx-text'
import { generateReleaseKit } from '@/lib/marketing/release-kit'

async function main() {
  const text = extractDocxText(readFileSync('/root/anc-services/Notes on LA DODGERS + LG - DRAFT I_CLEAN_07-23-26 (1).docx'))
  const { kit, provider, model } = await generateReleaseKit(
    text,
    'Existing lists: Media & Partnerships Newsletter (4,235 contacts); All Newsletter Contacts — Subscribed (6,330).',
  )
  console.log('provider :', provider, '|', model)
  console.log('TITLE    :', kit.title)
  console.log('SUMMARY  :', kit.summary)
  console.log('FACTS    :', kit.facts.length)
  console.log('GAPS     :', kit.gaps.length)
  for (const g of kit.gaps) console.log('   -', g.severity.toUpperCase(), '|', g.title, '|', (g.quote || '').slice(0, 70))
  console.log('HEADLINE :', kit.story.headline)
  console.log('PARAS    :', kit.story.paragraphs.length)
  console.log('AD head  :', kit.adCopy.headline.length + '/95', '|', kit.adCopy.headline)
  console.log('AD body  :', kit.adCopy.body.length + '/255')
  console.log('AD cta   :', kit.adCopy.cta.length + '/25', '|', kit.adCopy.cta)
  console.log('AUDIENCE :', kit.suggestedAudience)
  console.log('EMAIL    :', kit.email.subject)
  console.log('LI exec  :', kit.social.linkedinExec.slice(0, 120))
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
