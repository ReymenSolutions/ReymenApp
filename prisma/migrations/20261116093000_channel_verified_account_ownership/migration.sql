-- A connector-confirmed provider account cannot be assigned to two tenants.
-- Unverified registrations do not reserve an account (prevents account-ID squatting).
CREATE UNIQUE INDEX "ChannelConnection_verified_account_key"
ON "ChannelConnection" ("channel", "externalAccountKey")
WHERE "providerVerified" = true;
