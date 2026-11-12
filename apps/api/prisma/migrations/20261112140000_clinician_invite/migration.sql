-- The invite creates the link from an application to its doctor profile. Approve does not.
ALTER TABLE "DoctorApplication" ADD COLUMN "doctorId" INTEGER;

CREATE UNIQUE INDEX "DoctorApplication_doctorId_key" ON "DoctorApplication"("doctorId");

ALTER TABLE "DoctorApplication" ADD CONSTRAINT "DoctorApplication_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The raw token is never stored. tokenHash is SHA-256 of the single-use link.
CREATE TABLE "ClinicianInvite" (
    "id" TEXT NOT NULL,
    "doctorId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ClinicianInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClinicianInvite_doctorId_key" ON "ClinicianInvite"("doctorId");

ALTER TABLE "ClinicianInvite" ADD CONSTRAINT "ClinicianInvite_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
