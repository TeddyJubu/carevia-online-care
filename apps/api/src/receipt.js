import PDFDocument from 'pdfkit'
import { lisbonDateTime } from './rules.js'

const euro = (n) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(n)

/** "CV-20261106-AB12CD": the payment date and the end of the payment id. Stable, so a re-download gets the same number. */
export const receiptNumber = (payment) =>
  `CV-${payment.createdAt.toISOString().slice(0, 10).replace(/-/g, '')}-${payment.id.slice(-6).toUpperCase()}`

/**
 * Carevia's payment receipt as a PDF (Buffer). Operational data only: receipt number, dates, service, price,
 * payment method, clinician and cédula, patient name. Never the reason for the visit or anything clinical.
 * `appointment` is a row loaded with APPOINTMENT_INCLUDE and a payment.
 */
export function receiptPdf(appointment, { demo }) {
  const { payment, doctor, service } = appointment
  const person = appointment.familyMember || appointment.patient
  const cancelled = appointment.status === 'cancelled'
  const rows = [
    ['Receipt number', receiptNumber(payment)],
    ['Date paid', `${lisbonDateTime(payment.createdAt)} (Lisbon time)`],
    ['Service', `Video consultation · ${service.group.name}`],
    ['Visit date', `${lisbonDateTime(appointment.startsAt)} (Lisbon time)`],
    ['Clinician', doctor.name],
    ['Cédula profissional', doctor.cedula],
    ['Patient', `${person.firstName} ${person.lastName}`],
    ...(appointment.familyMember ? [['Booked by', `${appointment.patient.firstName} ${appointment.patient.lastName}`]] : []),
    ['Payment method', payment.method === 'demo' ? 'Demo payment (no card)' : payment.method],
    ['Status', cancelled && payment.method === 'demo' ? 'No charge (visit cancelled)' : payment.status === 'refunded' ? 'Refunded' : 'Paid'],
    ['Amount', euro(payment.amount)],
    ['Reference', appointment.id],
  ]

  // No names in the document metadata: it shows up in file browsers and search indexes.
  const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: 'Carevia payment receipt', Author: 'Carevia' } })
  const chunks = []
  doc.on('data', (c) => chunks.push(c))
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))

  const navy = '#0b1f3a', muted = '#5b6b80', left = 56, width = doc.page.width - 112
  doc.font('Helvetica-Bold').fontSize(22).fillColor(navy).text('Carevia', left, 56)
  doc.font('Helvetica').fontSize(9).fillColor(muted).text('Provided by [legal entity name]')
  if (demo) {
    doc.roundedRect(doc.page.width - 56 - 120, 58, 120, 24, 12).fill('#fdf1d8')
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#7a4b00').text('Demo receipt', doc.page.width - 56 - 120, 65, { width: 120, align: 'center' })
  }
  doc.font('Helvetica-Bold').fontSize(18).fillColor(navy).text('Payment receipt', left, 120)
  doc.font('Helvetica').fontSize(10).fillColor(muted).moveDown(0.4)
    .text(demo
      ? 'Demo receipt: no money was taken. This is a payment confirmation, not a tax invoice (fatura).'
      : 'Payment confirmation, not a tax invoice (fatura). In Portugal, invoices are issued by AT-certified invoicing software.', { width })

  let y = doc.y + 18
  for (const [k, v] of rows) {
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.5).strokeColor('#d8e0ea').stroke()
    doc.font('Helvetica').fontSize(10.5).fillColor(muted).text(k, left, y + 9, { width: 170 })
    doc.font('Helvetica-Bold').fillColor(navy).text(v, left + 180, y + 9, { width: width - 180, align: 'right' })
    y = Math.max(doc.y, y + 9 + 13) + 9
  }
  doc.moveTo(left, y).lineTo(left + width, y).stroke()
  doc.font('Helvetica').fontSize(9).fillColor(muted).text(
    'This receipt covers the payment only. Clinical records, and anything your doctor decides to issue, are kept in iMED, not in Carevia.',
    left, y + 18, { width })
  doc.end()
  return done
}
