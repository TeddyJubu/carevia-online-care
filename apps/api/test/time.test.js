import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SLOT_TIMES, WEEKDAY_HOURS, effectiveStatus, holdExpiry, joinState, joinWindow, lisbonDateTime, lisbonDayRange, lisbonTimeToUtc, scheduleFor,
} from '../src/rules.js'

const iso = (date) => date.toISOString()

test('Lisbon 09:30 is 09:30Z in winter and 08:30Z in summer', () => {
  assert.equal(iso(lisbonTimeToUtc('2026-11-06', '09:30')), '2026-11-06T09:30:00.000Z')
  assert.equal(iso(lisbonTimeToUtc('2026-07-01', '09:30')), '2026-07-01T08:30:00.000Z')
})

test('March switch (29 March 2026): the offset changes overnight', () => {
  assert.equal(iso(lisbonTimeToUtc('2026-03-27', '09:00')), '2026-03-27T09:00:00.000Z') // Friday, winter
  assert.equal(iso(lisbonTimeToUtc('2026-03-29', '00:30')), '2026-03-29T00:30:00.000Z') // before the jump
  assert.equal(iso(lisbonTimeToUtc('2026-03-29', '03:00')), '2026-03-29T02:00:00.000Z') // after the jump
  assert.equal(iso(lisbonTimeToUtc('2026-03-30', '09:00')), '2026-03-30T08:00:00.000Z') // Monday, summer
  // 01:30 does not exist that night; it moves forward to 02:30 summer time.
  assert.equal(iso(lisbonTimeToUtc('2026-03-29', '01:30')), '2026-03-29T01:30:00.000Z')
})

test('October switch (25 October 2026): the offset changes back', () => {
  assert.equal(iso(lisbonTimeToUtc('2026-10-23', '09:00')), '2026-10-23T08:00:00.000Z') // Friday, summer
  assert.equal(iso(lisbonTimeToUtc('2026-10-25', '00:30')), '2026-10-24T23:30:00.000Z')
  assert.equal(iso(lisbonTimeToUtc('2026-10-25', '03:00')), '2026-10-25T03:00:00.000Z')
  assert.equal(iso(lisbonTimeToUtc('2026-10-26', '09:00')), '2026-10-26T09:00:00.000Z') // Monday, winter
  // 01:30 happens twice; the second (winter) occurrence is used.
  assert.equal(iso(lisbonTimeToUtc('2026-10-25', '01:30')), '2026-10-25T01:30:00.000Z')
})

test('A Lisbon day across the switch is 23 or 25 hours long', () => {
  const march = lisbonDayRange('2026-03-29')
  const october = lisbonDayRange('2026-10-25')
  assert.equal((march.to - march.from) / 3_600_000, 23)
  assert.equal((october.to - october.from) / 3_600_000, 25)
})

test('Schedule across the March switch keeps Lisbon wall-clock times', () => {
  const slots = scheduleFor(WEEKDAY_HOURS, '2026-03-23') // Monday; the switch is Sunday 29 March
  const times = (date) => slots.filter((slot) => slot.startsAt.toISOString().startsWith(date)).map((slot) => slot.startsAt.toISOString().slice(11, 16))
  assert.deepEqual(times('2026-03-27'), SLOT_TIMES) // UTC equals Lisbon in winter
  assert.deepEqual(times('2026-03-30'), SLOT_TIMES.map((t) => `${String(Number(t.slice(0, 2)) - 1).padStart(2, '0')}${t.slice(2)}`))
})

test('Schedule across the October switch keeps Lisbon wall-clock times', () => {
  const slots = scheduleFor(WEEKDAY_HOURS, '2026-10-19')
  const first = (date) => slots.find((slot) => slot.startsAt.toISOString().startsWith(date)).startsAt.toISOString()
  assert.equal(first('2026-10-23'), '2026-10-23T08:00:00.000Z')
  assert.equal(first('2026-10-26'), '2026-10-26T09:00:00.000Z')
})

