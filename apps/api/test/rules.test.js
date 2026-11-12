import assert from 'node:assert/strict'
import test from 'node:test'
import { canCancel, canReschedule, doctorNoShow, isAdult, isMinor, lisbonToday, normalizePhone, parseDate, reminderDue } from '../src/rules.js'

test('isAdult: the 18th birthday counts', () => {
  assert.equal(isAdult('2008-11-05', '2026-11-05'), true)
  assert.equal(isAdult('2008-11-06', '2026-11-05'), false)
  assert.equal(isAdult('1990-01-01', '2026-11-05'), true)
})

test('isAdult: 29 February births turn 18 on 1 March in non-leap years', () => {
  assert.equal(isAdult('2008-02-29', '2026-02-28'), false)
  assert.equal(isAdult('2008-02-29', '2026-03-01'), true)
  assert.equal(isAdult('2010-02-29', '2028-02-29'), false, '2010-02-29 is not a real date')
  assert.equal(isAdult('2012-02-29', '2030-02-28'), false)
  assert.equal(isAdult('2012-02-29', '2030-03-01'), true)
  assert.equal(isAdult('1996-02-29', '2014-02-28'), false)
  assert.equal(isAdult('1996-02-29', '2014-03-01'), true)
})

test('isAdult: invalid, empty and future input returns false', () => {
  for (const value of ['', null, undefined, '1990-13-01', '1990-02-30', '01/01/1990', '1990-1-1', 19900101]) {
    assert.equal(isAdult(value, '2026-11-05'), false, String(value))
  }
  assert.equal(isAdult('2030-01-01', '2026-11-05'), false)
  assert.equal(isAdult('1990-01-01', 'not-a-date'), false)
})

test('isMinor is the opposite of isAdult for real past dates only', () => {
  assert.equal(isMinor('2018-03-14', '2026-11-05'), true)
  assert.equal(isMinor('1990-01-01', '2026-11-05'), false)
  assert.equal(isMinor('2030-01-01', '2026-11-05'), false)
  assert.equal(isMinor('nonsense', '2026-11-05'), false)
})

test('parseDate rejects impossible dates', () => {
  assert.deepEqual(parseDate('2024-02-29'), { year: 2024, month: 2, day: 29 })
  assert.equal(parseDate('2026-02-29'), null)
})

test('lisbonToday uses the Lisbon calendar date, not UTC', () => {
  // 23:30 UTC on 30 June is 00:30 on 1 July in Lisbon (summer time, UTC+1).
  assert.equal(lisbonToday(new Date('2026-06-30T23:30:00Z')), '2026-07-01')
  // In winter Lisbon is UTC+0.
  assert.equal(lisbonToday(new Date('2026-12-31T23:30:00Z')), '2026-12-31')
})

test('normalizePhone accepts E.164 with spacing and rejects the rest', () => {
  assert.equal(normalizePhone('+351 900 000 000'), '+351900000000')
  assert.equal(normalizePhone('+44 (20) 7946-0958'), '+442079460958')
  for (const value of ['900000000', '+0351900000000', '+351', '+35190000000000000', 'phone', '', null]) {
    assert.equal(normalizePhone(value), null, String(value))
  }
})

test('parseFrontMatter reads flat keys and ignores comments', async () => {
  const { parseFrontMatter } = await import('../src/content.js')
  const parsed = parseFrontMatter('---\nid: consent            # comment\nversion: 2026-11-05.1\ntitle: "Before your consultation"\n---\n\nBody text\n')
  assert.deepEqual(parsed.data, { id: 'consent', version: '2026-11-05.1', title: 'Before your consultation' })
  assert.equal(parsed.body, 'Body text')
})

test('patientBody drops only the leading draft-for-review note', async () => {
  const { parseFrontMatter, patientBody } = await import('../src/content.js')
  const file = "---\nid: consent\nversion: 2026-11-05.1\n---\n\n> Draft for review by Carevia's lawyer. Not final wording.\n\nPlease read this.\n\n> A later quote stays.\n"
  const { data, body } = parseFrontMatter(file)
  assert.equal(data.version, '2026-11-05.1')
  assert.equal(patientBody(body), 'Please read this.\n\n> A later quote stays.')
  assert.equal(patientBody('No note here.'), 'No note here.')
})

