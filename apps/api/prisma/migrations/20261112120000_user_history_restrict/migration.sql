-- A user with appointments (and so payments) or consent can no longer be deleted by a cascade. GDPR deletion anonymises the User row instead.
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_patientId_fkey";
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsentRecord" DROP CONSTRAINT "ConsentRecord_userId_fkey";
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
