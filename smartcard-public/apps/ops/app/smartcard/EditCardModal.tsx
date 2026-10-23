'use client'

import { useState } from 'react'
import Link from 'next/link'

interface DestinationType {
  code: string
  label: string
  requires_profile: boolean
  requires_url: boolean
}

interface CardRow {
  id: string
  card_code: string | null
  destination_type: string
  destination_url: string | null
  profile_id: string | null
}

interface CompanyProfile {
  id: string
  display_name: string
}

/**
 * Modal de "Editar tarjeta" de apps/ops -- mismo campo Destino que
 * apps/admin/app/cards/CardDestinationFields.tsx, pero acotado a lo que un
 * cliente debe poder tocar (nunca notes/client_id/status) y sin el
 * selector de "cualquier perfil del sistema" del admin: aquí solo existe
 * EL perfil digital de esta empresa (si ya lo creó), nunca uno ajeno.
 */
export function EditCardModal({
  card,
  destinationTypes,
  companyProfile,
  canEdit,
  action,
}: {
  card: CardRow
  destinationTypes: DestinationType[]
  companyProfile: CompanyProfile | null
  canEdit: boolean
  action: (formData: FormData) => void
}) {
  const [open, setOpen] = useState(false)
  const [destinationType, setDestinationType] = useState(card.destination_type)

  const selected = destinationTypes.find((d) => d.code === destinationType)
  const needsProfile = selected?.requires_profile ?? false
  const needsUrl = selected?.requires_url ?? false
  const blockedOnProfile = needsProfile && !companyProfile

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-neutral-700 underline hover:text-neutral-900"
      >
        {canEdit ? 'Editar' : 'Ver'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">
                  Editar tarjeta · {card.card_code ?? '—'}
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Cambia a dónde manda esta tarjeta cuando alguien la escanea.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="text-neutral-400 hover:text-neutral-700"
              >
                ✕
              </button>
            </div>

            <form action={action} className="flex flex-col gap-4">
              <input type="hidden" name="card_id" value={card.id} />

              <div className="flex flex-col gap-1">
                <label htmlFor={`destination_type-${card.id}`} className="text-sm font-medium">
                  Destino
                </label>
                <select
                  id={`destination_type-${card.id}`}
                  name="destination_type"
                  required
                  disabled={!canEdit}
                  value={destinationType}
                  onChange={(e) => setDestinationType(e.target.value)}
                  className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
                >
                  {destinationTypes.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              {needsProfile && (
                <div className="rounded-md bg-neutral-50 px-3 py-2 text-sm">
                  {companyProfile ? (
                    <>
                      <input type="hidden" name="profile_id" value={companyProfile.id} />
                      Va a usar tu perfil digital:{' '}
                      <span className="font-medium">{companyProfile.display_name}</span>
                    </>
                  ) : (
                    <p className="text-amber-700">
                      Todavía no tienes un perfil digital.{' '}
                      <Link href="/smartcard/profile" className="underline">
                        Créalo primero
                      </Link>{' '}
                      y vuelve a editar la tarjeta.
                    </p>
                  )}
                </div>
              )}

              {needsUrl && (
                <div className="flex flex-col gap-1">
                  <label htmlFor={`destination_url-${card.id}`} className="text-sm font-medium">
                    URL de destino
                  </label>
                  <input
                    id={`destination_url-${card.id}`}
                    name="destination_url"
                    type="url"
                    required
                    disabled={!canEdit}
                    placeholder="https://..."
                    defaultValue={card.destination_url ?? ''}
                    className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
                  />
                </div>
              )}

              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100"
                >
                  Cancelar
                </button>
                {canEdit && (
                  <button
                    type="submit"
                    disabled={blockedOnProfile}
                    className="rounded-md bg-[#04275A] px-3 py-2 text-sm font-medium text-white hover:bg-[#063C82] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Guardar
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
