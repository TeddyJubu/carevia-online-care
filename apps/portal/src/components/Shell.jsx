import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export function Shell() {
  const { user, ready, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/');
  }

  const name = user ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email : '';

  return (
    <div id="carevia">
      <header className="bc-nav">
        <Link className="bc-brand" to="/">
          carevia<span aria-hidden="true"> +</span>
        </Link>
        <Link className="bc-link" to="/">
          Services
        </Link>
        <Link className="bc-link" to="/doctors">
          Find a doctor
        </Link>
        {ready && user ? (
          <>
            <span className="bc-who">{name}</span>
            <button type="button" className="bc-primary" onClick={onLogout}>
              Log out
            </button>
          </>
        ) : (
          <>
            <Link className="bc-link" to="/login">
              Log in
            </Link>
            <Link className="bc-primary" to="/register">
              Register
            </Link>
          </>
        )}
      </header>
      <Outlet />
      <footer>
        Carevia · Private video consultations in Portugal · This is not an emergency service — call 112 · Recording
        stays off unless you give separate consent.
      </footer>
    </div>
  );
}
