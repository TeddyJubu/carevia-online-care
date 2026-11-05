import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, api, apiId, plainMessage } from '../api';
import { useAuth } from '../auth';
import { AuthLinks, LoginForm, RegisterForm } from '../components/AccountForms';
import { Banner, Steps, useTitle } from '../components/ui';
import { formatEuro, groupSlots, initialsFor, rememberAppointment } from '../format';

export function Booking() {
  useTitle('Book a visit');
  const { doctorId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [doctor, setDoctor] = useState(null);
  const [slots, setSlots] = useState([]);
  const [service, setService] = useState(params.get('service') || '');
  const [slot, setSlot] = useState(params.get('slot') || '');
  const [channel, setChannel] = useState('video');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [authRequired, setAuthRequired] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([api.doctor(doctorId), api.slots(doctorId)])
      .then(([nextDoctor, nextSlots]) => {
        if (cancelled) return;
        setDoctor(nextDoctor);
        setSlots(nextSlots);
        const offered = nextDoctor?.services || [];
        const requested = params.get('service') || '';
        const nextService = offered.includes(requested) ? requested : offered[0] || requested;
        setService(nextService);
        if (nextService && nextService !== requested) {
          const next = new URLSearchParams(params);
          next.set('service', nextService);
          setParams(next, { replace: true });
        }
        setLoadError('');
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(
          error instanceof ApiError
            ? plainMessage(error, 'This booking could not be loaded.')
            : 'This booking could not be loaded.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [doctorId]);

  function chooseSlot(nextSlot) {
    setSlot(nextSlot);
    const next = new URLSearchParams(params);
    if (service) next.set('service', service);
    next.set('slot', nextSlot);
    setParams(next, { replace: true });
  }

  function chooseService(nextService) {
    setService(nextService);
    const next = new URLSearchParams(params);
    if (nextService) next.set('service', nextService);
    else next.delete('service');
    if (slot) next.set('slot', slot);
    setParams(next, { replace: true });
  }

  const here = `/book/${doctorId}${params.toString() ? `?${params}` : ''}`;

  async function onSubmit(event) {
    event.preventDefault();
    setFormError('');
    setNotice('');
    if (!slot) {
      setFormError('Choose a time to continue.');
      return;
    }
    if (channel !== 'video') {
      setFormError('Choose a video consultation. Audio cannot be booked.');
      return;
    }
    if (!service) {
      setFormError('Choose a service to continue.');
      return;
    }
    setPending(true);
    try {
      const appointment = await api.book({
        doctorId: apiId(doctorId),
        service,
        slot,
        channel: 'video',
      });
      if (!appointment?.id) {
        setFormError('The booking did not return an appointment.');
        return;
      }
      rememberAppointment(appointment, {
        doctorName: doctor?.name || '',
        fee: doctor?.fee ?? null,
      });
      navigate(`/visits/${appointment.id}`);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.code === 'AUTH_REQUIRED')) {
        setAuthRequired(true);
        setFormError(plainMessage(error, 'Log in or register to book a consultation.'));
        return;
      }
      setFormError(
        error instanceof ApiError
          ? plainMessage(error, 'The booking could not be saved.')
          : 'The booking could not be saved.',
      );
    } finally {
      setPending(false);
    }
  }

  function signedIn() {
    setAuthRequired(false);
    setNotice('You’re signed in. Submit the booking again to confirm this video visit.');
  }

  const days = groupSlots(slots);

  return (
    <main className="bc-main">
      <Steps current={user ? 3 : authRequired ? 2 : 1} />
      <Link to={`/doctors/${doctorId}`}>← Back to doctor</Link>
      <div className="bc-kicker">Booking</div>
      <h1>Check your appointment.</h1>
      {loading ? <p className="bc-muted">Loading times…</p> : null}
      {loadError ? <Banner tone="error">{loadError}</Banner> : null}
      <form onSubmit={onSubmit}>
        <div className="bc-two">
          <section>
            {doctor ? (
              <div className="bc-box">
                <div className="bc-row">
                  <div className="bc-avatar" aria-hidden="true">
                    {initialsFor(doctor.name, doctor.initials)}
                  </div>
                  <div>
                    <h2>{doctor.name}</h2>
                    <p className="bc-muted">
                      {doctor.specialty || 'Specialty not listed'}
                      {doctor.cedula ? ` · ${doctor.cedula}` : ''}
                    </p>
                  </div>
                </div>
                <label>
                  Service
                  <select value={service} onChange={(event) => chooseService(event.target.value)} required>
                    <option value="">Choose a service</option>
                    {(doctor.services.length ? doctor.services : service ? [service] : []).map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
            <div className="bc-box">
              <h2>Choose your appointment</h2>
              <p className="bc-muted">Times shown as returned by the schedule.</p>
              {days.length === 0 && !loading ? <p>No open times were returned.</p> : null}
              {days.map((day) => (
                <div key={day.day}>
                  <h3>{day.day}</h3>
                  <div className="bc-slots">
                    {day.times.map((time) => (
                      <button
                        key={time.slot}
                        type="button"
                        aria-pressed={slot === time.slot}
                        onClick={() => chooseSlot(time.slot)}
                      >
                        {time.time}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <fieldset className="bc-box">
              <legend>Consultation type</legend>
              <p className="bc-muted">Video visits open in the browser. Audio visits are not open in this portal.</p>
              <label className="bc-channel">
                <input
                  type="radio"
                  name="channel"
                  value="video"
                  checked={channel === 'video'}
                  onChange={() => setChannel('video')}
                />
                <span>
                  <strong>Video</strong>
                  <small>Join in the browser. Recording stays off unless you give separate consent.</small>
                </span>
              </label>
              <label className="bc-channel is-disabled" aria-disabled="true">
                <input type="radio" name="channel" value="audio" disabled aria-disabled="true" checked={false} readOnly />
                <span>
                  <strong>Audio</strong>
                  <small>Unavailable. A phone visit cannot be selected or booked.</small>
                </span>
              </label>
            </fieldset>
          </section>
          <aside className="bc-box">
            <h3>{service || 'Choose a service'}</h3>
            <p>
              {doctor?.name || 'Doctor'}
              <br />
              Video consultation
            </p>
            <p>
              <strong>{slot || 'Choose an available time'}</strong>
            </p>
            <p>
              <strong>{formatEuro(doctor?.fee) || 'Fee not listed'}</strong>
            </p>
            <p className="bc-muted">
              The fee is the consultation price. This test booking confirms the visit without taking payment. This is
              not an emergency service — call 112 if you need urgent help.
            </p>
            {user ? (
              <p className="bc-muted">
                Booking as {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}.
              </p>
            ) : null}
            {notice ? <Banner>{notice}</Banner> : null}
            {formError ? (
              <p className="bc-error" role="alert">
                {formError}
              </p>
            ) : null}
            <button className="bc-primary" type="submit" disabled={pending || loading || !doctor}>
              {pending ? 'Booking…' : 'Book video consultation'}
            </button>
          </aside>
        </div>
      </form>
      {authRequired ? (
        <section className="bc-auth-gate" aria-label="Log in or register to book">
          <Banner tone="error">You need to log in or register before this visit can be booked.</Banner>
          <AuthLinks next={here} />
          <div className="bc-two">
            <div>
              <h2>Log in</h2>
              <LoginForm defaultEmail={pendingEmail} onSuccess={signedIn} />
            </div>
            <div>
              <h2>Register</h2>
              <RegisterForm
                onSuccess={(nextUser, email) => {
                  if (nextUser) signedIn();
                  else {
                    setPendingEmail(email);
                    setNotice('Your account was created. Log in with that email, then submit this booking again.');
                  }
                }}
              />
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
