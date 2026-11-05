import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api, plainMessage } from '../api';
import { Banner, useTitle } from '../components/ui';
import { formatEuro, recalledAppointment } from '../format';

const VIDEO_OFF = 'Video is off until an administrator saves a Daily API key.';
const VIDEO_FAILED = 'The video service could not start this visit. Nothing was connected.';

export function VideoVisit() {
  useTitle('Video visit');
  const { appointmentId } = useParams();
  const saved = recalledAppointment(appointmentId);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState('loading');
  const [message, setMessage] = useState('');
  const [join, setJoin] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setPhase('loading');
    setMessage('');
    setJoin(null);
    (async () => {
      try {
        const status = await api.videoStatus();
        if (cancelled) return;
        if (!status.enabled) {
          setPhase('off');
          setMessage(VIDEO_OFF);
          return;
        }
        const details = await api.videoToken(appointmentId);
        if (cancelled) return;
        if (details.token || details.url) {
          setJoin(details);
          setPhase('join');
          return;
        }
        setPhase('message');
        setMessage('The video service did not return a join token.');
      } catch (error) {
        if (cancelled) return;
        const disabled = error instanceof ApiError && (error.status === 409 || error.code === 'VIDEO_DISABLED');
        const upstream = error instanceof ApiError && error.status === 502;
        setPhase('message');
        if (disabled) setMessage(plainMessage(error, VIDEO_OFF));
        else if (upstream) setMessage(plainMessage(error, VIDEO_FAILED));
        else setMessage(error instanceof ApiError ? plainMessage(error, VIDEO_FAILED) : VIDEO_FAILED);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appointmentId, attempt]);

  return (
    <main className="bc-main">
      <div className="bc-kicker">Consultation room</div>
      <h1>{saved?.service || 'Video visit'}</h1>
      <p className="bc-muted">
        {saved?.doctorName ? `${saved.doctorName} · ` : ''}
        {saved?.slot || 'Appointment saved'}
        {saved?.fee != null ? ` · ${formatEuro(saved.fee)}` : ''}
      </p>
      {phase === 'loading' ? <p>Checking whether video can open…</p> : null}
      {phase === 'off' || phase === 'message' ? (
        <section className="bc-box">
          <Banner tone="error">{message}</Banner>
          <p className="bc-muted">No call was started from this page.</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            Check again
          </button>
        </section>
      ) : null}
      {phase === 'join' && join ? (
        <div className="bc-two">
          <section>
            <div className={join.url ? 'bc-video bc-video-live' : 'bc-video'}>
              {join.url ? (
                <iframe
                  title="Video visit"
                  src={join.url}
                  allow="camera; microphone; fullscreen; display-capture; autoplay"
                />
              ) : (
                <div>
                  <h2>Ready to join</h2>
                  <p>A meeting token was issued for this visit.</p>
                  <p>No room link was returned, so this page will not open a call by itself.</p>
                </div>
              )}
            </div>
            <p className="bc-muted">
              Recording stays off unless you give separate consent. If the call drops, this same appointment stays
              open. This is not an emergency service — call 112.
            </p>
          </section>
          <aside className="bc-box">
            <h3>Your consultation</h3>
            <p>Use a private space with enough light and a working camera and microphone.</p>
            <p className="bc-muted">
              The doctor’s name and registration stay on this page. They are not sent to the video room as your name.
            </p>
            <Link to="/doctors">Back to doctors</Link>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