test('Schedule: 21 days, listed weekdays only, availabilityIndex skips listed days', () => {
  // 5 November 2026 is a Thursday. The Monday-to-Friday template lists 15 days in the next 21.
  const all = scheduleFor(WEEKDAY_HOURS, '2026-11-05')
  assert.equal(all.length, 15 * SLOT_TIMES.length)
  assert.ok(all.every((slot) => ![0, 6].includes(new Date(slot.startsAt.getTime() + 3_600_000).getUTCDay())))
  assert.ok(all.every((slot) => slot.endsAt - slot.startsAt === 30 * 60_000))
  assert.equal(iso(all[0].startsAt), '2026-11-05T09:00:00.000Z')
  assert.equal(iso(scheduleFor(WEEKDAY_HOURS, '2026-11-05', 1)[0].startsAt), '2026-11-06T09:00:00.000Z') // Friday
  assert.equal(iso(scheduleFor(WEEKDAY_HOURS, '2026-11-05', 2)[0].startsAt), '2026-11-09T09:00:00.000Z') // Monday, weekend skipped
  assert.equal(scheduleFor(WEEKDAY_HOURS, '2026-11-07')[0].startsAt.toISOString().slice(0, 10), '2026-11-09') // Saturday start
})

test('An empty weekly template opens no slots', () => {
  assert.deepEqual(scheduleFor({}, '2026-11-05'), [])
  assert.deepEqual(scheduleFor(undefined, '2026-11-05'), [])
  assert.deepEqual(scheduleFor({ 1: [], 2: ['25:00', '9:00', ''] }, '2026-11-05'), [])
})

test('A weekly template skips the hour Lisbon springs past and keeps the repeated October hour', () => {
  // 29 March 2026, 01:00–01:59 does not exist. 01:45 must not be moved forward onto 02:30.
  const spring = scheduleFor({ 0: ['01:45', '02:30'] }, '2026-03-29')
    .filter((slot) => slot.startsAt.toISOString().startsWith('2026-03-29'))
  assert.deepEqual(spring.map((slot) => iso(slot.startsAt)), ['2026-03-29T01:30:00.000Z'])
  // 25 October 2026, 01:30 happens twice. The winter occurrence is a real Lisbon time.
  const autumn = scheduleFor({ 0: ['01:30'] }, '2026-10-25')
  assert.equal(iso(autumn[0].startsAt), '2026-10-25T01:30:00.000Z')
})

test('A weekly template opens only the weekdays and times it lists', () => {
  // 7 November 2026 is a Saturday. Duplicates are dropped. Days with no entry are skipped.
  const slots = scheduleFor({ 6: ['11:00', '11:00'], 2: ['18:15'] }, '2026-11-07')
  const days = slots.map((slot) => `${slot.startsAt.toISOString().slice(0, 16)}Z`)
  assert.deepEqual(days, [
    '2026-11-07T11:00Z', // Saturday
    '2026-11-10T18:15Z', // Tuesday
    '2026-11-14T11:00Z',
    '2026-11-17T18:15Z',
    '2026-11-21T11:00Z',
    '2026-11-24T18:15Z',
  ])
})

test('Hold expiry: a hold lasts 10 minutes and expires exactly at holdExpiresAt', () => {
  const now = new Date('2026-11-05T10:00:00Z')
  const hold = { status: 'held', holdExpiresAt: holdExpiry(now) }
  assert.equal(iso(hold.holdExpiresAt), '2026-11-05T10:10:00.000Z')
  assert.equal(effectiveStatus(hold, new Date('2026-11-05T10:09:59Z')), 'held')
  assert.equal(effectiveStatus(hold, new Date('2026-11-05T10:10:00Z')), 'expired')
  assert.equal(effectiveStatus({ status: 'held', holdExpiresAt: null }, now), 'expired')
  assert.equal(effectiveStatus({ status: 'confirmed', holdExpiresAt: new Date(0) }, now), 'confirmed')
})

test('Join window opens 10 minutes before the start and closes 60 minutes after the end', () => {
  const visit = { startsAt: new Date('2026-11-05T10:00:00Z'), endsAt: new Date('2026-11-05T10:30:00Z') }
  assert.deepEqual(joinWindow(visit), {
    joinOpensAt: new Date('2026-11-05T09:50:00Z'),
    joinClosesAt: new Date('2026-11-05T11:30:00Z'),
  })
  assert.equal(joinState(visit, new Date('2026-11-05T09:49:59Z')), 'too_early')
  assert.equal(joinState(visit, new Date('2026-11-05T09:50:00Z')), 'open')
  assert.equal(joinState(visit, new Date('2026-11-05T11:30:00Z')), 'open')
  assert.equal(joinState(visit, new Date('2026-11-05T11:30:01Z')), 'closed')
})

test('lisbonDateTime writes the visit time in Lisbon wall-clock time, summer and winter', () => {
  assert.equal(lisbonDateTime('2026-07-15T08:30:00.000Z'), 'Wednesday 15 July 2026 at 09:30')
  assert.equal(lisbonDateTime('2026-11-06T09:30:00.000Z'), 'Friday 6 November 2026 at 09:30')
})
