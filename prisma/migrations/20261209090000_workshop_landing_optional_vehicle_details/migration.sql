-- El visitante puede solicitar una cotización sin conocer placas ni kilometraje.
-- Ambos siguen siendo obligatorios al convertir la solicitud en una ficha completa del vehículo.
ALTER TABLE "WorkshopLeadRequest" ALTER COLUMN "placas" DROP NOT NULL;
ALTER TABLE "WorkshopLeadRequest" ALTER COLUMN "kilometraje" DROP NOT NULL;
