import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { isAdult } from '@/lib/age'
import { authClient } from '@/lib/auth-client'

const input =
  'mt-2 w-full rounded-xl border bg-white/5 px-4 py-3 text-base [color-scheme:dark] outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'
const label = 'block text-sm text-muted-foreground'

function Shell({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <div className="min-h-svh">
      <header className="mx-auto flex max-w-7xl items-center px-8 py-6">
        <a href="/" className="flex items-center gap-2.5 font-serif text-3xl tracking-tight">
          <img src="/carevia-mark.png" alt="" width={28} height={28} className="size-7 brightness-0 invert" />
          Carevia
        </a>
      </header>
      <main className="mx-auto max-w-md px-6 pt-10 pb-24">
        <h1 className="font-serif text-5xl leading-[0.95] font-normal tracking-[-1.5px]">{title}</h1>
        {intro && <p className="mt-4 leading-relaxed text-muted-foreground">{intro}</p>}
        <div className="mt-10">{children}</div>
      </main>
    </div>
  )
}

type Result = { error: { message?: string } | null }

// One place for submit, pending and error state, shared by both forms.
function useAuthForm(send: (form: FormData) => Promise<Result> | string, done: string) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const sent = send(new FormData(e.currentTarget))
    if (typeof sent === 'string') return setError(sent) // a client-side check failed
    setPending(true)
    const { error } = await sent
    setPending(false)
    if (error) return setError(error.message ?? 'Something went wrong. Please try again.')
    location.assign(done)
  }
  const message = error && (
    <p role="alert" className="rounded-xl border border-destructive/50 px-4 py-3 text-sm text-destructive">
      {error}
    </p>
  )
  return { onSubmit, pending, message }
}

const field = (form: FormData, name: string) => String(form.get(name) ?? '')

export function SignIn() {
  const { onSubmit, pending, message } = useAuthForm(
    (f) => authClient.signIn.email({ email: field(f, 'email'), password: field(f, 'password') }),
    '/account',
  )
  return (
    <Shell title="Sign in" intro="See your visits, summaries and documents.">
      <form onSubmit={onSubmit} className="space-y-6">
        <label className={label}>
          Email
          <input name="email" type="email" autoComplete="email" required className={input} />
        </label>
        <label className={label}>
          Password
          <input name="password" type="password" autoComplete="current-password" required className={input} />
        </label>
        {message}
        <Button type="submit" variant="glass" size="pill" disabled={pending} className="w-full">
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="mt-8 text-sm text-muted-foreground">
        New to Carevia?{' '}
        <a href="/signup" className="text-foreground underline underline-offset-4">
          Create an account
        </a>
      </p>
    </Shell>
  )
}

export function SignUp() {
  const today = new Date().toISOString().slice(0, 10)
  const { onSubmit, pending, message } = useAuthForm((f) => {
    const dateOfBirth = field(f, 'dateOfBirth')
    if (!isAdult(dateOfBirth)) return 'You need to be 18 or over to create an account. A parent or guardian can book for a child.'
    return authClient.signUp.email({ name: field(f, 'name'), email: field(f, 'email'), password: field(f, 'password'), dateOfBirth })
  }, '/account')
  return (
    <Shell title="Create your account" intro="Your summary and documents are saved here after each visit.">
      <form onSubmit={onSubmit} className="space-y-6">
        <label className={label}>
          Full name
          <input name="name" autoComplete="name" required className={input} />
        </label>
        <label className={label}>
          Email
          <input name="email" type="email" autoComplete="email" required className={input} />
        </label>
        <label className={label}>
          Password <span className="text-xs">(at least 8 characters)</span>
          <input name="password" type="password" autoComplete="new-password" minLength={8} required className={input} />
        </label>
        <label className={label}>
          Date of birth
          <input name="dateOfBirth" type="date" autoComplete="bday" max={today} required className={input} />
        </label>
        <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          Booking for your child? Create your own account first. You'll add them as a family member.
        </p>
        {message}
        <Button type="submit" variant="glass" size="pill" disabled={pending} className="w-full">
          {pending ? 'Creating your account…' : 'Create account'}
        </Button>
      </form>
      <p className="mt-8 text-sm text-muted-foreground">
        Already have an account?{' '}
        <a href="/signin" className="text-foreground underline underline-offset-4">
          Sign in
        </a>
      </p>
    </Shell>
  )
}

export function Account() {
  const { data, isPending } = authClient.useSession()
  useEffect(() => {
    if (!isPending && !data) location.replace('/signin')
  }, [isPending, data])

  if (!data) return <Shell title="Your account">{null}</Shell>
  const { user } = data
  // timeZone UTC: "1990-04-02" is parsed as UTC midnight, so formatting in local time could show the 1st.
  const born = new Date(user.dateOfBirth).toLocaleDateString(undefined, { dateStyle: 'long', timeZone: 'UTC' })

  return (
    <Shell title={`Hello, ${user.name.split(' ')[0]}`}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 border-y py-6 text-sm">
        <dt className="text-muted-foreground">Email</dt>
        <dd>{user.email}</dd>
        <dt className="text-muted-foreground">Date of birth</dt>
        <dd>{born}</dd>
      </dl>
      <section className="mt-10">
        <h2 className="font-serif text-3xl font-normal tracking-tight">Your visits</h2>
        <p className="mt-3 text-muted-foreground">No visits yet. Your summaries and documents will appear here.</p>
        <Button asChild variant="glass" size="pill" className="mt-6">
          <a href="/#care">Book new care</a>
        </Button>
      </section>
      <button
        type="button"
        onClick={async () => {
          await authClient.signOut()
          location.assign('/')
        }}
        className="mt-14 py-3 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Sign out
      </button>
    </Shell>
  )
}
