---
name: portugal-telemedicine-constraints
description: Applies Portuguese telemedicine, health-data, prescription, and professional-practice constraints while planning or implementing Carevia for Portugal. Use when designing accounts, booking, consent, clinical records, prescriptions, certificates, referrals, payments, video or phone visits, retention, or launch readiness, or when the user mentions ERS, DGS, Ordem dos Médicos, PEM, RNU, CIT, GDPR health data, or Portuguese healthcare law.
---

# Portugal telemedicine constraints

Carevia is a private online consultation service for patients in Portugal. These rules constrain planning and implementation. They are research notes for engineers, not a legal opinion. Re-read [sources.md](sources.md) before a launch decision. If a proposed feature conflicts with a constraint, stop and name the constraint instead of designing around it.

## How to apply this skill

1. Name the feature (booking, visit, document, account, payment).
2. Check it against the constraints below and the related skill: [imed-clinical-documents](../imed-clinical-documents/SKILL.md), [daily-video-consultations](../daily-video-consultations/SKILL.md), or [cellular-audio-consultations](../cellular-audio-consultations/SKILL.md).
3. Record, in the plan, which constraints the feature satisfies and which still need a lawyer or the regulator.
4. Do not copy [DrOnline](../dronline-product-reference/SKILL.md) or the patient wireframe when they conflict with these constraints.

## Provider and clinicians

- Register the service with the ERS before caring for patients in mainland Portugal. Servers or telecoms outside Portugal do not remove that duty when the patients are in mainland Portugal.
- The ERS description here is for mainland Portugal. Madeira and the Azores have separate oversight. Confirm the launch geography before building region-specific rules.
- Every doctor needs a current cédula from the Ordem dos Médicos and may practise only within their competence. Show the patient the doctor's professional name and cédula.
- The Código Deontológico (arts. 46–49) requires a real clinical assessment. A form, chat, or document request is not a consultation. The doctor issues a prescription, CIT, certificate, test request, or referral only after deciding the information is sufficient. The product must not promise the document before that decision.
- If video or audio quality is too poor for a safe opinion, the doctor ends or converts the visit and the record states why. Do not let the app complete a prescription in that case.
- Keep civil-liability insurance and the current ERS registration file as launch tasks. Do not hard-code insurance details.

## Before the consultation

A teleconsulta may be video, telephone, or another digital channel. Audio visits are allowed. They still follow this section.

Before the visit, tell the patient, in plain language:

- how care will be delivered, and that an in-person visit is the alternative when examination or urgency requires it
- the price and any other charges, before payment
- whether sound or image will be recorded; the default is no recording
- the emergency limit: this is not an emergency service; direct the patient to 112

Store that disclosure and the patient's informed consent on the clinical record. Use a separate, explicit consent for any recording of sound or image, and keep the consent document with the record. A sentence inside general terms is not recording consent.

Confirm, before joining, that the email and mobile number used for the visit match the patient record. Allow an accompanying person. Lei n.º 15/2014 applies the same accompaniment right as an in-person visit.

## During and after the visit

Give the patient privacy: the clinician's and patient's spaces need intelligible audio and, for video, usable light. The product cannot police a patient's room; it can require the clinician side to be private and can tell the patient to move somewhere private.

Write the encounter into the clinical record, held in iMED, not only in Carevia. Minimum content to persist:

- provider, clinician, and patient identities
- start and end time
- channel (video or telephone) and whether it was scheduled or urgent
- specialty, reason, observations, assessment, and decision
- relevant tests, the clinical report, and whether a document was issued or refused

Give the patient access to the clinical information produced in the visit, and an attendance proof when they ask for one.

## Documents and medicines

- Do not build Carevia's own prescription, CIT, test-request, or certificate generator. iMED is the certified clinical system. See the iMED skill.
- Portuguese prescriptions are electronic, normally dematerialised, by DCI, and must be validated online in the SPMS central prescription system (BDNP) before issue. The prescriber authenticates with a qualified digital certificate or Chave Móvel Digital.
- A CIT (baixa) may be issued in the private sector only by an ERS-registered provider, through the official SPMS path (Decreto-Lei n.º 2/2024 and Portaria n.º 11/2024). Electronic delivery to Segurança Social covers CIT records in the SPMS central database for the general regime. A PDF made by Carevia is not a CIT.

## Health data

Under Lei n.º 12/2005, health information belongs to the patient. Carevia and iMED are depositaries. Use it for care and other purposes the law allows, not for marketing or unrelated product analytics.

Clinical records are consulted by the clinician responsible for that patient's care, or by another bound professional under that clinician's supervision and only as far as needed. Administrative staff do not get a clinical view.

Health data is special-category data under the GDPR. Sign data-processing agreements with iMED, Daily, the phone carrier, the payment provider, and any email or SMS sender. Keep identifiers out of room names, URLs, analytics, and application logs. Prefer pseudonymous ids in those systems.

Do not invent a retention period. Look up the current retention rule before choosing deletion.

## Payments

Show the consultation price before the patient pays. A failed or abandoned payment must not create a confirmed appointment. Refunds follow the published cancellation terms. Payment status is not a clinical fact and does not belong in the prescription record.

## Planning checklist

- [ ] ERS registration and clinician cédula are launch gates, not backlog items
- [ ] Consent and price are captured before the visit
- [ ] Recording is off unless separate consent exists
- [ ] Clinical writing and official documents go to iMED
- [ ] Video and phone flows identify the patient and the clinician
- [ ] Emergency cases are routed to 112, not into a booking
- [ ] No feature guarantees a prescription, CIT, or certificate

## Sources

Official references and the date of this research: [sources.md](sources.md).
