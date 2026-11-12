import assert from 'node:assert/strict'
import test from 'node:test'
import { approvalBlock, CHECK_KEYS, formatApplicationReference, makeLimiter } from '../src/routes/doctor-applications.js'
import { hashInviteToken } from '../src/routes/doctor-invites.js'
import { onboardingSteps } from '../src/routes/onboarding.js'

test('setup stays incomplete until security, profile, agreement, hours and the camera are done', () => {
  const row = { twoFactorSkippedAt: null, profileCheckedAt: null, profileFlaggedAt: null, agreementAcceptedAt: null, hoursOpenedAt: null, deviceCheckedAt: null }
  const user = { emailVerified: true, twoFactorEnabled: false }
  const open = onboardingSteps(row, user)
  assert.equal(open.complete, false)
  assert.equal(open.steps.find((step) => step.state === 'current').key, 'security')
  const done = onboardingSteps({
    ...row,
    twoFactorSkippedAt: new Date(),
    profileCheckedAt: new Date(),
    agreementAcceptedAt: new Date(),
    hoursOpenedAt: new Date(),
    deviceCheckedAt: new Date(),
  }, user)
  assert.equal(done.complete, true)
})

test('invite tokens are stored as a hash, and the raw token is not the hash', () => {
  const token = 'example-invite-token-not-a-real-one'
  assert.equal(hashInviteToken(token), hashInviteToken(token))
  assert.notEqual(hashInviteToken(token), token)
  assert.notEqual(hashInviteToken(token), hashInviteToken(`${token}x`))
})

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