test('canReschedule: before the start, or after a dropped call once the join window has closed', () => {
  const startsAt = new Date('2026-11-10T10:00:00.000Z')
  const endsAt = new Date('2026-11-10T10:30:00.000Z')
  const visit = (more = {}) => ({ status: 'confirmed', outcome: null, startsAt, endsAt, ...more })
  const at = (iso) => new Date(iso)
  assert.equal(canReschedule(visit(), at('2026-11-10T09:59:00.000Z')), true) // not started (even inside the join window)
  assert.equal(canReschedule(visit(), at('2026-11-10T10:00:00.000Z')), false) // started
  assert.equal(canReschedule(visit({ outcome: 'ended_poor_quality' }), at('2026-11-10T11:00:00.000Z')), false) // window still open: reconnect instead
  assert.equal(canReschedule(visit({ outcome: 'ended_poor_quality' }), at('2026-11-10T11:30:00.000Z')), true) // window closed
  assert.equal(canReschedule(visit({ outcome: null }), at('2026-11-10T12:00:00.000Z')), false) // no dropped call recorded
  assert.equal(canReschedule(visit({ status: 'completed', outcome: 'completed' }), at('2026-11-09T10:00:00.000Z')), false)
  assert.equal(canReschedule(visit({ status: 'cancelled' }), at('2026-11-09T10:00:00.000Z')), false)
})

test('doctor no-show: 15 minutes past the start with no clinician join opens cancel and move', () => {
  const startsAt = new Date('2026-11-10T10:00:00.000Z')
  const endsAt = new Date('2026-11-10T10:30:00.000Z')
  const joined = { actorRole: 'clinician', type: 'joined' }
  const visit = (more = {}) => ({ status: 'confirmed', outcome: null, startsAt, endsAt, callEvents: [], ...more })
  const at = (iso) => new Date(iso)
  assert.equal(doctorNoShow(visit(), at('2026-11-10T10:14:59.000Z')), false, 'under 15 minutes')
  assert.equal(doctorNoShow(visit(), at('2026-11-10T10:15:00.000Z')), true, 'at 15 minutes')
  assert.equal(doctorNoShow(visit(), at('2026-11-12T10:00:00.000Z')), true, 'still true after the join window closes')
  assert.equal(doctorNoShow(visit({ callEvents: [joined] }), at('2026-11-10T10:20:00.000Z')), false, 'doctor joined')
  assert.equal(doctorNoShow(visit({ callEvents: [{ actorRole: 'patient', type: 'joined' }] }), at('2026-11-10T10:20:00.000Z')), true, 'only the patient joined')
  assert.equal(doctorNoShow(visit({ outcome: 'ended_poor_quality' }), at('2026-11-10T10:20:00.000Z')), false, 'an outcome was recorded')
  assert.equal(doctorNoShow(visit({ callEvents: undefined }), at('2026-11-10T10:20:00.000Z')), false, 'fails closed without call events')
  assert.equal(doctorNoShow(visit({ status: 'cancelled' }), at('2026-11-10T10:20:00.000Z')), false)
  assert.equal(canReschedule(visit(), at('2026-11-10T10:20:00.000Z')), true)
  assert.equal(canReschedule(visit({ callEvents: [joined] }), at('2026-11-10T10:20:00.000Z')), false)
  assert.equal(canCancel(visit(), at('2026-11-10T09:59:00.000Z')), true, 'before the start')
  assert.equal(canCancel(visit(), at('2026-11-10T10:05:00.000Z')), false, 'started, doctor may still join')
  assert.equal(canCancel(visit(), at('2026-11-10T10:20:00.000Z')), true, 'doctor no-show')
  assert.equal(canCancel(visit({ callEvents: [joined] }), at('2026-11-10T10:20:00.000Z')), false)
})

test('reminderDue: once, inside the last 24 hours, only for visits paid for earlier than that', () => {
  const startsAt = new Date('2026-11-10T10:00:00Z')
  const a = { status: 'confirmed', startsAt, remindEmail: true, remindSms: false, reminderSentAt: null, payment: { createdAt: new Date('2026-11-01T10:00:00Z') } }
  const at = (iso) => new Date(iso)
  assert.equal(reminderDue(a, at('2026-11-09T09:59:00Z')), false, 'more than 24 hours before')
  assert.equal(reminderDue(a, at('2026-11-09T10:00:00Z')), true, 'exactly 24 hours before')
  assert.equal(reminderDue(a, at('2026-11-10T09:59:00Z')), true, 'still due after a restart that missed the moment')
  assert.equal(reminderDue(a, at('2026-11-10T10:00:00Z')), false, 'the visit has started')
  assert.equal(reminderDue({ ...a, reminderSentAt: at('2026-11-09T10:00:00Z') }, at('2026-11-09T11:00:00Z')), false, 'already sent')
  assert.equal(reminderDue({ ...a, remindEmail: false }, at('2026-11-09T11:00:00Z')), false, 'both channels off')
  assert.equal(reminderDue({ ...a, remindEmail: false, remindSms: true }, at('2026-11-09T11:00:00Z')), true, 'SMS only')
  assert.equal(reminderDue({ ...a, status: 'cancelled' }, at('2026-11-09T11:00:00Z')), false, 'cancelled')
  assert.equal(reminderDue({ ...a, payment: { createdAt: at('2026-11-09T12:00:00Z') } }, at('2026-11-09T13:00:00Z')), false, 'booked inside the 24 hours')
  assert.equal(reminderDue({ ...a, payment: null }, at('2026-11-09T11:00:00Z')), false, 'never paid')
})
