"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, useFieldArray, useFormContext, useWatch, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { IngredientCombobox } from "@/components/portal/IngredientCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { createFoodDish, updateFoodDish } from "@/actions/food";
import { usePreferences } from "@/context/preferences";
import { cn } from "@/lib/utils";
import { getErrorMessage, translateMessage } from "@/lib/user-error";

export interface FoodInventoryOption {
  id: string;
  name: string;
  unit: string;
  unitCost: number | null;
}

export interface FoodCategoryOption {
  id: string;
  name: string;
}

export interface FoodModifierGroupOption {
  id: string;
  name: string;
}

// Mismo valor que DEFAULT_VARIANT_LABEL en src/lib/food.ts -- se repite
// aquí a propósito (ese archivo trae Prisma y no puede importarse desde un
// componente cliente), mismo criterio que recommendPrice() en
// FoodPriceCalculator.tsx.
const DEFAULT_VARIANT_LABEL = "Único";

const ingredientSchema = z.object({
  inventoryItemId: z.string().min(1, "Selecciona un insumo"),
  quantity: z.coerce.number().positive("Cantidad debe ser mayor a 0"),
});

const variantSchema = z.object({
  // Id de la variante existente: el servidor la actualiza en su lugar.
  variantId: z.string().optional(),
  label: z.string().min(1, "Nombre de variante requerido"),
  price: z.coerce.number().positive("El precio debe ser mayor a 0"),
  ingredients: z.array(ingredientSchema).min(1, "Agrega al menos un insumo"),
});

const schema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  categoryId: z.string().optional(),
  modifierGroupIds: z.array(z.string()).optional(),
  variants: z.array(variantSchema).min(1, "Agrega al menos una variante"),
});

type FormData = z.infer<typeof schema>;

interface ExistingVariant {
  id: string;
  label: string;
  price: number;
  ingredients: { inventoryItemId: string; quantity: number }[];
}

interface ExistingDish {
  id: string;
  name: string;
  categoryId?: string | null;
  modifierGroupIds?: string[];
  variants: ExistingVariant[];
}

