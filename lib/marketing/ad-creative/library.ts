import { promises as fs } from 'fs'
import path from 'path'

export type LibraryPhoto = {
  id: string
  file: string
  label: string
  venue: string
  mood: 'day' | 'night' | 'interior' | 'render'
}

/**
 * Curated, verified ANC-owned photography (sourced from anc.com project pages).
 * Brand rule: ad creative only ever uses authentic ANC install imagery —
 * additions to this list must come from ANC-owned sources.
 */
export const AD_LIBRARY: LibraryPhoto[] = [
  { id: 'levis-touchdown', file: 'levis-touchdown.jpg', label: 'Levi’s Stadium — touchdown moment', venue: 'Levi’s Stadium, San Francisco 49ers', mood: 'day' },
  { id: 'levis-night', file: 'levis-night.jpg', label: 'Levi’s Stadium — big game at night', venue: 'Levi’s Stadium, San Francisco 49ers', mood: 'night' },
  { id: 'levis-flags', file: 'levis-flags.jpg', label: 'Levi’s Stadium — pregame ceremony', venue: 'Levi’s Stadium, San Francisco 49ers', mood: 'day' },
  { id: 'mtbank-club', file: 'mtbank-club.jpg', label: 'M&T Bank Stadium — club level', venue: 'M&T Bank Stadium, Baltimore Ravens', mood: 'interior' },
  { id: 'pacers-bowl', file: 'pacers-bowl.jpg', label: 'Gainbridge Fieldhouse — arena bowl', venue: 'Gainbridge Fieldhouse, Indiana Pacers', mood: 'interior' },
  { id: 'kia-center', file: 'kia-center.jpg', label: 'Kia Center — technology overhaul', venue: 'Kia Center, Orlando', mood: 'interior' },
  { id: 'redsox-fenway', file: 'redsox-fenway.jpg', label: 'Fenway Park — game day', venue: 'Fenway Park, Boston Red Sox', mood: 'day' },
  { id: 'big10-football', file: 'big10-football.jpg', label: 'Big Ten football production', venue: 'ANC Studios — Big Ten Football', mood: 'day' },
]

const LIBRARY_DIR = path.join(process.cwd(), 'public', 'ad-library')

export function getLibraryPhoto(id: string): LibraryPhoto | null {
  return AD_LIBRARY.find(p => p.id === id) || null
}

export async function readLibraryPhotoDataUri(id: string): Promise<string | null> {
  const photo = getLibraryPhoto(id)
  if (!photo) return null
  try {
    const buf = await fs.readFile(path.join(LIBRARY_DIR, photo.file))
    return `data:image/jpeg;base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

export async function readLogoDataUri(variant: 'white' | 'blue' = 'white'): Promise<string> {
  const file = variant === 'white' ? 'anc-wordmark-white.png' : 'anc-wordmark-blue.png'
  const buf = await fs.readFile(path.join(process.cwd(), 'public', file))
  return `data:image/png;base64,${buf.toString('base64')}`
}
