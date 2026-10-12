-- El plan "enterprise" pasa a llamarse "business": mismos clientes, mismo plan, solo cambia la llave.
UPDATE "Organization" SET "plan" = 'business' WHERE "plan" = 'enterprise';
