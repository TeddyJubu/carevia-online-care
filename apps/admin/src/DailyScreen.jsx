import { useEffect, useRef, useState } from 'react'
import { getDaily, redact, saveDailyKey } from './api.js'

export default function DailyScreen({ user, onSignOut, onDenied, embedded = false }) {
  const [loadState, setLoadState] = useState('loading')
  const [status, setStatus] = useState({ enabled: false, hint: '' })
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [banner, setBanner] = useState(null)
  const onSignOutRef = useRef(onSignOut)
  const onDeniedRef = useRef(onDenied)
  onSignOutRef.current = onSignOut
  onDeniedRef.current = onDenied

  useEffect(() => {
    let live = true
    getDaily()
      .then((next) => {
        if (!live) return
        setStatus(next)
        setLoadState('ready')
      })
      .catch((error) => {
        if (!live) return
        if (error.status === 401) {
          onSignOutRef.current()
          return
        }
        if (error.status === 403) {
          onDeniedRef.current()
          return
        }
        setLoadState('error')
        setBanner({
          tone: 'error',
          text: error.unreachable
            ? 'The API at localhost:4000 did not respond. You can review this screen. Saving needs the API.'
            : error.message,
        })
      })
    return () => {
      live = false
    }
  }, [])

  async function onSave(event) {
    event.preventDefault()
    const apiKey = draft.trim()
    if (!apiKey || busy) return
    setBusy('save')
    setBanner(null)
    try {
      await saveDailyKey(apiKey)
      setDraft('')
      const next = await getDaily()
      setStatus(next)
      setLoadState('ready')
      setConfirmClear(false)
      setBanner({
        tone: 'ok',
        text: next.enabled
          ? 'Saved. Video consultations are on. Only the last four characters stay visible.'
          : 'Saved. Video consultations are still off.',
      })
    } catch (error) {
      if (error.status === 401) {
        onSignOut()
        return
      }
      if (error.status === 403) {
        onDenied()
        return
      }
      setBanner({
        tone: 'error',
        text: error.unreachable
          ? 'The API at localhost:4000 did not respond. The key was not saved.'
          : redact(error.message, apiKey),
      })
    } finally {
      setBusy('')
    }
  }

  async function onClear() {
    if (busy) return
    setBusy('clear')
    setBanner(null)
    try {
      await saveDailyKey('')
      setDraft('')
      const next = await getDaily()
      setStatus(next)
      setLoadState('ready')
      setConfirmClear(false)
      setBanner({ tone: 'ok', text: 'Cleared. Video consultations are off.' })
    } catch (error) {
      if (error.status === 401) {
        onSignOut()
        return
      }
      if (error.status === 403) {
        onDenied()
        return
      }
      setBanner({
        tone: 'error',
        text: error.unreachable
          ? 'The API at localhost:4000 did not respond. The key was not cleared.'
          : error.message,
      })
    } finally {
      setBusy('')
    }
  }

  const plateState = loadState === 'ready' ? (status.enabled ? 'on' : 'off') : loadState
  const plateLabel =
    plateState === 'on' ? 'On' : plateState === 'off' ? 'Off' : plateState === 'loading' ? 'Checking' : 'Unavailable'
  const windowText =
    loadState !== 'ready' ? '—' : status.hint ? `••••${status.hint}` : status.enabled ? 'Key saved' : 'No key saved'

  const body = (
      <main className={embedded ? 'page' : 'desk-main'} id="main">
        <section className="plate" data-state={plateState} aria-live="polite">
          <div className="plate-top">
            <p className="eyebrow on-dark">Video consultations</p>
            <p className="plate-state">{plateLabel}</p>
          </div>
          <p className="key-window" translate="no">
            {windowText}
          </p>
          <p className="plate-note">
            {loadState !== 'ready'
              ? 'Status loads from the server. Saving still needs the API.'
              : status.enabled && status.hint
                ? 'A key is on the server. This window shows the last four characters only.'
                : status.enabled
                  ? 'A key is on the server.'
                  : 'No key is active. Video stays off until one is saved.'}
          </p>
        </section>

        <section className="card">
          <h1>Daily API key</h1>
          <p className="lede">
            Video consultations stay off until a Daily API key is saved here. The key stays on the server, so it can be replaced later when the paid plan changes.
          </p>
          {banner ? (
            <p className="notice" data-tone={banner.tone} role={banner.tone === 'error' ? 'alert' : 'status'}>
              {banner.text}
            </p>
          ) : null}
          <form onSubmit={onSave} autoComplete="off">
            <label className="field">
              <span>New API key</span>
              <input
                type="password"
                name="dailyApiKey"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Paste a key"
                aria-describedby="key-help"
              />
            </label>
            <p id="key-help" className="help">
              The key is sent once, then cleared from this field. It is not stored in this browser.
            </p>
            <div className="actions">
              <button className="button" type="submit" disabled={busy !== '' || draft.trim() === ''}>
                {busy === 'save' ? 'Saving…' : 'Save key'}
              </button>
              {confirmClear ? (
                <div className="confirm" role="group" aria-label="Clear the Daily API key">
                  <p>Clear the saved key and turn video consultations off?</p>
                  <button className="button button-quiet" type="button" onClick={onClear} disabled={busy !== ''}>
                    {busy === 'clear' ? 'Clearing…' : 'Clear key'}
                  </button>
                  <button className="button button-quiet" type="button" onClick={() => setConfirmClear(false)} disabled={busy !== ''}>
                    Keep key
                  </button>
                </div>
              ) : (
                <button className="button button-quiet" type="button" onClick={() => setConfirmClear(true)} disabled={busy !== ''}>
                  Clear key
                </button>
              )}
            </div>
          </form>
        </section>
      </main>
  )

  if (embedded) return body

  return (
    <div className="desk">
      <header className="desk-bar">
        <p className="wordmark">Carevia</p>
        <p className="desk-user">{user?.email || 'Admin'}</p>
        <button className="button button-quiet" type="button" onClick={onSignOut}>
          Sign out
        </button>
      </header>
      {body}
    </div>
  )
}
