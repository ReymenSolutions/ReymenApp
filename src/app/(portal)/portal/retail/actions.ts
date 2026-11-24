"use server";

import { revalidatePath } from "next/cache";
import { RetailLocationFormat, RetailLocationType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { UserError } from "@/lib/user-error";
import { configureRetailLocation, createRetailLocation, registerRetailItem } from "@/lib/retail/inventory";

type FormResult = { error?: string; success?: boolean };

function value(data: FormData, key: string): string {
  const raw = data.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

async function actor() {
  const session = await auth();
  if (!session?.user.id || !session.user.organizationId) throw new UserError("Sesión inválida.");
  return { organizationId: session.user.organizationId, userId: session.user.id };
}

export async function createRetailLocationAction(_: FormResult, data: FormData): Promise<FormResult> {
  try {
    const { organizationId, userId } = await actor();
    const type = value(data, "type");
    const format = value(data, "format");
    if (!(type in RetailLocationType) || !(format in RetailLocationFormat)) throw new UserError("El tipo y formato de la ubicación no coinciden.");
    await createRetailLocation(organizationId, userId, {
      name: value(data, "name"), type: type as RetailLocationType, format: format as RetailLocationFormat, isActive: data.get("isActive") === "on",
      areaM2: value(data, "areaM2") || null, address: value(data, "address") || null, whatsappPhone: value(data, "whatsappPhone") || null,
    });
    revalidatePath("/portal/retail");
    return { success: true };
  } catch (error) {
    if (error instanceof UserError) return { error: error.message };
    throw error;
  }
}

export async function attachRetailLocationAction(_: FormResult, data: FormData): Promise<FormResult> {
  try {
    const { organizationId, userId } = await actor();
    const type = value(data, "type");
    const format = value(data, "format");
    if (!(type in RetailLocationType) || !(format in RetailLocationFormat)) throw new UserError("El tipo y formato de la ubicación no coinciden.");
    await configureRetailLocation(organizationId, userId, {
      branchId: value(data, "branchId"), type: type as RetailLocationType, format: format as RetailLocationFormat,
    });
    revalidatePath("/portal/retail");
    return { success: true };
  } catch (error) {
    if (error instanceof UserError) return { error: error.message };
    throw error;
  }
}

export async function registerRetailItemAction(_: FormResult, data: FormData): Promise<FormResult> {
  try {
    const { organizationId, userId } = await actor();
    await registerRetailItem(organizationId, userId, {
      code: value(data, "code"), locationId: value(data, "locationId"), salePrice: value(data, "salePrice"),
      cost: value(data, "cost") || null, brand: value(data, "brand") || null, category: value(data, "category") || null,
      garmentType: value(data, "garmentType") || null, size: value(data, "size") || null,
      color: value(data, "color") || null, style: value(data, "style") || null,
    });
    revalidatePath("/portal/retail");
    return { success: true };
  } catch (error) {
    if (error instanceof UserError) return { error: error.message };
    throw error;
  }
}
