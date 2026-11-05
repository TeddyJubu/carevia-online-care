import assert from 'node:assert/strict'
import test from 'node:test'
import { originProblem } from '../src/origin.js'

const trusted = ['https://carevia.claudemod.tech', 'https://admin.example.test']
const check = (fields) => originProblem({ method: 'POST', path: '/api/bookings/x/pay', production: true, trusted, ...fields })

test('a changing request from a foreign origin is refused; the trusted origin is allowed', () => {
  assert.equal(check({ origin: 'https://evil.claudemod.tech' }), 'untrusted origin')
  assert.equal(check({ origin: 'null' }), 'untrusted origin')
  assert.equal(check({ origin: 'https://carevia.claudemod.tech' }), null)
  assert.equal(check({ origin: 'https://admin.example.test', method: 'PUT', path: '/api/admin/daily' }), null)
})

test('without Origin, Sec-Fetch-Site decides; without both, only outside production', () => {
  assert.equal(check({ secFetchSite: 'same-origin' }), null)
  assert.equal(check({ secFetchSite: 'same-site' }), 'cross-site request')
  assert.equal(check({ secFetchSite: 'cross-site' }), 'cross-site request')
  assert.equal(check({}), 'no origin')
  assert.equal(check({ production: false }), null)
})

test('reads and Better Auth routes are not checked here', () => {
  assert.equal(check({ method: 'GET', origin: 'https://evil.claudemod.tech' }), null)
  assert.equal(check({ path: '/api/auth/sign-in/email', origin: 'https://evil.claudemod.tech' }), null)
  for (const method of ['PUT', 'PATCH', 'DELETE']) assert.equal(check({ method, origin: 'https://evil.claudemod.tech' }), 'untrusted origin')
})
