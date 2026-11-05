import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LoginForm } from '../components/AccountForms';
import { useTitle } from '../components/ui';
import { safeNext } from '../format';

export function Login() {
  useTitle('Log in');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'));

  return (
    <main className="bc-main bc-compact">
      <div className="bc-kicker">Patient access</div>
      <h1>Welcome back.</h1>
      <p>Log in to book care and open your video visit.</p>
      <LoginForm onSuccess={() => navigate(next)} />
      <p>
        <Link to={`/register${next === '/' ? '' : `?next=${encodeURIComponent(next)}`}`}>Create an account</Link>
      </p>
    </main>
  );
}
