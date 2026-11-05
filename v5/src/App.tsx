import { cn } from 'cn'
import { faqs } from '../../src/content.mjs'
import { services } from '../../src/services-04-2.mjs'
import { Film } from '@/components/film'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

const CAREVIA = 'https://carevia.triple-labs-8416.chatgpt.site/'

const nav = [
  ['Home', '#top'],
  ['Care', '#care'],
  ['How it works', '#how'],
  ['Questions', '#questions'],
] as const

const steps = [
  {
    title: 'Choose your care',
    body: 'Pick a service and a registered clinician. You see the language, availability and price before you book.',
  },
  {
    title: 'Talk it through',
    body: 'Join by secure video from a quiet, private place. Bring your questions, your history and anything else that matters to you.',
  },
  {
    title: 'Keep the next step close',
    body: 'Your summary is saved to your account, with any prescription, certificate or referral your clinician decides is appropriate.',
  },
]

const section = 'mx-auto max-w-7xl px-6 py-28 md:px-8 md:py-36'
const h2 = 'font-serif text-5xl leading-[0.95] font-normal tracking-[-1.5px] md:text-6xl'

function Logo() {
  return (
    <a href="#top" className="flex items-center gap-2.5 font-serif text-3xl tracking-tight text-foreground">
      <img src="/carevia-mark.png" alt="" width={28} height={28} className="size-7 brightness-0 invert" />
      Carevia
    </a>
  )
}

