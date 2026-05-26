export const OPERATIONS_TIME_ZONE =
  typeof process !== 'undefined'
    ? process.env.NEXT_PUBLIC_OPERATIONS_TIME_ZONE || process.env.OPERATIONS_TIME_ZONE || 'America/New_York'
    : 'America/New_York'

type DateLike = Date | string | number

function toDate(value?: DateLike): Date {
  return value instanceof Date ? value : value ? new Date(value) : new Date()
}

export function dateKeyInTimeZone(value?: DateLike, timeZone = OPERATIONS_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(toDate(value))

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    return toDate(value).toISOString().slice(0, 10)
  }

  return `${year}-${month}-${day}`
}

export function todayInOperationsTimeZone(value?: DateLike): string {
  return dateKeyInTimeZone(value, OPERATIONS_TIME_ZONE)
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function addMonthsToDateKey(dateKey: string, months: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCMonth(date.getUTCMonth() + months)
  return date.toISOString().slice(0, 10)
}
