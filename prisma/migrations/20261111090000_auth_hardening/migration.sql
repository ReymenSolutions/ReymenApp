-- Inscripción MFA sin reemplazar el factor activo + versión de sesión (invalida JWT al cambiar contraseña).
ALTER TABLE "User" ADD COLUMN "totpPendingSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
