import assert from 'node:assert/strict'
import test from 'node:test'
import { isAdult, isMinor, lisbonToday, normalizePhone, parseDate } from '../src/rules.js'

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
