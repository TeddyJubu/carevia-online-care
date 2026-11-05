// Run: node scripts/check-time.ts  (Node strips the types). Fails loudly if Lisbon time handling breaks.
import assert from 'node:assert/strict'
import { addDays, age, countdown, hhmm, lisbonDay, lisbonToUtc } from '../src/lib/time.ts'

assert.equal(lisbonToUtc('2026-01-15', '09:30').toISOString(), '2026-01-15T09:30:00.000Z') // winter: UTC+0
assert.equal(lisbonToUtc('2026-07-15', '09:30').toISOString(), '2026-07-15T08:30:00.000Z') // summer: UTC+1
assert.equal(lisbonToUtc('2026-10-25', '09:30').toISOString(), '2026-10-25T09:30:00.000Z') // the morning after the switch back
assert.equal(hhmm('2026-07-15T08:30:00.000Z'), '09:30')
assert.equal(lisbonDay('2026-07-15T23:30:00.000Z'), '2026-07-16') // 00:30 next day in Lisbon
assert.equal(addDays('2026-12-31', 1), '2027-01-01')
assert.equal(age('2008-11-05', '2026-11-05'), 18) // 18th birthday today
assert.equal(age('2008-11-06', '2026-11-05'), 17) // one day short
assert.equal(age('2008-02-29', '2026-02-28'), 17) // leap-day birthday before 1 March
assert.equal(countdown('2026-01-01T00:10:00Z', Date.parse('2026-01-01T00:00:01Z')), '9:59')
assert.equal(countdown('2026-01-01T00:00:00Z', Date.parse('2026-01-01T00:00:01Z')), null)
console.log('time checks passed')
