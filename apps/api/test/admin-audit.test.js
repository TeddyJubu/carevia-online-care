import assert from 'node:assert/strict'
import test from 'node:test'
import { adminActionFor } from '../src/admin-audit.js'

const req = (over = {}) => ({
  method: 'PATCH', routeOptions: { url: '/api/admin/patients/:id' }, params: { id: 'u1' }, actor: { id: 'admin1' },
  body: { email: 'secret@example.com' }, ...over,
})

test('a successful admin write is recorded with route pattern and id only', () => {
  const row = adminActionFor(req(), 200)
  assert.deepEqual(row, { actorUserId: 'admin1', method: 'PATCH', route: '/api/admin/patients/:id', targetId: 'u1' })
  assert.doesNotMatch(JSON.stringify(row), /secret/)
})

test('the most specific path id is the target; no params means no target', () => {
  assert.equal(adminActionFor(req({ method: 'DELETE', routeOptions: { url: '/api/admin/doctors/:id/slots/:slotId' }, params: { id: '11', slotId: '42' } }), 200).targetId, '42')
  assert.equal(adminActionFor(req({ method: 'PUT', routeOptions: { url: '/api/admin/daily' }, params: {} }), 200).targetId, null)
})

test('reads, failures, non-admin routes and unauthenticated requests are not recorded', () => {
  assert.equal(adminActionFor(req({ method: 'GET' }), 200), null)
  assert.equal(adminActionFor(req(), 400), null)
  assert.equal(adminActionFor(req(), 403), null)
  assert.equal(adminActionFor(req({ routeOptions: { url: '/api/bookings/:id' } }), 200), null)
  assert.equal(adminActionFor(req({ routeOptions: { url: '/api/admin' } }), 200), null)
  assert.equal(adminActionFor(req({ routeOptions: {} }), 404), null)
  assert.equal(adminActionFor(req({ actor: undefined }), 200), null)
})
