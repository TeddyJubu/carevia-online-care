import assert from 'node:assert/strict'
import test from 'node:test'
import { approvalBlock, CHECK_KEYS, formatApplicationReference, makeLimiter } from '../src/routes/doctor-applications.js'

test('approve stays blocked until every launch-gate check is ticked', () => {
  assert.deepEqual(approvalBlock([]), CHECK_KEYS)
  assert.deepEqual(approvalBlock([{ key: 'cedula' }, { key: 'identity' }]).includes('insurance'), true)
  assert.deepEqual(approvalBlock(CHECK_KEYS.map((key) => ({ key }))), [])
})

test('application references are CV-APP- and at least four digits', () => {
  assert.equal(formatApplicationReference(1), 'CV-APP-0001')
  assert.equal(formatApplicationReference(42), 'CV-APP-0042')
  assert.equal(formatApplicationReference(10000), 'CV-APP-10000')
  assert.equal(formatApplicationReference(0), '')
  assert.equal(formatApplicationReference('7'), '')
})

test('limiter allows max calls per key per window, then frees up', () => {
  let t = 0
  const allow = makeLimiter({ max: 2, windowMs: 1000, now: () => t })
  assert.equal(allow('a'), true)
  assert.equal(allow('a'), true)
  assert.equal(allow('a'), false)
  assert.equal(allow('b'), true)
  t = 1001
  assert.equal(allow('a'), true)
})
