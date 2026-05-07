import { redirect } from 'next/navigation'

// Old tokenized URLs redirect to the canonical /transparency. The token gate
// is no longer used — the page is public-but-noindex (same model as
// Atlassian/NetSuite entitlement pages).
export default function TokenizedTransparencyRedirect() {
  redirect('/transparency')
}
