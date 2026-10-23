'use client'

import { useState } from 'react'

interface DestinationType {
  code: string
  label: string
  requires_profile: boolean
  requires_url: boolean
}

interface ProfileOption {
  id: string
  display_name: string
  slug: string
  client_name: string | null
}

/**
 * `cards.destination_type` decide si la tarjeta necesita `profile_id`,
 * `destination_url`, o ninguno de los dos -- exactamente la regla que ya
 * aplica `validate_card_destination()` en la base de datos (Fase 2). Este
 * componente solo refleja esa misma regla en la UI, mostrando el campo que
 * corresponde y ocultando el que no aplica, para que el admin no tenga que
 * adivinar ni llenar un campo que el trigger va a rechazar.
 *
 * Es 'use client' a propósito -- es el único formulario del panel que
 * necesita reaccionar a un cambio en tiempo real sin recargar la página. El
 * resto de Fases 5/6 evitó JavaScript de cliente deliberadamente; aquí el
 * costo se justifica porque la alternativa (mostrar los dos campos siempre)
 * confunde más de lo que ahorra.
 */
export function CardDestinationFields({
  destinationTypes,
  profiles,
  defaultDestinationType,
  defaultProfileId,
  defaultDestinationUrl,
  disabled,
}: {
  destinationTypes: DestinationType[]
  profiles: ProfileOption[]
  defaultDestinationType: string
  defaultProfileId: string | null
  defaultDestinationUrl: string | null
  disabled: boolean
}) {
  const [destinationType, setDestinationType] = useState(
    defaultDestinationType || destinationTypes[0]?.code || ''
  )

  const selected = destinationTypes.find((d) => d.code === destinationType)
  const needsProfile = selected?.requires_profile ?? false
  const needsUrl = selected?.requires_url ?? false

  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor="destination_type" className="text-sm font-medium">
          Tipo de destino <span className="text-red-600">*</span>
        </label>
        <select
          id="destination_type"
          name="destination_type"
          required
          disabled={disabled}
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
        <div className="flex flex-col gap-1">
          <label htmlFor="profile_id" className="text-sm font-medium">
            Perfil digital <span className="text-red-600">*</span>
          </label>
          <select
            id="profile_id"
            name="profile_id"
            required
            disabled={disabled}
            defaultValue={defaultProfileId ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
          >
            <option value="" disabled>
              Selecciona un perfil...
            </option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name} — {p.client_name ?? '?'} (/{p.slug})
              </option>
            ))}
          </select>
        </div>
      )}

      {needsUrl && (
        <div className="flex flex-col gap-1">
          <label htmlFor="destination_url" className="text-sm font-medium">
            URL de destino <span className="text-red-600">*</span>
          </label>
          <input
            id="destination_url"
            name="destination_url"
            type="url"
            required
            disabled={disabled}
            placeholder="https://..."
            defaultValue={defaultDestinationUrl ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
          />
        </div>
      )}
    </>
  )
}
