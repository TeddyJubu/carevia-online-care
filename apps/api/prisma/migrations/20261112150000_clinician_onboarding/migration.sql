-- Setup progress for a clinician who accepted an invite. Absent for seeded demo doctors.
CREATE TABLE "ClinicianOnboarding" (
    "userId" TEXT NOT NULL,
    "profileCheckedAt" TIMESTAMP(3),
    "profileFlaggedAt" TIMESTAMP(3),
    "profileFlag" TEXT NOT NULL DEFAULT '',
    "agreementVersion" TEXT,
    "agreementAcceptedAt" TIMESTAMP(3),
    "twoFactorSkippedAt" TIMESTAMP(3),
    "hoursOpenedAt" TIMESTAMP(3),
    "deviceCheckedAt" TIMESTAMP(3),
    "wentLiveAt" TIMESTAMP(3),

    CONSTRAINT "ClinicianOnboarding_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "ClinicianOnboarding" ADD CONSTRAINT "ClinicianOnboarding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
