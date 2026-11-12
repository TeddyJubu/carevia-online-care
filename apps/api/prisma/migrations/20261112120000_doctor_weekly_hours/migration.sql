-- Per-doctor weekly template: weekday ("0" Sunday … "6" Saturday) to Lisbon "HH:MM" starts.
-- New doctors stay at {}. Doctors already in the table were given the Monday-to-Friday pattern, so they keep it.
ALTER TABLE "Doctor" ADD COLUMN "weeklyHours" JSONB NOT NULL DEFAULT '{}';

UPDATE "Doctor"
SET "weeklyHours" = '{"1":["09:00","10:30","12:00","14:30","16:00","17:30","19:00"],"2":["09:00","10:30","12:00","14:30","16:00","17:30","19:00"],"3":["09:00","10:30","12:00","14:30","16:00","17:30","19:00"],"4":["09:00","10:30","12:00","14:30","16:00","17:30","19:00"],"5":["09:00","10:30","12:00","14:30","16:00","17:30","19:00"]}';
