CREATE TABLE "DoctorApplication" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cedula" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "groupSlug" TEXT NOT NULL DEFAULT '',
    "yearsInPractice" INTEGER NOT NULL,
    "languages" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorApplication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DoctorApplication_status_createdAt_idx" ON "DoctorApplication"("status", "createdAt");