export default function App() {
  const { data: session } = authClient.useSession()
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-foreground px-5 py-2.5 text-sm text-background focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
      >
        Skip to content
      </a>

      <header id="top" className="relative isolate flex min-h-svh flex-col overflow-hidden">
        <Film name="night" className="object-[62%_50%] md:object-center" />

        <nav aria-label="Main" className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-8 py-6">
          <Logo />
          <ul className="hidden items-center gap-8 text-shadow-film md:flex">
            {nav.map(([label, href], i) => (
              <li key={href}>
                <a
                  href={href}
                  aria-current={i === 0 ? 'page' : undefined}
                  className={cn('text-sm transition-colors hover:text-foreground', i === 0 ? 'text-foreground' : 'text-muted-foreground')}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <a
              href={session ? '/account' : '/signin'}
              className="px-3 py-3 text-sm text-muted-foreground text-shadow-film transition-colors hover:text-foreground"
            >
              {session ? 'Your account' : 'Sign in'}
            </a>
            <Button asChild variant="glass" size="pill">
              <a href="#care">Find your care</a>
            </Button>
          </div>
        </nav>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pt-32 pb-40 text-center text-shadow-film">
          <h1 className="max-w-7xl animate-fade-rise font-serif text-5xl leading-[0.95] font-normal tracking-[-2.46px] sm:text-7xl md:text-8xl">
            The doctor will see you <br className="hidden sm:block" />
            <em className="text-muted-foreground not-italic">at home.</em>
          </h1>
          <p className="mt-8 max-w-2xl animate-fade-rise-delay text-base leading-relaxed text-foreground/80 sm:text-lg">
            Speak with a registered clinician by secure video, wherever you feel comfortable. See the price before you book, and
            find your summary and next steps in your account after the call.
          </p>
          <Button asChild variant="glass" size="hero" className="mt-12 animate-fade-rise-delay-2">
            <a href="#care">Find your care</a>
          </Button>
        </div>
      </header>

      <main id="main">
        <section id="care" aria-labelledby="care-title" className={cn(section, 'grid gap-14 md:grid-cols-12')}>
          <div className="md:sticky md:top-12 md:col-span-5 md:self-start">
            <h2 id="care-title" className={h2}>
              What can we help with?
            </h2>
            <p className="mt-6 max-w-sm leading-relaxed text-muted-foreground">
              Seven areas of care, each with its price shown up front. Choose a service, then the clinician and time that suit you.
            </p>
            <Button asChild variant="glass" size="pill" className="mt-10">
              <a href={CAREVIA} target="_blank" rel="noopener">
                Book on Carevia
              </a>
            </Button>
          </div>
          <div className="md:col-span-7">
            {/* Subgrid: every row shares one price column, sized by its widest entry. */}
            <ul className="grid grid-cols-[1fr_auto] gap-x-6 border-t">
              {services.map((s) => (
                <li key={s.id} className="col-span-2 grid grid-cols-subgrid items-baseline gap-y-2 border-b py-7">
                  <h3 className="font-serif text-3xl leading-tight font-normal tracking-tight md:text-4xl">{s.name}</h3>
                  <p className="text-right text-lg whitespace-nowrap tabular-nums">from €{s.price}</p>
                  <p className="text-sm text-muted-foreground">{s.short}</p>
                  <p className="text-right text-sm whitespace-nowrap text-muted-foreground">{s.duration}</p>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-muted-foreground">Example prices, confirmed per country before launch.</p>
          </div>
        </section>

        <section id="how" aria-labelledby="how-title" className="border-t">
          <div className={section}>
            <h2 id="how-title" className={cn(h2, 'max-w-3xl')}>
              A video visit, start to finish
            </h2>
            <ol className="mt-20 grid gap-14 md:grid-cols-3 md:gap-10">
              {steps.map((step, i) => (
                <li key={step.title} className="border-t pt-8">
                  <span aria-hidden="true" className="block font-serif text-7xl leading-none text-muted-foreground">
                    {i + 1}
                  </span>
                  <h3 className="mt-12 font-serif text-3xl font-normal tracking-tight">{step.title}</h3>
                  <p className="mt-4 max-w-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-label="What you can count on" className="border-t">
          <p className={cn(section, 'font-serif text-5xl leading-[1.02] tracking-[-1.5px] sm:text-6xl md:text-7xl')}>
            No subscription. <span className="text-muted-foreground">The price before you confirm.</span> A free rebook if the
            video drops.
          </p>
        </section>

        <section id="questions" aria-labelledby="questions-title" className="border-t">
          <div className={cn(section, 'grid gap-14 md:grid-cols-12')}>
            <div className="md:col-span-5">
              <h2 id="questions-title" className={h2}>
                Questions, answered
              </h2>
              <p className="mt-6 max-w-sm leading-relaxed text-muted-foreground">
                Something else on your mind?{' '}
                <a href={CAREVIA} target="_blank" rel="noopener" className="text-foreground underline underline-offset-4">
                  Carevia’s help pages
                </a>{' '}
                have more.
              </p>
            </div>
            <Accordion type="single" collapsible defaultValue="q-0" className="border-t md:col-span-7">
              {faqs.slice(0, 6).map(([question, answer], i) => (
                <AccordionItem key={question} value={`q-${i}`} className="last:border-b">
                  <AccordionTrigger className="py-6 text-lg font-normal hover:no-underline [&>svg]:size-5">{question}</AccordionTrigger>
                  <AccordionContent className="max-w-xl pb-6 text-base leading-relaxed text-muted-foreground">{answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        <section aria-labelledby="closing-title" className="relative isolate flex min-h-svh flex-col items-center overflow-hidden px-6 pt-[16svh] text-center">
          <Film name="morning" />
          <h2
            id="closing-title"
            className="relative z-10 font-serif text-5xl leading-[0.95] font-normal tracking-[-2.46px] text-background sm:text-7xl md:text-8xl"
          >
            Wake up knowing <br className="hidden sm:block" />
            <span className="text-background/60">what comes next.</span>
          </h2>
          <Button asChild variant="solid" size="hero" className="relative z-10 mt-10">
            <a href="#care">Find your care</a>
          </Button>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-7xl px-6 md:px-8">
          <div className="flex flex-col gap-5 border-b py-8 md:flex-row md:items-center md:justify-between">
            <p className="max-w-2xl text-sm leading-relaxed">
              <strong className="font-medium">Need urgent help?</strong>{' '}
              <span className="text-muted-foreground">
                Carevia is not an emergency service. In an emergency, call 112 or go to your nearest emergency department.
              </span>
            </p>
            <Button asChild variant="glass" size="pill" className="self-start md:self-auto">
              <a href="tel:112">Call 112</a>
            </Button>
          </div>
          <div className="grid gap-10 py-14 md:grid-cols-12">
            <div className="md:col-span-6">
              <Logo />
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
                Online consultations with registered clinicians. Availability varies by country.
              </p>
            </div>
            <ul className="space-y-3 text-sm md:col-span-3">
              {nav.slice(1).map(([label, href]) => (
                <li key={href}>
                  <a href={href} className="text-muted-foreground transition-colors hover:text-foreground">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
            <ul className="space-y-3 text-sm md:col-span-3">
              <li>
                <a href={CAREVIA} target="_blank" rel="noopener" className="text-muted-foreground transition-colors hover:text-foreground">
                  Visit Carevia
                </a>
              </li>
            </ul>
          </div>
          <p className="border-t py-6 text-xs text-muted-foreground">
            © 2026 Carevia. The films on this page are illustrative. Example prices are confirmed per country before launch.
          </p>
        </div>
      </footer>
    </>
  )
}
