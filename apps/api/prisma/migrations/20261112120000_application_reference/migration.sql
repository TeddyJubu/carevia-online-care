-- Public application reference (CV-APP-0001). Existing rows, if any, get the next values.
ALTER TABLE "DoctorApplication" ADD COLUMN "ref" SERIAL NOT NULL;

CREATE UNIQUE INDEX "DoctorApplication_ref_key" ON "DoctorApplication"("ref");
