"use client";

import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, Check, GripVertical, MoveRight } from "lucide-react";
import { toast } from "sonner";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { useFlip } from "@/components/motion/useFlip";
import { LeadDetailPanel } from "@/components/portal/LeadDetailPanel";
import { usePreferences } from "@/context/preferences";
import { moveOpportunityStage } from "@/actions/opportunities";
import { getErrorMessage } from "@/lib/user-error";
import { cn, formatCurrency } from "@/lib/utils";

export type BoardStage = { id: string; name: string; isWon: boolean; isLost: boolean };
export type BoardOpportunity = {
  id: string;
  title: string;
  amount: number | null;
  currency: string;
  /** ISO. */
  estimatedCloseDate: string | null;
  leadId: string;
  leadName: string;
  ownerName: string | null;
  tags: string[];
  stageId: string;
};

const COPY = {
  es: {
    empty: "Sin oportunidades",
    dropHere: "Suelta aquí",
    moveTo: "Mover a…",
    moveError: "No se pudo mover la oportunidad; volvió a su etapa.",
    moved: (title: string, stage: string) => `${title} → ${stage}`,
    dragHint: "Arrastra para cambiar de etapa",
    open: "Abrir detalle",
    pickUp: (t: string) => `Tomaste ${t}.`,
    over: (t: string, s: string) => `${t} sobre ${s}.`,
    drop: (t: string, s: string) => `${t} movida a ${s}.`,
    cancel: (t: string) => `Se canceló el movimiento de ${t}.`,
    instructions: "Para mover una oportunidad: presiona Espacio, usa las flechas izquierda y derecha para elegir la etapa y presiona Espacio para soltar. Escape cancela.",
    stageCount: (n: number) => `${n} ${n === 1 ? "oportunidad" : "oportunidades"}`,
    showMore: (n: number) => `Ver ${n} más`,
    showLess: "Ver menos",
  },
  en: {
    empty: "No opportunities",
    dropHere: "Drop here",
    moveTo: "Move to…",
    moveError: "Couldn't move the opportunity; it went back to its stage.",
    moved: (title: string, stage: string) => `${title} → ${stage}`,
    dragHint: "Drag to change stage",
    open: "Open details",
    pickUp: (t: string) => `Picked up ${t}.`,
    over: (t: string, s: string) => `${t} over ${s}.`,
    drop: (t: string, s: string) => `${t} moved to ${s}.`,
    cancel: (t: string) => `Move of ${t} cancelled.`,
    instructions: "To move an opportunity: press Space, use the left and right arrows to pick the stage and press Space to drop. Escape cancels.",
    stageCount: (n: number) => `${n} ${n === 1 ? "opportunity" : "opportunities"}`,
    showMore: (n: number) => `Show ${n} more`,
    showLess: "Show less",
  },
};

