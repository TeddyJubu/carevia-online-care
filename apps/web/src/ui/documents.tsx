import { useId, useState } from 'react'
import { Link } from 'react-router'
import { MOCK } from '../lib/api'
import type { Appointment } from '../lib/types'

/**
 * The "Documents" area on a visit's detail page: Carevia's payment receipt (a real PDF from the API), and how
 * prescriptions reach the patient. Carevia never generates, stores or shows clinical documents: those are issued
 * in iMED and, for prescriptions, delivered by Portugal's national e-prescription system (see AGENTS.md).
 */
export function Documents({ a }: { a: Appointment }) {
  const visited = a.status === 'completed' && a.outcome !== 'no_show'
  return (
    <section className="card" aria-labelledby="docs-title">
      <h2 id="docs-title" className="text-[22px]">Documents</h2>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {a.payment && (MOCK
          // The mock API can't make a PDF: the printable receipt page stands in.
          ? <Link to={`/visits/${a.id}/receipt`} className="btn btn-secondary btn-sm">Download receipt</Link>
          : <a href={`/api/appointments/${a.id}/receipt.pdf`} download className="btn btn-secondary btn-sm">Download receipt<span className="sr-only"> (PDF)</span></a>)}
        {visited && <PrescriptionInfo a={a} />}
      </div>
      {a.status === 'confirmed' && <p className="fine mt-3">Anything else about this visit appears here after it.</p>}
      {a.status === 'cancelled' && <p className="fine mt-3">This visit didn’t take place, so there’s nothing else here.</p>}
    </section>
  )
}

/**
 * Swap point: how a prescription reaches the patient. Shown only after a completed visit.
 * No outcome flag says whether the doctor issued anything in iMED, so the copy never says a prescription exists.
 */
export function PrescriptionInfo({ a }: { a: Appointment }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        Prescription
      </button>
      <div id={id} className="doc-panel basis-full" data-open={open || undefined} role="region" aria-label="About prescriptions">
        <div className="rounded-[12px] bg-mist p-4 text-[15px]">
          <p>Carevia doesn’t issue or keep prescriptions.</p>
          <p className="mt-2">
            If {a.doctor.name} prescribed anything, it was issued through Portugal’s national e-prescription system
            (Receita Sem Papel) and sent to {a.patient?.kind === 'family' ? 'the mobile number or email on record' : 'your mobile number or email'} by SMS or email,
            with the codes a pharmacy needs to dispense it.
          </p>
          <p className="fine mt-2">Can’t find the message? Check your SMS, and your email’s spam folder. If you’re still unsure, book a follow-up and ask your doctor.</p>
        </div>
      </div>
    </>
  )
}
