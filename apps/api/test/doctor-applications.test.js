import assert from 'node:assert/strict'
import test from 'node:test'
import { makeLimiter } from '../src/routes/doctor-applications.js'

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
