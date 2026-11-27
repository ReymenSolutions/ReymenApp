ALTER TABLE "WorkshopLeadRequest"
  ADD COLUMN "discardedAt" TIMESTAMP(3),
  ADD COLUMN "discardedById" TEXT;

ALTER TABLE "WorkshopQuote" ADD COLUMN "requestId" TEXT;

CREATE UNIQUE INDEX "WorkshopQuote_requestId_key" ON "WorkshopQuote"("requestId");

ALTER TABLE "WorkshopQuote"
  ADD CONSTRAINT "WorkshopQuote_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "WorkshopLeadRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
