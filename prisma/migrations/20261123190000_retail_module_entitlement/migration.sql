-- Register the Retail commercial entitlement. No organization receives it by default.
ALTER TYPE "PlatformModule" ADD VALUE IF NOT EXISTS 'RETAIL';
