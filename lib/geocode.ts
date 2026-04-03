// Geocoding utility using OpenStreetMap Nominatim (free, no API key needed)
// Rate limit: 1 request per second

let lastRequestTime = 0
const MIN_INTERVAL_MS = 1100 // Slightly over 1 second to be safe

interface GeocodeResult {
  lat: number | null
  lng: number | null
  display_name: string | null
}

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  if (!address || address.trim().length < 5) {
    return { lat: null, lng: null, display_name: null }
  }

  // Rate limiting - wait if needed
  const now = Date.now()
  const elapsed = now - lastRequestTime
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_INTERVAL_MS - elapsed))
  }
  lastRequestTime = Date.now()

  try {
    const encodedAddress = encodeURIComponent(address)
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ANC-Services-Geocoder/1.0 (contact@anc.com)',
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      console.warn(`Geocoding failed for "${address}": ${response.status}`)
      return { lat: null, lng: null, display_name: null }
    }

    const data = await response.json()
    
    if (data && data.length > 0) {
      const result = data[0]
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        display_name: result.display_name,
      }
    }

    return { lat: null, lng: null, display_name: null }
  } catch (err) {
    console.error(`Geocoding error for "${address}":`, err)
    return { lat: null, lng: null, display_name: null }
  }
}

// Batch geocode with rate limiting
export async function geocodeBatch(addresses: string[]): Promise<GeocodeResult[]> {
  const results: GeocodeResult[] = []
  
  for (const address of addresses) {
    const result = await geocodeAddress(address)
    results.push(result)
  }
  
  return results
}

// Extract state from address (helper)
export function extractStateFromAddress(address: string): string | null {
  if (!address) return null
  
  // Try to find a 2-letter state code followed by ZIP
  const stateZipPattern = /\b([A-Z]{2})\s+(\d{5})\b/
  const match = address.match(stateZipPattern)
  if (match) return match[1]
  
  // Common state name mappings
  const stateNames: Record<string, string> = {
    'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
    'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
    'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
    'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
    'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
    'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
    'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
    'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
    'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
    'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
    'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
    'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
    'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC',
  }
  
  const lowerAddress = address.toLowerCase()
  for (const [name, abbr] of Object.entries(stateNames)) {
    if (lowerAddress.includes(name)) return abbr
  }
  
  return null
}