ALTER TABLE "ServiceGroup" ADD COLUMN "fieldMarks" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "confusedWith" TEXT NOT NULL DEFAULT '';

UPDATE "ServiceGroup" SET "fieldMarks" = 'Something new in the last few days
Fever, cough, infection, rash or minor injury
Any age, from babies to adults', "confusedWith" = 'Specialist care: choose that for a known, ongoing condition.' WHERE "slug" = 'general';
UPDATE "ServiceGroup" SET "fieldMarks" = 'Low mood, anxiety, stress or poor sleep
You’d like the same clinician each time
Talking therapy or medication advice', "confusedWith" = 'Treatments: choose that if you only need a medication review.' WHERE "slug" = 'mental';
UPDATE "ServiceGroup" SET "fieldMarks" = 'A planned change, not a sudden one
Regular check-ins over weeks
Nutrition plans you can follow at home', "confusedWith" = 'General & urgent care: for weight change you can’t explain.' WHERE "slug" = 'nutrition';
UPDATE "ServiceGroup" SET "fieldMarks" = 'A known condition that needs an expert
Gynaecology, neurology, endocrinology and more
No referral needed', "confusedWith" = 'General & urgent care: for symptoms that are new.' WHERE "slug" = 'specialist';
UPDATE "ServiceGroup" SET "fieldMarks" = 'You need a document, not a diagnosis
Sick leave, school or nursery fitness
Usually 10 to 15 minutes', "confusedWith" = 'Test requests & renewals: for lab orders and results.' WHERE "slug" = 'certificates';
UPDATE "ServiceGroup" SET "fieldMarks" = 'Skin, hair loss or ongoing pain
Reviewing a treatment you’ve started
Prescription is often the outcome', "confusedWith" = 'Specialist care: when you still need a diagnosis.' WHERE "slug" = 'treatments';
UPDATE "ServiceGroup" SET "fieldMarks" = 'You already know what you need
Lab tests or a repeat prescription
Results arrive in your account', "confusedWith" = 'Certificates & assessments: for written statements.' WHERE "slug" = 'renewals';

-- Icons from the field-guide design.
UPDATE "ServiceGroup" SET "icon" = 'scale' WHERE "slug" = 'nutrition' AND "icon" = 'heart';
UPDATE "ServiceGroup" SET "icon" = 'microscope' WHERE "slug" = 'specialist' AND "icon" = 'activity';
UPDATE "ServiceGroup" SET "icon" = 'pill' WHERE "slug" = 'treatments' AND "icon" = 'heart-pulse';
UPDATE "ServiceGroup" SET "icon" = 'test-tube-diagonal' WHERE "slug" = 'renewals' AND "icon" = 'clipboard-list';