function initials(name: string | null) {
  if (!name) return "";
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Totales de una columna por moneda (nunca se suman monedas distintas). */
function totalsByCurrency(list: BoardOpportunity[]) {
  const map = new Map<string, number>();
  for (const o of list) if (o.amount != null) map.set(o.currency, (map.get(o.currency) ?? 0) + o.amount);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

/** Tarjetas visibles por etapa antes de "Ver más": evita que una columna larga lo amontone todo. */
export const STAGE_VISIBLE_LIMIT = 5;

const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : rectIntersection(args);
};

/** Con el teclado, las flechas izquierda/derecha saltan a la columna vecina. */
const columnKeyboard: KeyboardCoordinateGetter = (event, { context: { droppableRects, droppableContainers, collisionRect }, currentCoordinates }) => {
  if (event.code !== "ArrowRight" && event.code !== "ArrowLeft") return undefined;
  event.preventDefault();
  if (!collisionRect) return currentCoordinates;
  const columns = droppableContainers
    .getEnabled()
    .flatMap((c) => {
      const rect = droppableRects.get(c.id);
      return rect ? [{ rect }] : [];
    })
    .sort((a, b) => a.rect.left - b.rect.left);
  const here = columns.findIndex((x) => collisionRect.left < x.rect.left + x.rect.width && collisionRect.left + collisionRect.width > x.rect.left);
  const nextIndex = Math.max(0, Math.min(columns.length - 1, (here < 0 ? 0 : here) + (event.code === "ArrowRight" ? 1 : -1)));
  const target = columns[nextIndex];
  return target ? { x: target.rect.left + 8, y: target.rect.top + 48 } : currentCoordinates;
};

export function PipelineBoard({ stages, opportunities, canManage }: { stages: BoardStage[]; opportunities: BoardOpportunity[]; canManage: boolean }) {
  const { lang } = usePreferences();
  const t = COPY[lang === "en" ? "en" : "es"];
  // Movimientos en vuelo: se muestran de inmediato y se descartan solos cuando llegan los datos nuevos del servidor.
  const [overrides, setOverrides] = useState<Record<string, { to: string; base: BoardOpportunity[] }>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [panelLeadId, setPanelLeadId] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const openPanel = (leadId: string) => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPanelLeadId(leadId);
  };

  const items = useMemo(() => {
    // Lo recién movido va primero en su nueva etapa (así siempre se ve aunque la columna esté recortada).
    const moved: BoardOpportunity[] = [];
    const rest: BoardOpportunity[] = [];
    for (const o of opportunities) {
      const ov = overrides[o.id];
      if (ov && ov.base === opportunities) moved.push({ ...o, stageId: ov.to });
      else rest.push(o);
    }
    return [...moved, ...rest];
  }, [opportunities, overrides]);
  const byId = useMemo(() => new Map(items.map((o) => [o.id, o])), [items]);
  const stageName = (id: string) => stages.find((s) => s.id === id)?.name ?? "";
  useFlip(boardRef, items.map((o) => `${o.id}:${o.stageId}`).join("|"));

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] }, coordinateGetter: columnKeyboard }),
  );

  async function move(oppId: string, toStageId: string) {
    const opp = byId.get(oppId);
    if (!opp || opp.stageId === toStageId) return;
    setOverrides((o) => ({ ...o, [oppId]: { to: toStageId, base: opportunities } }));
    try {
      await moveOpportunityStage(oppId, toStageId);
      toast.success(t.moved(opp.title, stageName(toStageId)));
    } catch (e) {
      setOverrides((o) => {
        const { [oppId]: _drop, ...rest } = o;
        void _drop;
        return rest;
      });
      // Título siempre claro; el detalle (por ejemplo "No autorizado") va aparte cuando el servidor lo da.
      toast.error(t.moveError, { description: getErrorMessage(e, "") || undefined });
    }
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    setOverStage(null);
    if (e.over) void move(String(e.active.id), String(e.over.id));
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => t.pickUp(byId.get(String(active.id))?.title ?? ""),
    onDragOver: ({ active, over }) => (over ? t.over(byId.get(String(active.id))?.title ?? "", stageName(String(over.id))) : undefined),
    onDragEnd: ({ active, over }) => (over ? t.drop(byId.get(String(active.id))?.title ?? "", stageName(String(over.id))) : t.cancel(byId.get(String(active.id))?.title ?? "")),
    onDragCancel: ({ active }) => t.cancel(byId.get(String(active.id))?.title ?? ""),
  };

  const active = activeId ? byId.get(activeId) : null;

  return (
    <>
      <DndContext
        id="pipeline-board"
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onDragStart}
        onDragOver={(e) => setOverStage(e.over ? String(e.over.id) : null)}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setOverStage(null);
        }}
        accessibility={{ announcements, screenReaderInstructions: { draggable: t.instructions } }}
      >
        <div ref={boardRef} className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
          {stages.map((stage, i) => (
            <Column
              key={stage.id}
              stage={stage}
              index={i}
              list={items.filter((o) => o.stageId === stage.id)}
              stages={stages}
              canManage={canManage}
              activeId={activeId}
              highlighted={activeId !== null && overStage === stage.id}
              onOpen={openPanel}
              onMove={move}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" }}>
          {active ? <CardBody opp={active} lifted /> : null}
        </DragOverlay>
      </DndContext>
      <LeadDetailPanel leadId={panelLeadId} onClose={() => setPanelLeadId(null)} returnFocusRef={openerRef} />
    </>
  );
}

function Column({
  stage,
  index,
  list,
  stages,
  canManage,
  activeId,
  highlighted,
  onOpen,
  onMove,
}: {
  stage: BoardStage;
  index: number;
  list: BoardOpportunity[];
  stages: BoardStage[];
  canManage: boolean;
  activeId: string | null;
  highlighted: boolean;
  onOpen: (leadId: string) => void;
  onMove: (oppId: string, stageId: string) => void;
}) {
  const { lang } = usePreferences();
  const t = COPY[lang === "en" ? "en" : "es"];
  const { setNodeRef } = useDroppable({ id: stage.id, disabled: !canManage });
  const totals = totalsByCurrency(list);
  const [expanded, setExpanded] = useState(false);
  const hidden = expanded ? 0 : Math.max(0, list.length - STAGE_VISIBLE_LIMIT);
  const shown = hidden > 0 ? list.slice(0, STAGE_VISIBLE_LIMIT) : list;
  return (
    <section
      ref={setNodeRef}
      aria-label={stage.name}
      className={cn(
        "reveal flex w-[17.5rem] flex-shrink-0 snap-start flex-col overflow-hidden rounded-card border bg-slate-50 shadow-card motion-micro transition-[border-color,box-shadow,background-color] sm:w-72",
        highlighted ? "border-brand-400 bg-brand-50 ring-2 ring-brand-400/40" : "border-slate-300",
      )}
      style={{ "--i": index } as React.CSSProperties}
    >
      {/* Franja de color de la etapa: separa visualmente cada rectángulo. */}
      <div aria-hidden="true" className={cn("h-1 w-full flex-shrink-0", stage.isWon ? "bg-emerald-500" : stage.isLost ? "bg-red-400" : "bg-brand-500")} />
      <div className="border-b border-slate-200 bg-white px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900">{stage.name}</h3>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600" title={t.stageCount(list.length)}>
            {list.length}
          </span>
        </div>
        <p className="mt-0.5 min-h-4 text-xs tabular-nums text-slate-500">
          {totals.length === 0 ? (
            "\u00a0"
          ) : (
            totals.map(([currency, total], i) => (
              <span key={currency}>
                {i > 0 && " · "}
                <AnimatedNumber value={total} format={{ style: "currency", currency }} />
              </span>
            ))
          )}
        </p>
      </div>
      <div
        className={cn(
          "min-h-[7.5rem] flex-1 space-y-2 p-2",
          expanded && "max-h-[70vh] overflow-y-auto overscroll-contain",
        )}
      >
        {list.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-slate-400">{highlighted ? t.dropHere : t.empty}</p>
        ) : (
          shown.map((opp) => <DraggableCard key={opp.id} opp={opp} stages={stages} canManage={canManage} dragging={activeId === opp.id} onOpen={onOpen} onMove={onMove} />)
        )}
        {list.length > STAGE_VISIBLE_LIMIT && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="w-full rounded-md py-1.5 text-xs font-medium text-brand-700 motion-micro hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {expanded ? t.showLess : t.showMore(hidden || list.length - STAGE_VISIBLE_LIMIT)}
          </button>
        )}
      </div>
    </section>
  );
}

