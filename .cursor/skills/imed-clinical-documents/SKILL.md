---
name: imed-clinical-documents
description: Keeps prescriptions, clinical records, test requests, certificates, and CIT inside iMED (imed.pt) instead of Carevia. Use when planning or implementing clinical documents, the patient chart, PEM, RNU, BDNP, doctor notes, requisitions, declarations, iMED API booking sync, or any feature that would store or generate a medical document.
---

# iMED clinical documents

iMED (https://imed.pt/imed/home), operated by ACIN iCloudSolutions, is Carevia's clinical system. Doctors prescribe, request tests, write the chart, and issue declarations there. Carevia books the visit, takes payment, runs video or the phone call, and stores operational data. Carevia does not become a second medical record or a second prescription engine.

Read [portugal-telemedicine-constraints](../portugal-telemedicine-constraints/SKILL.md) before designing a document feature.

## System boundary

| Carevia stores | iMED stores |
|---|---|
| Account, login, and verified mobile and email | Clinical chart and history |
| Consent text, timestamp, and version | Prescriptions and treatment guides |
| Appointment, price, payment, and refund state | MCDT / lab requisitions |
| Daily room id, join window, and call outcome | Declarations, atestados, and CIT issued through official software |
| Non-clinical link to an iMED appointment or patient id, when the API returns one | Clinician agenda if reception works in iMED |

If a field describes symptoms, medicines, allergies, a diagnosis, a dose, or a document the patient will take to a pharmacy or employer, it belongs in iMED. Carevia may show the patient a link or status that iMED returns. Carevia must not reconstruct the document from its own database.

## What iMED already covers

The public product page lists cloud clinical software with mobile apps, an instant RNU lookup, role-based access, prescriptions, MCDT requisitions, declarations and medical certificates, the clinical chart, appointments, billing, video, and SMS reminders. Their FAQ states PEM certification n.º 6/2011 by ACSS and ISO 9001 and ISO 27001 certification. Treat the 2011 certificate number as a historical public claim. Before go-live, confirm the installation's current SPMS prescription certification in writing with iMED.

Portuguese prescription software must, at issue time:

- identify the patient from the RNU when a national health number applies
- validate and register the prescription in the central prescription system (BDNP) before it is emitted
- authenticate the prescriber with a qualified certificate or Chave Móvel Digital
- write the prescription back into the clinical chart

Those duties stay inside iMED. Do not call SPMS prescription services from Carevia unless iMED and SPMS explicitly give Carevia its own certified software status. That is not the current plan.

## API, as far as public sources go

iMED does not publish a developer reference on the pages reviewed on 4 November 2026. A Portuguese integrator describes an official, clinic-scoped API that can:

- read doctor agendas and appointment types
- create a patient when the phone number is new
- create, confirm, reschedule, and cancel an appointment
- see reception changes in the iMED agenda

That same description says the API does not expose the clinical history. Do not design Carevia features that need chart text, prescriptions, or documents from iMED until iMED confirms an endpoint. Ask iMED (public support address on their sites: apoio@imed.pt) to enable API credentials and to provide the current contract.

Until that contract exists:

- model Carevia appointments as local records with an optional `imedAppointmentId` and `imedPatientId`
- do not invent request or response fields
- do not scrape the iMED web app

## Planning rules

1. A "view my prescription" screen is a link or status from iMED, or it waits until the API provides it. It is not a Carevia PDF.
2. Renewal requests collected by Carevia are intake for a doctor. The doctor decides in iMED. Carevia must not renew a medicine by itself.
3. Sync booking state one way or both ways only for schedule fields: who, when, service type, status. Do not sync symptoms into Carevia logs.
4. Staff roles in Carevia do not grant a clinical role in iMED. A clinician signs in to iMED with iMED's own authentication.
5. Secrets for the iMED API stay on the server. Never ship them to the patient app.

## Open checks before implementation

- [ ] Written confirmation of current PEM certification for this iMED tenant
- [ ] API credential owner, environments, and rate limits
- [ ] Which objects the API can create or read, especially patients and appointments
- [ ] Confirmation that clinical documents and chart text are out of the API
- [ ] Data-processing agreement between Carevia and ACIN
- [ ] Who is the depositary of the clinical record for ERS and Lei n.º 12/2005 purposes

Public sources: [iMED home](https://imed.pt/imed/home), [iMED FAQ on certification](https://imeddgrsp.acin.pt/imed/?mod=conf&op=login_form&opt=faq), [integrator description of the API](https://loominary.pt/integracoes/imed), [SPMS PEM software rules v4.1](https://pem.spms.min-saude.pt/wp-content/uploads/2024/05/Especificacoes_tecnicas-relativas-aos-softwares-de-prescricao-de-medicamentos-e-produtos-de-saude.V.4.10.pdf).