interface FoodDishFormDialogProps {
  inventoryItems: FoodInventoryOption[];
  categories?: FoodCategoryOption[];
  modifierGroups?: FoodModifierGroupOption[];
  dish?: ExistingDish;
  /** Controlled mode (e.g. opened by clicking the dish row): the parent owns the open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function emptyVariant(): FormData["variants"][number] {
  return { label: "", price: undefined as unknown as number, ingredients: [{ inventoryItemId: "", quantity: undefined as unknown as number }] };
}

function emptyDefaults(): FormData {
  return { name: "", categoryId: "", modifierGroupIds: [], variants: [{ ...emptyVariant(), label: DEFAULT_VARIANT_LABEL }] };
}

function dishDefaults(dish: ExistingDish): FormData {
  return {
    name: dish.name,
    categoryId: dish.categoryId ?? "",
    modifierGroupIds: dish.modifierGroupIds ?? [],
    variants: dish.variants.map((v) => ({ variantId: v.id, label: v.label, price: v.price, ingredients: v.ingredients })),
  };
}

export function FoodDishFormDialog({ inventoryItems, categories = [], modifierGroups = [], dish, open: controlledOpen, onOpenChange }: FoodDishFormDialogProps) {
  const { lang } = usePreferences();
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const [loading, setLoading] = useState(false);
  const isEdit = !!dish;

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: dish ? dishDefaults(dish) : emptyDefaults(),
  });
  const { register, control, handleSubmit, reset, setValue, formState: { errors } } = form;

  const { fields: variantFields, append: appendVariant, remove: removeVariant } = useFieldArray({ control, name: "variants" });
  const watchedModifierGroupIds = useWatch({ control, name: "modifierGroupIds" }) ?? [];

  // Every way of opening (pencil, row click) starts from the saved values.
  function setOpen(next: boolean) {
    if (next) reset(dish ? dishDefaults(dish) : emptyDefaults());
    setInnerOpen(next);
    onOpenChange?.(next);
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      if (isEdit && dish) {
        await updateFoodDish(dish.id, data);
        toast.success(lang === "es" ? "Platillo actualizado" : "Dish updated");
      } else {
        await createFoodDish(data);
        toast.success(lang === "es" ? "Platillo creado" : "Dish created");
      }
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e, (lang === "es" ? "Error al guardar platillo" : "Error saving dish")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-brand-600" aria-label={lang === "es" ? "Editar platillo" : "Edit dish"}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="h-4 w-4" />
            {lang === "es" ? "Nuevo platillo" : "New dish"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? (lang === "es" ? "Editar platillo" : "Edit dish") : (lang === "es" ? "Nuevo platillo" : "New dish")}
          </DialogTitle>
        </DialogHeader>
        <FormProvider {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{lang === "es" ? "Nombre del platillo *" : "Dish name *"}</Label>
                <Input placeholder={lang === "es" ? "Berry Bloom" : "Berry Bloom"} autoFocus {...register("name")} />
                {errors.name && <p className="text-xs text-red-500">{translateMessage(errors.name.message)}</p>}
              </div>
              <div className="space-y-2">
                <Label>{lang === "es" ? "Categoría" : "Category"}</Label>
                <select
                  {...register("categoryId")}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                >
                  <option value="">{lang === "es" ? "Sin categoría" : "No category"}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {modifierGroups.length > 0 && (
              <div className="space-y-2">
                <Label>{lang === "es" ? "Grupos de modificadores" : "Modifier groups"}</Label>
                <div className="flex flex-wrap gap-2">
                  {modifierGroups.map((g) => {
                    const checked = watchedModifierGroupIds.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() =>
                          setValue(
                            "modifierGroupIds",
                            checked ? watchedModifierGroupIds.filter((id) => id !== g.id) : [...watchedModifierGroupIds, g.id],
                            { shouldDirty: true }
                          )
                        }
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                          checked
                            ? "border-brand-600 bg-brand-50 text-brand-700"
                            : "border-slate-300 text-slate-600 hover:border-brand-300"
                        )}
                      >
                        {g.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label>{lang === "es" ? "Variantes (tamaños, presentaciones...) *" : "Variants (sizes, options...) *"}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Sizes usually share ingredients: start from the last variant's, quantities included.
                    const last = form.getValues("variants").at(-1);
                    const ingredients = (last?.ingredients ?? []).filter((i) => i.inventoryItemId).map((i) => ({ ...i }));
                    appendVariant({ ...emptyVariant(), ...(ingredients.length ? { ingredients } : {}) });
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {lang === "es" ? "Agregar variante" : "Add variant"}
                </Button>
              </div>
              {errors.variants?.message && <p className="text-xs text-red-500">{translateMessage(errors.variants.message)}</p>}
              <p className="text-xs text-slate-500">
                {lang === "es"
                  ? `Si el platillo no maneja tamaños, deja una sola variante llamada "${DEFAULT_VARIANT_LABEL}".`
                  : `If the dish doesn't have sizes, keep a single variant named "${DEFAULT_VARIANT_LABEL}".`}
              </p>

              <div className="max-h-[26rem] space-y-3 overflow-y-auto pr-0.5">
                {variantFields.map((field, index) => (
                  <VariantEditor
                    key={field.id}
                    variantIndex={index}
                    inventoryItems={inventoryItems}
                    onRemove={() => removeVariant(index)}
                    canRemove={variantFields.length > 1}
                  />
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {lang === "es" ? "Guardar" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

function VariantEditor({
  variantIndex, inventoryItems, onRemove, canRemove,
}: {
  variantIndex: number;
  inventoryItems: FoodInventoryOption[];
  onRemove: () => void;
  canRemove: boolean;
}) {
  const { lang } = usePreferences();
  const { register, control, setValue, formState: { errors } } = useFormContext<FormData>();
  const { fields: ingredientFields, append: appendIngredient, remove: removeIngredient } = useFieldArray({
    control,
    name: `variants.${variantIndex}.ingredients`,
  });
  const pickerRefs = useRef(new Map<string, HTMLInputElement>());
  const focusNew = useRef(false);
  useEffect(() => {
    if (!focusNew.current) return;
    focusNew.current = false;
    pickerRefs.current.get(ingredientFields.at(-1)?.id ?? "")?.focus();
  }, [ingredientFields]);

  const watchedIngredients = useWatch({ control, name: `variants.${variantIndex}.ingredients` });
  const watchedPrice = Number(useWatch({ control, name: `variants.${variantIndex}.price` })) || 0;

  const inventoryById = new Map(inventoryItems.map((i) => [i.id, i]));
  const liveCost = (watchedIngredients ?? []).reduce((sum, ing) => {
    const item = inventoryById.get(ing?.inventoryItemId ?? "");
    const qty = Number(ing?.quantity) || 0;
    return sum + (item?.unitCost ?? 0) * qty;
  }, 0);
  const liveMarginPct = watchedPrice > 0 ? ((watchedPrice - liveCost) / watchedPrice) * 100 : null;

  const variantErrors = errors.variants?.[variantIndex];

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1">
          <Label className="text-xs">{lang === "es" ? "Nombre de variante *" : "Variant name *"}</Label>
          <Input placeholder={DEFAULT_VARIANT_LABEL} {...register(`variants.${variantIndex}.label` as const)} />
          {variantErrors?.label && <p className="text-xs text-red-500">{variantErrors.label.message}</p>}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{lang === "es" ? "Precio de venta *" : "Sale price *"}</Label>
          <Input type="number" step="0.01" min="0" {...register(`variants.${variantIndex}.price` as const)} />
          {variantErrors?.price && <p className="text-xs text-red-500">{variantErrors.price.message}</p>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={!canRemove}
          className="text-slate-400 hover:text-red-600 disabled:opacity-30"
          title={lang === "es" ? "Quitar variante" : "Remove variant"}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">{lang === "es" ? "Insumos y cantidades *" : "Ingredients and quantities *"}</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => appendIngredient({ inventoryItemId: "", quantity: undefined as unknown as number })}
          >
            <Plus className="h-3.5 w-3.5" />
            {lang === "es" ? "Agregar" : "Add"}
          </Button>
        </div>
        {typeof variantErrors?.ingredients?.message === "string" && (
          <p className="text-xs text-red-500">{variantErrors.ingredients.message}</p>
        )}
        {inventoryItems.length === 0 && (
          <p className="text-xs text-amber-600">
            {lang === "es"
              ? "Todavía no tienes insumos en tu inventario — agrégalos primero."
              : "You don't have any inventory items yet — add some first."}
          </p>
        )}
        <div className="space-y-2">
          {ingredientFields.map((field, ingIndex) => {
            const item = inventoryById.get(watchedIngredients?.[ingIndex]?.inventoryItemId ?? "");
            return (
              <div key={field.id} className="flex flex-col gap-2 rounded-md border border-slate-100 bg-slate-50/60 p-2 sm:flex-row sm:items-start">
                <div className="flex-1 space-y-1">
                  <IngredientCombobox
                    items={inventoryItems}
                    usedIds={(watchedIngredients ?? []).map((w) => w?.inventoryItemId).filter((x): x is string => !!x)}
                    value={watchedIngredients?.[ingIndex]?.inventoryItemId ?? ""}
                    onChange={(id) =>
                      setValue(`variants.${variantIndex}.ingredients.${ingIndex}.inventoryItemId` as const, id, { shouldValidate: !!id })
                    }
                    inputRef={(el) => {
                      if (el) pickerRefs.current.set(field.id, el);
                      else pickerRefs.current.delete(field.id);
                    }}
                  />
                  {variantErrors?.ingredients?.[ingIndex]?.inventoryItemId && (
                    <p className="text-xs text-red-500">{variantErrors.ingredients[ingIndex]?.inventoryItemId?.message}</p>
                  )}
                </div>
                <div className="w-full space-y-1 sm:w-32">
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.001"
                      min="0"
                      inputMode="decimal"
                      placeholder={lang === "es" ? "Cantidad" : "Quantity"}
                      className="pr-10 text-right"
                      {...register(`variants.${variantIndex}.ingredients.${ingIndex}.quantity` as const)}
                      onKeyDown={(e) => {
                        // Enter on the last ingredient adds another one and jumps to it.
                        if (e.key === "Enter" && ingIndex === ingredientFields.length - 1) {
                          e.preventDefault();
                          appendIngredient({ inventoryItemId: "", quantity: undefined as unknown as number });
                          focusNew.current = true;
                        }
                      }}
                    />
                    <span className="pointer-events-none absolute right-2 top-2.5 text-xs text-slate-400">{item?.unit ?? ""}</span>
                  </div>
                  {variantErrors?.ingredients?.[ingIndex]?.quantity && (
                    <p className="text-xs text-red-500">{variantErrors.ingredients[ingIndex]?.quantity?.message}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeIngredient(ingIndex)}
                  disabled={ingredientFields.length === 1}
                  className="text-slate-400 hover:text-red-600 disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-400">
          {lang === "es" ? "Elige el insumo de la lista o escribe para buscar; Enter en la cantidad agrega otro." : "Pick from the list or type to search; Enter on the quantity adds another."}
        </p>
      </div>

      <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-500">{lang === "es" ? "Costo calculado: " : "Calculated cost: "}</span>
        <span className="font-semibold text-slate-900">${liveCost.toFixed(2)}</span>
        {liveMarginPct !== null && (
          <span
            className={cn(
              "ml-2 text-xs font-medium",
              liveMarginPct >= 30 ? "text-emerald-600" : liveMarginPct >= 15 ? "text-amber-600" : "text-red-600"
            )}
          >
            · {lang === "es" ? "Margen" : "Margin"}: {liveMarginPct.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
