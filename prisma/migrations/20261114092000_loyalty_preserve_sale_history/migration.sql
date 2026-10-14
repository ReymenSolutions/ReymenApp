ALTER TABLE "LoyaltyVisit" DROP CONSTRAINT "LoyaltyVisit_saleId_fkey";
ALTER TABLE "LoyaltyVisit" ADD CONSTRAINT "LoyaltyVisit_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "FoodSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
