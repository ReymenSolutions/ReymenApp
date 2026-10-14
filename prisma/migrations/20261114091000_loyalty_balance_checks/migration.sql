-- Refuse inconsistent legacy data rather than silently rewriting the history.
ALTER TABLE "LoyaltyMember" ADD CONSTRAINT "LoyaltyMember_nonnegative_balances"
CHECK ("totalVisits" >= 0 AND "cycleVisits" >= 0 AND "deficitVisits" >= 0 AND "visitsWithAmount" >= 0 AND "totalSpent" >= 0 AND "cycleNumber" >= 1);
ALTER TABLE "LoyaltyReward" ADD CONSTRAINT "LoyaltyReward_valid_goal_and_deficit"
CHECK ("visitGoal" >= 1 AND "missingVisits" >= 0 AND "missingVisits" <= "visitGoal");
ALTER TABLE "LoyaltyVisit" ADD CONSTRAINT "LoyaltyVisit_positive_amount"
CHECK ("saleAmount" IS NULL OR "saleAmount" > 0);
