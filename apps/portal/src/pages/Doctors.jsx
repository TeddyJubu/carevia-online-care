import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api, plainMessage } from '../api';
import { Banner, SearchIcon, Steps, useTitle } from '../components/ui';
import { formatEuro, initialsFor } from '../format';

const LANGUAGES = ['English', 'French', 'German', 'Portuguese', 'Spanish', 'Italian'];
const SPECIALTIES = [
  'Family medicine',
  'Paediatrics',
  'General practitioner',
  'Child psychiatry',
  'Psychiatry',
  'Clinical psychology',
  'Psychology',
  'Clinical nutrition',
  'Dietetics',
  'Gynaecology',
  'Neurology',
  'Endocrinology',
  'Rheumatology',
  'Travel medicine',
  'General medicine',
  'Medical assessments',
  'Dermatology',
];
const FEES = [
  ['60', 'Up to €60'],
  ['80', 'Up to €80'],
  ['100', 'Up to €100'],
  ['150', 'Up to €150'],
];
const AVAILABILITY = [
  ['0', 'By 30 October'],
  ['1', 'By 2 November'],
  ['2', 'By 5 November'],
];

function filtersFrom(params) {
  return {
    q: params.get('q') || '',
    language: params.get('language') || '',
    specialty: params.get('specialty') || '',
    maxFee: params.get('maxFee') || '',
    availability: params.get('availability') || '',
    service: params.get('service') || '',
    group: params.get('group') || '',
  };
}

