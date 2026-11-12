// Which requests get an AdminAction row: a non-GET under /api/admin/ that succeeded (status below 400) for a user
// requireRole let through. Stores the route pattern (e.g. /api/admin/patients/:id) and the most specific path id,
// never the body, query or changed values.
export function adminActionFor(request, statusCode) {
  const route = request.routeOptions?.url
  if (!route?.startsWith('/api/admin/') || ['GET', 'HEAD', 'OPTIONS'].includes(request.method) || statusCode >= 400) return null
  if (!request.actor) return null
  const ids = Object.values(request.params ?? {})
  return { actorUserId: request.actor.id, method: request.method, route, targetId: ids.length ? String(ids.at(-1)) : null }
}
