export type VehicleRecommendation = {
  kind: "general_review" | "next_service_date" | "next_service_km";
  due: boolean;
  date?: Date;
  km?: number;
};

/** Sugerencias internas basadas únicamente en entregas y próximos servicios registrados. */
export function vehicleRecommendations(input: {
  lastDeliveredAt: Date | null;
  nextServiceDate: Date | null;
  nextServiceKm: number | null;
  currentKm: number | null;
  now: Date;
}): VehicleRecommendation[] {
  const rows: VehicleRecommendation[] = [];
  if (input.lastDeliveredAt) {
    const delivered = input.lastDeliveredAt;
    const firstOfTarget = new Date(Date.UTC(delivered.getUTCFullYear(), delivered.getUTCMonth() + 6, 1, delivered.getUTCHours(), delivered.getUTCMinutes(), delivered.getUTCSeconds(), delivered.getUTCMilliseconds()));
    const lastDay = new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0)).getUTCDate();
    const dueDate = new Date(firstOfTarget);
    dueDate.setUTCDate(Math.min(delivered.getUTCDate(), lastDay));
    rows.push({ kind: "general_review", due: dueDate <= input.now, date: dueDate });
  }
  if (input.nextServiceDate) rows.push({ kind: "next_service_date", due: input.nextServiceDate <= input.now, date: input.nextServiceDate });
  if (input.nextServiceKm !== null) rows.push({ kind: "next_service_km", due: input.currentKm !== null && input.currentKm >= input.nextServiceKm, km: input.nextServiceKm });
  return rows;
}
