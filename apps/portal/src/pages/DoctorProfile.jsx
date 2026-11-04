import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, api, plainMessage } from '../api';
import { Banner, Steps, useTitle } from '../components/ui';
import { formatEuro, groupSlots, initialsFor } from '../format';

export function DoctorProfile() {
  const { doctorId } = useParams();
  const [params] = useSearchParams();
  const requestedService = params.get('service') || '';
  const [doctor, setDoctor] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selected, setSelected] = useState('');
  const [state, setState] = useState('loading');
  const [message, setMessage] = useState('');

  useTitle(doctor?.name || 'Doctor');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    Promise.all([api.doctor(doctorId), api.slots(doctorId)])
      .then(([nextDoctor, nextSlots]) => {
        if (cancelled) return;
        setDoctor(nextDoctor);
        setSlots(nextSlots);
        setState('ready');
      })
      .catch((error) => {
        if (cancelled) return;
        setState('error');
        setMessage(
          error instanceof ApiError
            ? plainMessage(error, 'This doctor profile could not be loaded.')
            : 'This doctor profile could not be loaded.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [doctorId]);

  const service = requestedService || doctor?.services?.[0] || '';
  const days = groupSlots(slots);
  const bookingQuery = new URLSearchParams();
  if (service) bookingQuery.set('service', service);
  if (selected) bookingQuery.set('slot', selected);
  const bookingTo = `/book/${doctorId}${bookingQuery.toString() ? `?${bookingQuery}` : ''}`;

  return (
    <main className="bc-main">
      <Steps current={0} />
      <Link to="/doctors">← Back to doctors</Link>
      {state === 'loading' ? <p className="bc-muted">Loading this doctor…</p> : null}
      {state === 'error' ? <Banner tone="error">{message}</Banner> : null}
      {doctor ? (
        <div className="bc-two bc-profile">
          <section className="bc-box">
            <div className="bc-row">
              <div className="bc-avatar" aria-hidden="true">
                {initialsFor(doctor.name, doctor.initials)}
              </div>
              <div>
                <h1 className="bc-doctor-name">{doctor.name}</h1>
                <p>
                  {doctor.specialty || 'Specialty not listed'} · Video consultations
                </p>
              </div>
            </div>
            <hr className="bc-rule" />
            {doctor.approach ? (
              <>
                <h3>About your doctor</h3>
                <p>{doctor.approach}</p>
              </>
            ) : null}
            <h3>Languages</h3>
            <p>{doctor.languages || 'Languages not listed'}</p>
            <h3>Experience and qualifications</h3>
            <p>
              {doctor.experience || 'Experience not listed'}
              {doctor.education ? (
                <>
                  <br />
                  {doctor.education}
                </>
              ) : null}
            </p>
            <h3>Services</h3>
            <p>{doctor.services.length ? doctor.services.join(', ') : 'Services not listed'}</p>
            <h3>Professional registration</h3>
            <p>{doctor.cedula || 'Registration number not listed'}</p>
            <p className="bc-muted">
              The consultation fee is {formatEuro(doctor.fee) || 'not listed'}. An in-person visit is the alternative
              when an examination is needed.
            </p>
          </section>
          <aside className="bc-box">
            <h2>Available times</h2>
            <p className="bc-muted">Local times from the schedule. Choose one to continue.</p>
            {days.length === 0 ? <p>No open times were returned for this doctor.</p> : null}
            {days.map((day) => (
              <div key={day.day}>
                <h3>{day.day}</h3>
                <div className="bc-slots">
                  {day.times.map((time) => (
                    <button
                      key={time.slot}
                      type="button"
                      aria-pressed={selected === time.slot}
                      onClick={() => setSelected(time.slot)}
                    >
                      {time.time}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <p>
              <strong>{formatEuro(doctor.fee) || 'Fee not listed'}</strong>
            </p>
            {selected ? (
              <Link className="bc-primary" to={bookingTo}>
                Continue with this time
              </Link>
            ) : (
              <p className="bc-muted">Choose a time to continue to booking.</p>
            )}
          </aside>
        </div>
      ) : null}
    </main>
  );
}
