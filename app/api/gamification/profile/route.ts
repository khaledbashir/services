import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/gamification'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const staffId = url.searchParams.get('staffId')

  if (!staffId) {
    return NextResponse.json({ error: 'staffId required' }, { status: 400 })
  }

  try {
    const data = await getProfile(staffId)
    return NextResponse.json({ data })
  } catch (err) {
    console.error('Profile API error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
