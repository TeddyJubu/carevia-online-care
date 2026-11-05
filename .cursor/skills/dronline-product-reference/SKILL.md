---
name: dronline-product-reference
description: Uses DrOnline (dronline.pt) as the market example of a private Portuguese online-doctor service when planning Carevia services, booking steps, prices, or post-visit documents. Use when the user mentions DrOnline, dronline.pt, the example application, Portuguese teleconsultation pricing, or which visit types a Portugal product offers. Does not authorise copying their clinical promises.
---

# DrOnline product reference

[DrOnline](https://dronline.pt/) is the example private teleconsultation product for Carevia. Use it to compare service shape and booking steps. Do not clone the site, its copy, or its guarantee of a document. Portuguese constraints in [portugal-telemedicine-constraints](../portugal-telemedicine-constraints/SKILL.md) win when they differ.

## Booking shape to compare

Public pages describe this sequence:

1. The patient chooses a named service (a specialty visit, a symptom visit, a certificate, a treatment renewal, or a test request).
2. The patient picks a day and time.
3. The patient pays. Published methods include card and a Multibanco reference.
4. After payment, the patient receives an email link and joins in the browser on a phone, tablet, or computer. No app install is required.
5. After the visit, treatment guidance and test requests are sent electronically, described on the site as email.

Carevia already plans a different document path: official documents are produced in iMED, not as informal email attachments. Video uses Daily. Audio is an outbound mobile call. Those choices replace DrOnline's delivery mechanism even when the service menu looks similar.

## Service menu observed on 4 November 2026

Re-fetch https://dronline.pt/ before using a price. Prices below are public list prices seen that day, in euros, for comparison only.

| Group | Examples and list price |
|---|---|
| General and urgent | Adult urgent 35, paediatric urgent 50, respiratory infection 35, urinary infection 35, general check-up 35, child visit 35, skin 39, hair loss 35, pain 39, allergies 35, hypertension 39, contraception 39, men's health 49, sexology 35 |
| Mental health | Adult or child psychology 49, psychiatry or child psychiatry 80, adult ADHD 80, child ADHD 90, autism 80, couples and family 55, eating disorders 80, screen dependency 49, substance or behavioural dependency 80, smoking cessation 50 |
| Weight | Nutrition 35, weight-loss 59 |
| Specialist | Gynaecology, neurology, endocrinology, rheumatology, paediatrics, migraine 55; menopause 80; breastfeeding 60; travel 39 |
| Certificates | CIT 39, driving fitness 39, driving fitness plus psychotechnical exam 89, in-person psychotechnical exam 59, illness certificate 35, nursery or school 35, occupational 35, hunting or firearms 35, diving 35, boating renewal 35 |
| Treatment renewals | Named condition renewals such as contraceptive pill, migraine, acne, asthma at 19 |
| Tests | Exam and lab request 19, treatment renewal 19 |

Two DrOnline articles disagreed with the homepage on a few prices (urgent visit listed at 39 in one article and 35 on the homepage). Trust the live service page, not a cached article.

## Product rules learned from the example

- Each bookable item has a published price. The patient pays for that visit, not a hidden bundle.
- A family-doctor subscription is offered beside pay-per-visit. Carevia does not have to copy the subscription.
- The urgent-visit page says the doctor redirects the patient to in-person care when examination or an emergency requires it. Carevia must do the same and must not take emergency calls that belong with 112.
- Certificate and prescription products are still consultations. The doctor decides after the visit. Do not add a checkout that sells a guaranteed CIT, prescription, or fitness certificate.
- Some driving assessments are in person. Do not force every certificate in the menu into video or a phone call.

## What not to copy

- Email as the system of record for prescriptions, CIT, or test requests
- Their visual design, text, or page structure
- A price table committed in code without a source and a date
- Any claim that a document is issued automatically at the end of the call
