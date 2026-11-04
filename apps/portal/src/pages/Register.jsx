import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { RegisterForm } from '../components/AccountForms';
import { useTitle } from '../components/ui';
import { safeNext } from '../format';

export function Register() {
  useTitle('Register');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'));
  const loginNext = next === '/' ? '' : `?next=${encodeURIComponent(next)}`;

  return (
    <main className="bc-main">
      <div className="bc-compact">
        <p>
          <Link to={`/login${loginNext}`}>Already have an account? Log in</Link>
        </p>
        <div className="bc-kicker">Your patient account</div>
        <h1>A place for all your care.</h1>
        <p>Create your profile with the details we need to book a consultation.</p>
        <RegisterForm
          onSuccess={(user) => {
            if (user) navigate(next);
            else navigate(`/login${loginNext}`);
          }}
        />
      </div>
    </main>
  );
}
