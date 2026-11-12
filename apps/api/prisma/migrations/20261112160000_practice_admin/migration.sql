-- Pause, close-down, and a doctor's request to pause or leave. The request itself cancels nothing.
ALTER TABLE "Doctor" ADD COLUMN "pausedAt" TIMESTAMP(3),
ADD COLUMN "pausedUntil" TIMESTAMP(3),
ADD COLUMN "closedDownAt" TIMESTAMP(3);

ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);

CREATE TABLE "PracticeRequest" (
    "id" TEXT NOT NULL,
    "doctorId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "fromDate" TEXT NOT NULL DEFAULT '',
    "untilDate" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PracticeRequest_doctorId_createdAt_idx" ON "PracticeRequest"("doctorId", "createdAt");

ALTER TABLE "PracticeRequest" ADD CONSTRAINT "PracticeRequest_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
