// Always returns local date string YYYY-MM-DD
// Fixes the UTC vs local timezone offset issue
export function getLocalDateStr(date: Date = new Date()): string {
  const year  = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day   = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getLocalWeekDays(): {
  label: string; day: number; value: string
}[] {
  const days  = []
  const today = new Date()
  for (let i = -1; i <= 5; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    days.push({
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      day:   d.getDate(),
      value: getLocalDateStr(d),
    })
  }
  return days
}
