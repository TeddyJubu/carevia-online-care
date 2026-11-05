-- AlterTable: reminder choices per appointment (email on, SMS off) and the time the one reminder went out.
ALTER TABLE "Appointment" ADD COLUMN "remindEmail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "remindSms" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reminderSentAt" TIMESTAMP(3);

-- AlterTable: outbox rows can be SMS (written in demo and development only; no SMS provider exists yet).
ALTER TABLE "OutboxMessage" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'email';
