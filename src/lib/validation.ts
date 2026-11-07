export function validateDates(arrival: string, departure: string) {
  for (const value of [arrival, departure]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Use YYYY-MM-DD for both dates.');
    const parsed = new Date(`${value}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
      throw new Error('Enter valid calendar dates.');
  }
  if (departure < arrival) throw new Error('Departure must be on or after arrival.');
}
