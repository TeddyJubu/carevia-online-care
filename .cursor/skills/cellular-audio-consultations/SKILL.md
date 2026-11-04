---
name: cellular-audio-consultations
description: Plans and implements Carevia audio consultations as outbound cellular calls to the patient's confirmed mobile. Use when designing phone visits, PSTN or SIP dial-out, call state, caller ID, or when the user mentions audio consultation, cellular calls, telephone teleconsulta, or Daily dial-out. Video visits stay on the Daily video skill.
---

# Cellular audio consultations

An audio consultation is a scheduled clinical phone call. Carevia calls the patient's confirmed mobile. The patient does not call an unknown number and does not sit in a clinical IVR. The ERS treats a telephone contact as a teleconsulta, so consent, price disclosure, privacy, clinician identification, and the clinical record still apply. See [portugal-telemedicine-constraints](../portugal-telemedicine-constraints/SKILL.md).

The doctor must judge that voice alone is enough. If it is not, the visit stops and the patient is directed to video or in-person care. The app must not keep going toward a prescription.

## Call path

Preferred path, after Daily confirms it in writing for this account:

1. Create the same kind of private Daily room used for video, with dial-out enabled, only for this appointment.
2. The clinician joins with an owner token.
3. The server dials the patient's number in E.164 (`+351…`) with `startDialOut()` or `POST /rooms/:name/dialOut/start`.
4. Persist `dialout-connected`, `dialout-answered`, `dialout-stopped`, and `dialout-error` against the appointment.
5. Hang up and expire the room when the clinician ends the visit.

Daily's public dial-out guide, reviewed 4 November 2026, allows US and Canada (`+1`) by default and tells customers to contact help@daily.co for international dial-out. Number purchase via their REST API is documented for US and Canada. Do not design Portuguese production traffic on Daily PSTN until Daily enables `+351` and a caller ID the patient will recognise.

If Daily cannot place Portuguese calls, bridge a Portuguese voice carrier into the Daily room with SIP dial-out (`sipUri` starting with `sip:`). Carevia still owns the appointment and the consent record. Do not add a second clinical store in the carrier.

## Identity and consent

- Dial only a mobile number that was confirmed against the patient record before the slot. If the number changed, re-confirm before calling.
- Tell the patient, before the slot, the number or caller name that will appear and the approximate time of the call.
- The caller ID must be a number Carevia controls. Do not present a clinician's personal mobile as the platform number.
- No recording unless the patient gave separate written consent for recording sound. Default the call to unrecorded. A carrier "quality" recording is still a recording and needs that consent.
- Say the price before the booking. A phone visit is not free because it is "only a call" unless the published price says so.
- Allow an accompanying person on the patient's side. Do not design the call as a locked one-to-one if the patient is exercising the accompaniment right.

## State to store

On the appointment, store channel `telephone`, the dialled number's id (not a copy in logs), start and answer timestamps, end reason (`completed`, `no-answer`, `busy`, `failed`, `clinician-ended`), and attempt count.

Clinical notes, diagnosis, and any document decision go to iMED after the call. See [imed-clinical-documents](../imed-clinical-documents/SKILL.md).

If nobody answers, keep the appointment and follow the published no-show or retry rule. Do not mark it completed and do not issue documents.

## Do not

- Autodial patients for marketing, or call a number taken from a referral without confirmation
- Give medical advice from an automated voice menu
- Put the national health number or symptoms in SIP headers, caller name, or carrier metadata
- Fall back to emailing a prescription because the call failed
- Assume international Daily dial-out is already enabled

## References

- ERS, telephone is a teleconsulta channel: [patient FAQ](https://www.ers.pt/pt/utentes/perguntas-frequentes/faq/direitos-dos-utentes-na-prestacao-de-teleconsultas/)
- Daily dial-out prerequisites and the international-call limit: [SIP and PSTN dial-in/dial-out](https://docs.daily.co/docs/guides/features/dial-in-dial-out)
- Daily client events: [Dial-in and dial-out](https://docs.daily.co/docs/daily-js/features/dialin-dialout)
- REST body (`phoneNumber`, `callerId`, `sipUri`): [Room dial-out start](https://docs.daily.co/reference/rest-api/rooms/dial-out/start)
