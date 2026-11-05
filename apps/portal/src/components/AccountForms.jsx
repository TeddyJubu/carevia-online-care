import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, plainMessage } from '../api';
import { useAuth } from '../auth';

function fieldError(error) {
  return plainMessage(error, 'That did not work. Check the details and try again.');
}

export function LoginForm({ onSuccess, defaultEmail = '', submitLabel = 'Log in' }) {
  const { login } = useAuth();
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (defaultEmail) setEmail(defaultEmail);
  }, [defaultEmail]);

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      const user = await login({ email: email.trim(), password });
      onSuccess?.(user);
    } catch (caught) {
      setError(caught instanceof ApiError ? fieldError(caught) : 'The Carevia server is not reachable.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="bc-box">
      <label>
        Email
        <input
          type="email"
          name="email"
          required
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <p className="bc-muted">Test patient, when seeded: patient@example.com and demo-password.</p>
      {error ? (
        <p className="bc-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="bc-primary" type="submit" disabled={pending}>
        {pending ? 'Signing in…' : submitLabel}
      </button>
    </form>
  );
}

export function RegisterForm({ onSuccess }) {
  const { register } = useAuth();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  function update(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      const user = await register({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        dateOfBirth: form.dateOfBirth,
        password: form.password,
      });
      onSuccess?.(user, form.email.trim());
    } catch (caught) {
      setError(caught instanceof ApiError ? fieldError(caught) : 'The Carevia server is not reachable.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="bc-box">
      <div className="bc-fields">
        <label>
          First name
          <input name="firstName" required autoComplete="given-name" value={form.firstName} onChange={update} />
        </label>
        <label>
          Last name
          <input name="lastName" required autoComplete="family-name" value={form.lastName} onChange={update} />
        </label>
        <label>
          Email
          <input type="email" name="email" required autoComplete="email" value={form.email} onChange={update} />
        </label>
        <label>
          Phone
          <input type="tel" name="phone" required autoComplete="tel" value={form.phone} onChange={update} />
        </label>
        <label>
          Date of birth
          <input type="date" name="dateOfBirth" required autoComplete="bday" value={form.dateOfBirth} onChange={update} />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={form.password}
            onChange={update}
          />
        </label>
      </div>
      {error ? (
        <p className="bc-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="bc-primary" type="submit" disabled={pending}>
        {pending ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}

export function AuthLinks({ next }) {
  const query = next ? `?next=${encodeURIComponent(next)}` : '';
  return (
    <div className="bc-row">
      <Link to={`/login${query}`}>Log in</Link>
      <Link to={`/register${query}`}>Create an account</Link>
    </div>
  );
}
