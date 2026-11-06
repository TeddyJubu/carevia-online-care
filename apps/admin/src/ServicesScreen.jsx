import { useEffect, useState } from 'react'
import { createService, createServiceGroup, listServiceGroups, sessionFailure, updateService, updateServiceGroup } from './api.js'

const EMPTY_GROUP = { name: '', blurb: '' }
const EMPTY_SERVICE = { name: '' }

export default function ServicesScreen({ id, onSignOut, onDenied }) {
  const [groups, setGroups] = useState([])
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [banner, setBanner] = useState(null)
  const [addingGroup, setAddingGroup] = useState(false)
  const [groupDraft, setGroupDraft] = useState(EMPTY_GROUP)
  const [serviceDraft, setServiceDraft] = useState(EMPTY_SERVICE)
  const [editingService, setEditingService] = useState(null)
  const [busy, setBusy] = useState('')
  const [confirmHide, setConfirmHide] = useState('')

  const selectedId = id === '' ? null : Number(id)
  const selected = groups.find((group) => group.id === selectedId) || groups[0] || null

  useEffect(() => {
    let live = true
    listServiceGroups()
      .then((data) => {
        if (!live) return
        setGroups(data.groups || [])
        setState('ready')
      })
      .catch((err) => {
        if (!live || sessionFailure(err, onSignOut, onDenied)) return
        setError(err.message)
        setState('error')
      })
    return () => {
      live = false
    }
  }, [onSignOut, onDenied])

  useEffect(() => {
    if (state !== 'ready' || !groups.length) return
    if (selectedId == null || !groups.some((group) => group.id === selectedId)) {
      window.location.hash = `#/services/${groups[0].id}`
    }
  }, [state, groups, selectedId])

  function replaceGroup(next) {
    setGroups((current) => current.map((group) => (group.id === next.id ? { ...group, ...next, services: next.services || group.services } : group)))
  }

  async function onCreateGroup(event) {
    event.preventDefault()
    if (busy) return
    setBusy('group')
    setBanner(null)
    try {
      const created = await createServiceGroup({
        name: groupDraft.name.trim(),
        blurb: groupDraft.blurb.trim(),
      })
      setGroups((current) => [...current, created.group].sort((a, b) => a.sortOrder - b.sortOrder))
      setGroupDraft(EMPTY_GROUP)
      setAddingGroup(false)
      window.location.hash = `#/services/${created.group.id}`
      setBanner({ tone: 'ok', text: 'Group added. It is shown on the patient portal.' })
    } catch (err) {
      if (sessionFailure(err, onSignOut, onDenied)) return
      setBanner({ tone: 'error', text: err.message })
    } finally {
      setBusy('')
    }
  }

  async function onSaveGroup(event) {
    event.preventDefault()
    if (!selected || busy) return
    setBusy('save-group')
    setBanner(null)
    try {
      const saved = await updateServiceGroup(selected.id, {
        name: selected.name.trim(),
        blurb: selected.blurb.trim(),
        fieldMarks: selected.fieldMarks || '',
        confusedWith: selected.confusedWith || '',
      })
      replaceGroup({ ...selected, ...saved.group })
      setBanner({ tone: 'ok', text: 'Group saved.' })
    } catch (err) {
      if (sessionFailure(err, onSignOut, onDenied)) return
      setBanner({ tone: 'error', text: err.message })
    } finally {
      setBusy('')
    }
  }

  async function setGroupVisible(active) {
    if (!selected || busy) return
    setBusy('visibility')
    setBanner(null)
    try {
      const saved = await updateServiceGroup(selected.id, { active })
      replaceGroup({ ...selected, active: saved.group.active })
      setConfirmHide('')
      setBanner({
        tone: 'ok',
        text: active ? 'This group is shown on the patient portal.' : 'This group is hidden from the patient portal.',
      })
    } catch (err) {
      if (sessionFailure(err, onSignOut, onDenied)) return
      setBanner({ tone: 'error', text: err.message })
    } finally {
      setBusy('')
    }
  }

  async function onCreateService(event) {
    event.preventDefault()
    if (!selected || busy) return
    setBusy('service')
    setBanner(null)
    try {
      const created = await createService({ groupId: selected.id, name: serviceDraft.name.trim() })
      setGroups((current) => current.map((group) => (
        group.id === selected.id
          ? { ...group, services: [...group.services, created.service] }
          : group
      )))
      setServiceDraft(EMPTY_SERVICE)
      setBanner({ tone: 'ok', text: 'Service added at the end of this group.' })
    } catch (err) {
      if (sessionFailure(err, onSignOut, onDenied)) return
      setBanner({ tone: 'error', text: err.message })
    } finally {
      setBusy('')
    }
  }

  async function onSaveService(event) {
    event.preventDefault()
    if (!editingService || busy) return
    setBusy('save-service')
    setBanner(null)
    try {
      const saved = await updateService(editingService.id, { name: editingService.name.trim() })
      setGroups((current) => current.map((group) => ({
        ...group,
        services: group.services.map((service) => (service.id === saved.service.id ? { ...service, ...saved.service } : service)),
      })))
      setEditingService(null)
      setBanner({ tone: 'ok', text: 'Service name saved.' })
    } catch (err) {
      if (sessionFailure(err, onSignOut, onDenied)) return
      setBanner({ tone: 'error', text: err.message })
    } finally {
      setBusy('')
    }
  }

  async function setServiceVisible(service, active) {
    if (busy) return
    setBusy(`service-${service.id}`)
    setBanner(null)
    try {
      const saved = await updateService(service.id, { active })
      setGroups((current) => current.map((group) => ({
        ...group,
        services: group.services.map((item) => (item.id === service.id ? { ...item, active: saved.service.active } : item)),
      })))
      setBanner({
        tone: 'ok',
        text: active ? `${service.name} is shown on the patient portal.` : `${service.name} is hidden from the patient portal.`,
      })
    } catch (err) {
      if (sessionFailure(err, onSignOut, onDenied)) return
      setBanner({ tone: 'error', text: err.message })
    } finally {
      setBusy('')
    }
  }

  return (
    <main className="page" id="main">
      <header className="page-head">
        <div>
          <h1>Services</h1>
          <p className="lede">
            Groups and the services inside them. Patients see a group only while it is shown and still has a shown service. The price they pay is the doctor’s fee.
          </p>
        </div>
        <button className="button" type="button" onClick={() => setAddingGroup((open) => !open)}>
          {addingGroup ? 'Close' : 'Add a group'}
        </button>
      </header>
      {banner ? <p className="notice" data-tone={banner.tone} role={banner.tone === 'error' ? 'alert' : 'status'}>{banner.text}</p> : null}
      {addingGroup ? (
        <form className="panel" onSubmit={onCreateGroup}>
          <h2>New group</h2>
          <div className="form-grid">
            <label className="field">
              <span>Name</span>
              <input value={groupDraft.name} onChange={(event) => setGroupDraft({ ...groupDraft, name: event.target.value })} required />
            </label>
            <label className="field field-wide">
              <span>Short description</span>
              <input value={groupDraft.blurb} onChange={(event) => setGroupDraft({ ...groupDraft, blurb: event.target.value })} required />
            </label>
          </div>
          <div className="actions">
            <button className="button" type="submit" disabled={busy !== ''}>
              {busy === 'group' ? 'Adding…' : 'Add group'}
            </button>
          </div>
        </form>
      ) : null}
      {state === 'loading' ? <p className="lede" role="status">Loading services…</p> : null}
      {state === 'error' ? <p className="notice" data-tone="error" role="alert">{error}</p> : null}
      {state === 'ready' ? (
        <div className="split-panels">
          <ul className="choice-list" aria-label="Service groups">
            {groups.map((group) => (
              <li key={group.id}>
                <a href={`#/services/${group.id}`} aria-current={selected?.id === group.id ? 'true' : undefined}>
                  <span className="roster-title">{group.name}</span>
                  <span className="roster-meta">{group.services.length} {group.services.length === 1 ? 'service' : 'services'}</span>
                  <Status active={group.active} />
                </a>
              </li>
            ))}
          </ul>
          {selected ? (
            <div className="stack">
              <form className="panel" onSubmit={onSaveGroup}>
                <div className="panel-top">
                  <h2>Group</h2>
                  <Status active={selected.active} />
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>Name</span>
                    <input
                      value={selected.name}
                      onChange={(event) => replaceGroup({ ...selected, name: event.target.value })}
                      required
                    />
                  </label>
                  <label className="field field-wide">
                    <span>Short description</span>
                    <input
                      value={selected.blurb}
                      onChange={(event) => replaceGroup({ ...selected, blurb: event.target.value })}
                      required
                    />
                  </label>
                  <label className="field field-wide">
                    <span>Field marks (one per line)</span>
                    <textarea
                      rows={3}
                      value={selected.fieldMarks || ''}
                      onChange={(event) => replaceGroup({ ...selected, fieldMarks: event.target.value })}
                      placeholder="Signs that this is the right group for a patient"
                    />
                  </label>
                  <label className="field field-wide">
                    <span>Often confused with</span>
                    <input
                      value={selected.confusedWith || ''}
                      onChange={(event) => replaceGroup({ ...selected, confusedWith: event.target.value })}
                      placeholder="Specialist care: choose that for a known, ongoing condition."
                    />
                  </label>
                </div>
                <p className="help">{selected.doctorCount} {selected.doctorCount === 1 ? 'doctor belongs' : 'doctors belong'} to this group.</p>
                <div className="actions">
                  <button className="button" type="submit" disabled={busy !== ''}>
                    {busy === 'save-group' ? 'Saving…' : 'Save group'}
                  </button>
                  {selected.active ? (
                    confirmHide === `group-${selected.id}` ? (
                      <div className="confirm" role="group" aria-label="Hide this group">
                        <p>Hide this group from the patient portal?</p>
                        <button className="button button-quiet" type="button" onClick={() => setGroupVisible(false)} disabled={busy !== ''}>
                          Hide group
                        </button>
                        <button className="button button-quiet" type="button" onClick={() => setConfirmHide('')} disabled={busy !== ''}>
                          Keep it shown
                        </button>
                      </div>
                    ) : (
                      <button className="button button-quiet" type="button" onClick={() => setConfirmHide(`group-${selected.id}`)} disabled={busy !== ''}>
                        Hide from portal
                      </button>
                    )
                  ) : (
                    <button className="button button-quiet" type="button" onClick={() => setGroupVisible(true)} disabled={busy !== ''}>
                      Show on portal
                    </button>
                  )}
                </div>
              </form>
              <section className="panel">
                <h2>Services in this group</h2>
                {selected.services.length === 0 ? <p className="empty">No services yet. Add one below.</p> : null}
                <ul className="plain-list">
                  {selected.services.map((service) => (
                    <li key={service.id}>
                      {editingService?.id === service.id ? (
                        <form className="inline-edit" onSubmit={onSaveService}>
                          <label className="field">
                            <span>Service name</span>
                            <input
                              value={editingService.name}
                              onChange={(event) => setEditingService({ ...editingService, name: event.target.value })}
                              required
                            />
                          </label>
                          <button className="button" type="submit" disabled={busy !== ''}>Save</button>
                          <button className="button button-quiet" type="button" onClick={() => setEditingService(null)}>Cancel</button>
                        </form>
                      ) : (
                        <div className="service-row">
                          <div>
                            <strong>{service.name}</strong>
                            <p className="roster-meta">
                              {service.doctorCount} {service.doctorCount === 1 ? 'doctor' : 'doctors'}
                            </p>
                          </div>
                          <Status active={service.active} />
                          <div className="actions">
                            <button className="button button-quiet" type="button" onClick={() => setEditingService({ id: service.id, name: service.name })}>
                              Rename
                            </button>
                            <button
                              className="button button-quiet"
                              type="button"
                              disabled={busy !== ''}
                              onClick={() => setServiceVisible(service, !service.active)}
                            >
                              {service.active ? 'Hide' : 'Show'}
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                <form className="inline-edit" onSubmit={onCreateService}>
                  <label className="field">
                    <span>New service</span>
                    <input
                      value={serviceDraft.name}
                      onChange={(event) => setServiceDraft({ name: event.target.value })}
                      placeholder="Service name"
                      required
                    />
                  </label>
                  <button className="button" type="submit" disabled={busy !== ''}>
                    {busy === 'service' ? 'Adding…' : 'Add service'}
                  </button>
                </form>
              </section>
            </div>
          ) : <p className="empty">Add a group to start the catalog.</p>}
        </div>
      ) : null}
    </main>
  )
}

function Status({ active }) {
  return <span className={active ? 'pill pill-on' : 'pill pill-off'}>{active ? 'Shown' : 'Hidden'}</span>
}
