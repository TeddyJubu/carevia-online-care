export default function DeniedScreen({ user, onSignOut }) {
  const who = user?.email || 'This account'
  return (
    <main className="gate" id="main">
      <section className="card gate-card">
        <p className="eyebrow">Operations</p>
        <h1>This account is not an admin.</h1>
        <p className="lede">
          {who} cannot open the Daily settings. Sign in with an admin account.
        </p>
        <button className="button" type="button" onClick={onSignOut}>
          Sign out
        </button>
      </section>
    </main>
  )
}
