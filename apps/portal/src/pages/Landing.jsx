import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api, plainMessage } from '../api';
import { Banner, SearchIcon, ServiceIcon, useTitle } from '../components/ui';

export function Landing() {
  useTitle('Find care');
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState([]);
  const [state, setState] = useState('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .services()
      .then((next) => {
        if (cancelled) return;
        setGroups(next);
        setState('ready');
      })
      .catch((error) => {
        if (cancelled) return;
        setState('error');
        setMessage(
          error instanceof ApiError
            ? plainMessage(error, 'The service catalogue is not available yet.')
            : 'The service catalogue is not available yet.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function search(event) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    navigate(`/doctors${params.toString() ? `?${params}` : ''}`);
  }

  return (
    <>
      <section className="bc-hero">
        <div>
          <div className="bc-kicker">Healthcare, made personal</div>
          <h1>
            Find the right care.
            <br />
            Feel better supported.
          </h1>
          <p>Choose a service, meet your doctor and book a time that suits you.</p>
          <form className="bc-searchbar" onSubmit={search}>
            <label className="bc-search">
              <SearchIcon />
              <input
                aria-label="Search services"
                placeholder="Service, specialty or health concern"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <span className="bc-consultation-label">Video consultations</span>
            <button className="bc-primary" type="submit">
              Find care →
            </button>
          </form>
        </div>
        <div className="bc-hero-photo">
          <div className="bc-hero-mark">
            <span>Video visit</span>
            <strong>A private consultation, in the browser.</strong>
          </div>
          <span className="bc-photo-caption">Personal care. Wherever you are.</span>
        </div>
      </section>
      <section className="bc-promos" aria-label="Patient care options">
        <article className="bc-promo">
          <div className="bc-promo-icon" aria-hidden="true">
            <ServiceIcon />
          </div>
          <div>
            <h3>A doctor, wherever you are</h3>
            <p>Choose your doctor and connect from a comfortable place.</p>
            <Link to="/doctors">Find a consultation →</Link>
          </div>
        </article>
        <article className="bc-promo">
          <div className="bc-promo-icon" aria-hidden="true">
            <ServiceIcon />
          </div>
          <div>
            <h3>Your care in one place</h3>
            <p>Create an account to book a video consultation.</p>
            <Link to="/register">Create your account →</Link>
          </div>
        </article>
      </section>
      <main className="bc-main bc-home-main">
        <div className="bc-section-heading">
          <h2>What can we help you with?</h2>
          <p>Explore services and choose the care you need.</p>
        </div>
        {state === 'loading' ? <p className="bc-muted">Loading services…</p> : null}
        {state === 'error' ? (
          <Banner tone="error">
            {message} You can still register or log in. Search again when the server is available.
          </Banner>
        ) : null}
        {state === 'ready' && groups.length === 0 ? <p>No services are published yet.</p> : null}
        <div className="bc-grid">
          {groups.map((group) => {
            const query = new URLSearchParams();
            query.set('group', String(group.id));
            if (group.services[0]) query.set('service', group.services[0]);
            return (
            <Link key={String(group.id)} className="bc-service" to={`/doctors?${query}`}>
              <span className="bc-icon" aria-hidden="true">
                <ServiceIcon />
              </span>
              <strong>{group.name}</strong>
              <span>{group.blurb}</span>
            </Link>
            );
          })}
        </div>
        <div className="bc-box bc-family">
          <div className="bc-row bc-between">
            <div>
              <h3>Good care, for the whole family.</h3>
              <span className="bc-muted">Explore consultations and choose a doctor.</span>
            </div>
            <Link to="/doctors">Explore consultations →</Link>
          </div>
        </div>
      </main>
    </>
  );
}
