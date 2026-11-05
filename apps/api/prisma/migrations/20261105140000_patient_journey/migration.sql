-- Appointments, slots and the catalog are demo data; the seed recreates them.
DELETE FROM "Appointment";
DELETE FROM "Slot";
DELETE FROM "Doctor";
DELETE FROM "Service";
DELETE FROM "ServiceGroup";

-- Rebuild the status enum with every state (adding values and using them in one transaction is not allowed).
ALTER TABLE "Appointment" DROP COLUMN "status";
DROP TYPE "AppointmentStatus";
CREATE TYPE "AppointmentStatus" AS ENUM ('held', 'confirmed', 'completed', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "Outcome" AS ENUM ('completed', 'ended_poor_quality', 'needs_in_person', 'no_show');

-- CreateEnum
CREATE TYPE "BookingFor" AS ENUM ('self', 'child', 'adult');

-- CreateEnum
CREATE TYPE "Relationship" AS ENUM ('child', 'adult');

-- CreateEnum
CREATE TYPE "CallState" AS ENUM ('not_started', 'in_progress', 'ended');

-- CreateEnum
CREATE TYPE "CallEventType" AS ENUM ('joined', 'left', 'reconnect', 'error');

-- DropIndex
DROP INDEX "Appointment_doctorId_idx";

-- DropIndex
DROP INDEX "Appointment_doctorId_slot_key";

-- DropIndex
DROP INDEX "Appointment_patientId_idx";

-- DropIndex
DROP INDEX "Slot_doctorId_label_key";

-- DropIndex
DROP INDEX "Slot_doctorId_startsAt_idx";

-- AlterTable
ALTER TABLE "Appointment" DROP COLUMN "service",
DROP COLUMN "slot",
ADD COLUMN     "callState" "CallState" NOT NULL DEFAULT 'not_started',
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "companion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "endsAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "familyMemberId" TEXT,
ADD COLUMN     "forWhom" "BookingFor" NOT NULL,
ADD COLUMN     "holdExpiresAt" TIMESTAMP(3),
ADD COLUMN     "holdTokenHash" TEXT,
ADD COLUMN     "inMainlandPortugal" BOOLEAN NOT NULL,
ADD COLUMN     "outcome" "Outcome",
ADD COLUMN     "patientSetAt" TIMESTAMP(3),
ADD COLUMN     "preJoinConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "reconnects" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "serviceId" INTEGER NOT NULL,
ADD COLUMN     "slotId" INTEGER NOT NULL,
ADD COLUMN     "startsAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "patientId" DROP NOT NULL,
ADD COLUMN     "status" "AppointmentStatus" NOT NULL DEFAULT 'held';

-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN     "clinicianUserId" TEXT;

-- AlterTable
ALTER TABLE "ServiceGroup" ADD COLUMN     "slug" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Slot" DROP COLUMN "day",
DROP COLUMN "label",
DROP COLUMN "time",
ADD COLUMN     "endsAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TEXT NOT NULL,
    "relationship" "Relationship" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallEvent" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "type" "CallEventType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentRecord_appointmentId_idx" ON "ConsentRecord"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_appointmentId_key" ON "Payment"("appointmentId");

-- CreateIndex
CREATE INDEX "FamilyMember_userId_idx" ON "FamilyMember"("userId");

-- CreateIndex
CREATE INDEX "CallEvent_appointmentId_idx" ON "CallEvent"("appointmentId");

-- CreateIndex
CREATE INDEX "AccessLog_appointmentId_idx" ON "AccessLog"("appointmentId");

-- CreateIndex
CREATE INDEX "AccessLog_createdAt_idx" ON "AccessLog"("createdAt");

-- CreateIndex
CREATE INDEX "Appointment_patientId_startsAt_idx" ON "Appointment"("patientId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_doctorId_startsAt_idx" ON "Appointment"("doctorId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_holdTokenHash_idx" ON "Appointment"("holdTokenHash");

-- CreateIndex
CREATE INDEX "Appointment_slotId_idx" ON "Appointment"("slotId");

-- CreateIndex
CREATE UNIQUE INDEX "Doctor_clinicianUserId_key" ON "Doctor"("clinicianUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceGroup_slug_key" ON "ServiceGroup"("slug");

-- CreateIndex
CREATE INDEX "Slot_startsAt_idx" ON "Slot"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Slot_doctorId_startsAt_key" ON "Slot"("doctorId", "startsAt");

-- AddForeignKey
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_clinicianUserId_fkey" FOREIGN KEY ("clinicianUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "FamilyMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallEvent" ADD CONSTRAINT "CallEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- No double booking: at most one held or confirmed appointment per slot. Prisma cannot express a partial unique index.
-- An expired hold still has status 'held' until it is swept, so the booking code marks expired holds 'expired' first.
CREATE UNIQUE INDEX "Appointment_active_slot_key" ON "Appointment"("slotId") WHERE "status" IN ('held', 'confirmed');