function DraggableCard({ opp, stages, canManage, dragging, onOpen, onMove }: { opp: BoardOpportunity; stages: BoardStage[]; canManage: boolean; dragging: boolean; onOpen: (leadId: string) => void; onMove: (oppId: string, stageId: string) => void }) {
  const { lang } = usePreferences();
  const t = COPY[lang === "en" ? "en" : "es"];
  const { attributes, listeners, setNodeRef } = useDraggable({ id: opp.id, disabled: !canManage });
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      ref={setNodeRef}
      data-flip-id={opp.id}
      {...(canManage ? { ...attributes, ...listeners } : {})}
      role="button"
      tabIndex={0}
      aria-label={`${t.open}: ${opp.title}`}
      onClick={() => onOpen(opp.leadId)}
      onKeyDown={(e) => {
        // Enter abre el detalle; Espacio queda para iniciar el arrastre con teclado (lo maneja dnd-kit).
        if (e.key === "Enter" && e.target === e.currentTarget) onOpen(opp.leadId);
        else listeners?.onKeyDown?.(e);
      }}
      className={cn("group relative rounded-card outline-none focus-visible:ring-2 focus-visible:ring-brand-500", dragging && "opacity-40", canManage && "cursor-grab active:cursor-grabbing")}
    >
      <CardBody opp={opp} canManage={canManage} menu={
        canManage ? (
          <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <Popover.Trigger asChild>
              <button
                type="button"
                aria-label={`${t.moveTo} ${opp.title}`}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                className="rounded-md p-1 text-slate-400 motion-micro hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-brand-500 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 data-[state=open]:opacity-100"
              >
                <MoveRight className="h-3.5 w-3.5" />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content align="end" sideOffset={6} onClick={(e) => e.stopPropagation()} className="z-50 w-48 rounded-card border border-slate-200 bg-white p-1 shadow-pop animate-pop-in">
                <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">{t.moveTo}</p>
                {stages.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={s.id === opp.stageId}
                    onClick={() => {
                      setMenuOpen(false);
                      onMove(opp.id, s.id);
                    }}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm text-slate-700 motion-micro hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none disabled:text-slate-400 disabled:hover:bg-transparent"
                  >
                    {s.name}
                    {s.id === opp.stageId && <Check className="h-3.5 w-3.5" />}
                  </button>
                ))}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        ) : null
      } />
    </div>
  );
}

function CardBody({ opp, lifted = false, canManage = false, menu }: { opp: BoardOpportunity; lifted?: boolean; canManage?: boolean; menu?: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-card border border-slate-200 bg-white p-3 motion-micro transition-[box-shadow,border-color,transform]",
        lifted ? "scale-[1.03] rotate-[1.5deg] border-brand-300 shadow-pop" : "shadow-card hover:border-slate-300 hover:shadow-card-hover",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{opp.title}</p>
          <p className="truncate text-xs text-slate-500">{opp.leadName}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-0.5">
          {menu}
          {canManage && <GripVertical className="hidden h-3.5 w-3.5 text-slate-300 sm:block" aria-hidden="true" />}
        </div>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums text-slate-900">{opp.amount != null ? formatCurrency(opp.amount, opp.currency) : "—"}</span>
        {opp.ownerName && (
          <span title={opp.ownerName} className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-50 text-[9px] font-semibold text-brand-700">
            {initials(opp.ownerName)}
          </span>
        )}
      </div>
      {(opp.tags.length > 0 || opp.estimatedCloseDate) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {opp.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
              {tag}
            </span>
          ))}
          {opp.estimatedCloseDate && (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-400">
              <CalendarDays className="h-3 w-3" />
              {new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short" }).format(new Date(opp.estimatedCloseDate))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
