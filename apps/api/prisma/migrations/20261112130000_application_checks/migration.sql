-- Launch-gate ticks on a doctor application. Who checked it, and when. No policy files.
CREATE TABLE "ApplicationCheck" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "checkedByUserId" TEXT NOT NULL,
    "checkedByName" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationCheck_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApplicationCheck_applicationId_key_key" ON "ApplicationCheck"("applicationId", "key");

ALTER TABLE "ApplicationCheck" ADD CONSTRAINT "ApplicationCheck_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "DoctorApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