export function Doctors() {
  useTitle('Find a doctor');
  const [params, setParams] = useSearchParams();
  const filters = filtersFrom(params);
  const [draft, setDraft] = useState(filters.q);
  const [groups, setGroups] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [state, setState] = useState('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setDraft(filters.q);
  }, [filters.q]);

  useEffect(() => {
    let cancelled = false;
    api
      .services()
      .then((next) => {
        if (!cancelled) setGroups(next);
      })
      .catch(() => {
        if (!cancelled) setGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    api
      .doctors(filters)
      .then((next) => {
        if (cancelled) return;
        setDoctors(next);
        setState('ready');
      })
      .catch((error) => {
        if (cancelled) return;
        setDoctors([]);
        setState('error');
        setMessage(
          error instanceof ApiError
            ? plainMessage(error, 'Doctors could not be loaded.')
            : 'Doctors could not be loaded.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [params]);

  const activeGroup = groups.find((group) => String(group.id) === String(filters.group));
  const serviceOptions = activeGroup?.services?.length
    ? activeGroup.services
    : [...new Set(groups.flatMap((group) => group.services))];

  const specialties = useMemo(() => {
    const values = new Set(SPECIALTIES);
    if (filters.specialty) values.add(filters.specialty);
    doctors.forEach((doctor) => {
      if (doctor.specialty) values.add(doctor.specialty);
    });
    return [...values];
  }, [doctors, filters.specialty]);

  function update(next) {
    const merged = { ...filters, ...next };
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) {
      if (value) query.set(key, value);
    }
    setParams(query);
  }

  function onSearch(event) {
    event.preventDefault();
    update({ q: draft.trim() });
  }

  function clearFilters() {
    update({ language: '', specialty: '', maxFee: '', availability: '' });
  }

  function showAll() {
    setDraft('');
    setParams(new URLSearchParams());
  }

  return (
    <main className="bc-main">
      <Steps current={0} />
      <div className="bc-kicker">Find your care</div>
      <h1>Choose who cares for you.</h1>
      <form className="bc-searchbar bc-searchbar-page" onSubmit={onSearch}>
        <label className="bc-search">
          <SearchIcon />
          <input
            aria-label="Search doctors and services"
            placeholder="Search doctors, services or concerns"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <button className="bc-primary" type="submit">
          Search
        </button>
      </form>
      <div className="bc-fields">
        <label>
          Service category
          <select
            value={filters.group}
            onChange={(event) => {
              const group = event.target.value;
              const match = groups.find((item) => String(item.id) === group);
              const service =
                match && filters.service && !match.services.includes(filters.service) ? '' : filters.service;
              update({ group, service });
            }}
          >
            <option value="">Any category</option>
            {groups.map((group) => (
              <option key={String(group.id)} value={String(group.id)}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Service
          <select value={filters.service} onChange={(event) => update({ service: event.target.value })}>
            <option value="">Any service</option>
            {serviceOptions.map((service) => (
              <option key={service} value={service}>
                {service}
              </option>
            ))}
          </select>
        </label>
      </div>
      <section className="bc-box bc-filters">
        <h3>Find the right fit</h3>
        <div className="bc-fields">
          <label>
            Language
            <select value={filters.language} onChange={(event) => update({ language: event.target.value })}>
              <option value="">Any language</option>
              {LANGUAGES.map((language) => (
                <option key={language}>{language}</option>
              ))}
            </select>
          </label>
          <label>
            Specialty
            <select value={filters.specialty} onChange={(event) => update({ specialty: event.target.value })}>
              <option value="">Any specialty</option>
              {specialties.map((specialty) => (
                <option key={specialty}>{specialty}</option>
              ))}
            </select>
          </label>
          <label>
            Availability
            <select value={filters.availability} onChange={(event) => update({ availability: event.target.value })}>
              <option value="">Any date</option>
              {AVAILABILITY.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Maximum fee
            <select value={filters.maxFee} onChange={(event) => update({ maxFee: event.target.value })}>
              <option value="">Any price</option>
              {FEES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="button" onClick={clearFilters}>
          Clear filters
        </button>
      </section>
      {state === 'loading' ? <p className="bc-muted">Loading doctors…</p> : null}
      {state === 'error' ? <Banner tone="error">{message}</Banner> : null}
      {state === 'ready' ? (
        <p className="bc-muted" role="status">
          {doctors.length} matching doctor{doctors.length === 1 ? '' : 's'}
          {filters.service ? ` for ${filters.service}` : ''}. Fees are shown in euros.
        </p>
      ) : null}
      {state === 'ready' && doctors.length === 0 ? (
        <section className="bc-box">
          <h2>No doctors match these filters.</h2>
          <p>Try another language, a later date or a higher price limit.</p>
          <button type="button" className="bc-primary" onClick={showAll}>
            Show all doctors
          </button>
        </section>
      ) : null}
      {doctors.map((doctor) => {
        const profileQuery = new URLSearchParams();
        if (filters.service) profileQuery.set('service', filters.service);
        const profileTo = `/doctors/${doctor.id}${profileQuery.toString() ? `?${profileQuery}` : ''}`;
        return (
          <article key={doctor.id} className="bc-box bc-doctor-card">
            <div>
              <div className="bc-row">
                <div className="bc-avatar" aria-hidden="true">
                  {initialsFor(doctor.name, doctor.initials)}
                </div>
                <div>
                  <h3>{doctor.name}</h3>
                  <p>{doctor.specialty || 'Specialty not listed'}</p>
                  <span className="bc-muted">
                    {doctor.languages || 'Languages not listed'}
                    {doctor.experience ? ` · ${doctor.experience}` : ''}
                  </span>
                </div>
              </div>
              {doctor.approach ? <p className="bc-muted bc-approach">{doctor.approach}</p> : null}
              <Link to={profileTo}>View doctor profile</Link>
            </div>
            <div className="bc-doctor-calendar">
              <h3>{formatEuro(doctor.fee) || 'Fee not listed'}</h3>
              <p className="bc-muted">Consultation fee</p>
              {doctor.firstDay ? (
                <p>
                  Next available
                  <br />
                  <strong>{doctor.firstDay}</strong>
                </p>
              ) : null}
              <Link className="bc-primary" to={profileTo}>
                Choose a time
              </Link>
            </div>
          </article>
        );
      })}
    </main>
  );
}
