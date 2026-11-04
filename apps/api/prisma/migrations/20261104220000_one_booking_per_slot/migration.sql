DELETE FROM "Appointment" AS extra
WHERE extra.id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY "doctorId", slot ORDER BY "createdAt", id) AS rn
    FROM "Appointment"
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX "Appointment_doctorId_slot_key" ON "Appointment"("doctorId", "slot");
