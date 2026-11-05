---
name: daily-video-consultations
description: Implements Carevia video consultations with the Daily video SDK and REST API. Use when planning or building video visits, waiting rooms, meeting tokens, recordings, device checks, or Daily rooms, including docs.daily.co and daily.co. Pairs with Portuguese consent rules and the cellular-audio skill for phone participants.
---

# Daily video consultations

Carevia video visits use [Daily](https://www.daily.co/products/video-sdk/). The server creates one private room per appointment. The browser joins with a short-lived meeting token. Patients do not install an app.

Clinical rules live in [portugal-telemedicine-constraints](../portugal-telemedicine-constraints/SKILL.md). Phone participants, if the same room is used for an outbound mobile call, live in [cellular-audio-consultations](../cellular-audio-consultations/SKILL.md).

## Room lifecycle

Create and delete rooms on the server with the Daily REST API. Never put the API key in client code, and never ship a permanent room URL in the app.

For each appointment:

1. Create a room only after the appointment is paid and confirmed.
2. Set `privacy` so a URL alone is not enough to join. Issue meeting tokens on the server.
3. Let Daily assign a random room name. Do not put the patient name, phone, email, national health number, or appointment reason in the room name, `userName`, or a non-UUID `userId`.
4. Set `nbf` a few minutes before the slot and `exp` after a reasonable overrun. Set `eject_at_room_exp` if the visit must end when the window ends.
5. Clinician token: owner. Patient token: participant, not owner. A companion, when allowed, gets a separate participant token.
6. Delete or expire the room when the visit is finished or the appointment is cancelled. Deleting a room ends the meeting.

Daily's healthcare documentation describes a HIPAA add-on: random room names, stripping names from logs, no Daily-hosted recordings, no live streaming. HIPAA is a United States regime. For Portugal, sign Daily's GDPR data-processing agreement and check subprocessors and region. Mirror the technical restrictions anyway: random names, no identifiers in logs, recording off Daily's cloud unless counsel approves a customer-controlled bucket, no livestream.

## Client behaviour

- Use the Daily call object or Prebuilt UI inside Carevia. Joining by opening a raw `*.daily.co` link is a test shortcut, not the patient flow.
- Run a device check (camera, microphone, speaker) before the waiting step. Daily does not replace that screen.
- Show the clinician's professional name and cédula on the Carevia side. That display is Carevia's, not a PHI field sent to Daily as `userName`.
- Default media recording to off. Start recording only when a separate written consent exists on the appointment and the clinician explicitly starts it. Stop it when the visit ends.
- If recording is enabled later, prefer a customer-managed bucket (Daily documents S3 or OCI for this) and store the file pointer in the clinical record path, not in analytics.
- A dropped call keeps the appointment. Offer reconnect inside the join window, then reschedule. Do not create a second appointment on the first disconnect.

## Events to persist

Store operational facts on the Carevia appointment, not clinical notes:

- room name (the random id) and token expiry
- participant joined and left times
- recording started or not, and the consent id if it did
- error and reconnect count

The clinical summary is written in iMED after the visit. See [imed-clinical-documents](../imed-clinical-documents/SKILL.md).

## Do not

- Hard-code room URLs or create public rooms for real patients
- Put health data in Daily room properties, meeting-token `user_name`, or webhook logs
- Enable live streaming
- Record by default, or record from the patient client without the clinician and the consent record
- Assume Daily dial-out can call Portuguese mobiles. That limitation is in the cellular-audio skill

## References

- [Video architecture](https://docs.daily.co/docs/guides/architecture-and-monitoring/intro-to-video-arch)
- [Rooms](https://docs.daily.co/reference/rest-api/rooms)
- [Healthcare / HIPAA controls to mirror technically](https://docs.daily.co/docs/guides/privacy-and-security/hipaa)
- [Recording](https://docs.daily.co/docs/guides/features/recording)
