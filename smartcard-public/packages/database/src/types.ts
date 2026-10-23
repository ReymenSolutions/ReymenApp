// Tipos de la base de datos de REYMEN SmartCard.
//
// Escrito a mano a partir de las migraciones de Fase 2 (supabase/migrations/),
// con la misma forma que genera `supabase gen types typescript`. Cuando el
// esquema cambie, regenera este archivo así (desde la raíz del proyecto):
//
//   npx supabase gen types typescript --project-id <tu-project-ref> > packages/database/src/types.ts
//
// mientras tanto, este archivo ya da autocompletado e tipado real.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      admin_profiles: {
        Row: {
          id: string
          full_name: string
          role: 'SUPERADMIN' | 'ADMIN' | 'VIEWER'
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name: string
          role: 'SUPERADMIN' | 'ADMIN' | 'VIEWER'
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['admin_profiles']['Insert']>
        Relationships: []
      }
      clients: {
        Row: {
          id: string
          name: string
          business_name: string | null
          email: string | null
          phone: string | null
          status: 'ACTIVE' | 'INACTIVE'
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          deleted_at: string | null
          // Fase 1 de REYMEN Ops (20260916120001): puente hacia el modelo
          // multi-tenant nuevo -- cada client ya tiene su companies
          // correspondiente por el backfill de esa migración.
          company_id: string | null
        }
        Insert: {
          id?: string
          name: string
          business_name?: string | null
          email?: string | null
          phone?: string | null
          status?: 'ACTIVE' | 'INACTIVE'
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
          company_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['clients']['Insert']>
        Relationships: []
      }
      themes: {
        Row: {
          id: string
          slug: string
          name: string
          config: Json
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          config?: Json
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['themes']['Insert']>
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          client_id: string
          slug: string
          first_name: string | null
          last_name: string | null
          display_name: string
          job_title: string | null
          company: string | null
          bio: string | null
          photo_url: string | null
          logo_url: string | null
          phone: string | null
          whatsapp: string | null
          email: string | null
          website: string | null
          address: string | null
          maps_url: string | null
          instagram: string | null
          facebook: string | null
          linkedin: string | null
          tiktok: string | null
          youtube: string | null
          theme_id: string | null
          theme_overrides: Json
          status: 'ACTIVE' | 'INACTIVE'
          is_noindex: boolean
          created_at: string
          updated_at: string
          created_by: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          slug: string
          first_name?: string | null
          last_name?: string | null
          display_name: string
          job_title?: string | null
          company?: string | null
          bio?: string | null
          photo_url?: string | null
          logo_url?: string | null
          phone?: string | null
          whatsapp?: string | null
          email?: string | null
          website?: string | null
          address?: string | null
          maps_url?: string | null
          instagram?: string | null
          facebook?: string | null
          linkedin?: string | null
          tiktok?: string | null
          youtube?: string | null
          theme_id?: string | null
          theme_overrides?: Json
          status?: 'ACTIVE' | 'INACTIVE'
          is_noindex?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
        Relationships: []
      }
      profile_links: {
        Row: {
          id: string
          profile_id: string
          title: string
          url: string
          icon: string | null
          type: string | null
          subtitle: string | null
          price_label: string | null
          image_url: string | null
          source_ref: string | null
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          title: string
          url: string
          icon?: string | null
          type?: string | null
          subtitle?: string | null
          price_label?: string | null
          image_url?: string | null
          source_ref?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['profile_links']['Insert']>
        Relationships: []
      }
      cards: {
        Row: {
          id: string
          card_code: string | null
          client_id: string
          profile_id: string | null
          destination_type: string
          destination_url: string | null
          status: 'ACTIVE' | 'INACTIVE'
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          card_code?: string | null
          client_id: string
          profile_id?: string | null
          destination_type: string
          destination_url?: string | null
          status?: 'ACTIVE' | 'INACTIVE'
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['cards']['Insert']>
        Relationships: []
      }
      events: {
        Row: {
          id: string
          card_id: string | null
          profile_id: string | null
          link_id: string | null
          event_type:
            | 'profile_view'
            | 'nfc_scan'
            | 'qr_scan'
            | 'whatsapp_click'
            | 'call_click'
            | 'email_click'
            | 'instagram_click'
            | 'facebook_click'
            | 'linkedin_click'
            | 'maps_click'
            | 'website_click'
            | 'save_contact'
            | 'custom_link_click'
            | 'google_reviews_redirect'
            | 'external_redirect'
            | 'client_error'
          source: 'NFC' | 'QR' | 'DIRECT'
          occurred_at: string
          user_agent: string | null
          referrer: string | null
          device_type: 'mobile' | 'tablet' | 'desktop' | 'unknown' | null
          is_bot: boolean
          created_at: string
        }
        Insert: {
          id?: string
          card_id?: string | null
          profile_id?: string | null
          link_id?: string | null
          event_type: Database['public']['Tables']['events']['Row']['event_type']
          source: 'NFC' | 'QR' | 'DIRECT'
          occurred_at?: string
          user_agent?: string | null
          referrer?: string | null
          device_type?: 'mobile' | 'tablet' | 'desktop' | 'unknown' | null
          is_bot?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['events']['Insert']>
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          admin_user_id: string | null
          action: string
          entity_type: string
          entity_id: string | null
          before_data: Json | null
          after_data: Json | null
          occurred_at: string
          // Fase 1 de REYMEN Ops (20260916120006): nullable -- las acciones
          // internas de siempre (clients/profiles/cards vía apps/admin)
          // siguen sin company_id; BillingService lo llena cuando la acción
          // es sobre una company.
          company_id: string | null
        }
        Insert: {
          id?: string
          admin_user_id?: string | null
          action: string
          entity_type: string
          entity_id?: string | null
          before_data?: Json | null
          after_data?: Json | null
          occurred_at?: string
          company_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['audit_logs']['Insert']>
        Relationships: []
      }
      destination_types: {
        Row: {
          code: string
          label: string
          requires_profile: boolean
          requires_url: boolean
          is_active: boolean
          sort_order: number
        }
        Insert: {
          code: string
          label: string
          requires_profile?: boolean
          requires_url?: boolean
          is_active?: boolean
          sort_order?: number
        }
        Update: Partial<Database['public']['Tables']['destination_types']['Insert']>
        Relationships: []
      }
      reserved_slugs: {
        Row: { slug: string }
        Insert: { slug: string }
        Update: Partial<Database['public']['Tables']['reserved_slugs']['Insert']>
        Relationships: []
      }
      feedback: {
        Row: {
          id: string
          source: 'public_profile' | 'admin_panel'
          message: string
          contact_email: string | null
          profile_id: string | null
          admin_id: string | null
          page_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          source: 'public_profile' | 'admin_panel'
          message: string
          contact_email?: string | null
          profile_id?: string | null
          admin_id?: string | null
          page_url?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['feedback']['Insert']>
        Relationships: []
      }
      // ---------------------------------------------------------------------
      // REYMEN Ops -- Fase 1 (Core). Ver REYMEN_OPS_PLAN.md y las
      // migraciones 20260916120001 a 20260916120006. `profiles` (tarjeta
      // pública) ya existía -- la tabla de Auth del prompt maestro se llamó
      // `user_profiles` para no chocar (documentado en el plan, riesgo 1).
      // ---------------------------------------------------------------------
      companies: {
        Row: {
          id: string
          name: string
          slug: string
          industry: string | null
          status: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled'
          current_plan_id: string | null
          billing_email: string | null
          timezone: string
          onboarding_completed: boolean
          external_org_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          industry?: string | null
          status?: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled'
          current_plan_id?: string | null
          billing_email?: string | null
          timezone?: string
          onboarding_completed?: boolean
          external_org_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['companies']['Insert']>
        Relationships: []
      }
      branches: {
        Row: {
          id: string
          company_id: string
          name: string
          code: string | null
          address: string | null
          timezone: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          name: string
          code?: string | null
          address?: string | null
          timezone?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['branches']['Insert']>
        Relationships: []
      }
      user_profiles: {
        Row: {
          id: string
          full_name: string | null
          avatar_url: string | null
          phone: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          avatar_url?: string | null
          phone?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['user_profiles']['Insert']>
        Relationships: []
      }
      company_users: {
        Row: {
          id: string
          company_id: string
          user_id: string
          role_id: string
          branch_id: string | null
          status: 'invited' | 'active' | 'suspended' | 'removed'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          user_id: string
          role_id: string
          branch_id?: string | null
          status?: 'invited' | 'active' | 'suspended' | 'removed'
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['company_users']['Insert']>
        Relationships: []
      }
      roles: {
        Row: { id: string; code: string; name: string; description: string | null; created_at: string }
        Insert: { id?: string; code: string; name: string; description?: string | null; created_at?: string }
        Update: Partial<Database['public']['Tables']['roles']['Insert']>
        Relationships: []
      }
      permissions: {
        Row: { id: string; key: string; description: string | null; created_at: string }
        Insert: { id?: string; key: string; description?: string | null; created_at?: string }
        Update: Partial<Database['public']['Tables']['permissions']['Insert']>
        Relationships: []
      }
      role_permissions: {
        Row: { role_id: string; permission_id: string }
        Insert: { role_id: string; permission_id: string }
        Update: Partial<Database['public']['Tables']['role_permissions']['Insert']>
        Relationships: []
      }
      plans: {
        Row: {
          id: string
          code: string
          name: string
          description: string | null
          price_mxn: number
          billing_period: 'monthly' | 'yearly'
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          name: string
          description?: string | null
          price_mxn: number
          billing_period?: 'monthly' | 'yearly'
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['plans']['Insert']>
        Relationships: []
      }
      modules: {
        Row: { id: string; code: string; name: string; description: string | null; active: boolean }
        Insert: { id?: string; code: string; name: string; description?: string | null; active?: boolean }
        Update: Partial<Database['public']['Tables']['modules']['Insert']>
        Relationships: []
      }
      plan_modules: {
        Row: { plan_id: string; module_id: string; enabled: boolean; limits: Json }
        Insert: { plan_id: string; module_id: string; enabled?: boolean; limits?: Json }
        Update: Partial<Database['public']['Tables']['plan_modules']['Insert']>
        Relationships: []
      }
      company_modules: {
        Row: {
          id: string
          company_id: string
          module_id: string
          enabled: boolean
          source: 'plan' | 'override' | 'beta'
          limits: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          module_id: string
          enabled?: boolean
          source?: 'plan' | 'override' | 'beta'
          limits?: Json
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['company_modules']['Insert']>
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          company_id: string
          plan_id: string
          provider: 'manual' | 'mercadopago' | 'stripe' | 'other'
          provider_subscription_id: string | null
          status: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled'
          current_period_start: string
          current_period_end: string
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          plan_id: string
          provider?: 'manual' | 'mercadopago' | 'stripe' | 'other'
          provider_subscription_id?: string | null
          status?: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled'
          current_period_start?: string
          current_period_end?: string
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          company_id: string
          subscription_id: string | null
          provider: 'manual' | 'mercadopago' | 'stripe' | 'other'
          provider_payment_id: string | null
          payment_method: 'transfer' | 'cash' | 'bank_deposit' | 'other'
          amount: number
          currency: string
          status: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled'
          paid_at: string | null
          due_at: string | null
          reference: string | null
          notes: string | null
          metadata: Json
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          subscription_id?: string | null
          provider?: 'manual' | 'mercadopago' | 'stripe' | 'other'
          provider_payment_id?: string | null
          payment_method: 'transfer' | 'cash' | 'bank_deposit' | 'other'
          amount: number
          currency?: string
          status?: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled'
          paid_at?: string | null
          due_at?: string | null
          reference?: string | null
          notes?: string | null
          metadata?: Json
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['payments']['Insert']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      current_admin_role: {
        Args: Record<string, never>
        Returns: string | null
      }
      get_card_for_redirect: {
        Args: { p_card_code: string }
        Returns: Json
      }
      get_public_profile: {
        Args: { p_slug: string }
        Returns: Json
      }
      get_public_profile_slugs: {
        Args: Record<string, never>
        Returns: { slug: string; updated_at: string }[]
      }
      get_vcard_data: {
        Args: { p_slug: string }
        Returns: Json
      }
      get_link_for_redirect: {
        Args: { p_link_id: string }
        Returns: Json
      }
      log_event: {
        Args: {
          p_event_type: string
          p_source: string
          p_card_code?: string | null
          p_profile_slug?: string | null
          p_link_id?: string | null
          p_user_agent?: string | null
          p_referrer?: string | null
          p_device_type?: string | null
          p_is_bot?: boolean
        }
        Returns: undefined
      }
      log_admin_action: {
        Args: {
          p_action: string
          p_entity_type: string
          p_entity_id?: string | null
          p_before_data?: Json | null
          p_after_data?: Json | null
        }
        Returns: undefined
      }
      submit_feedback: {
        Args: {
          p_source: string
          p_message: string
          p_contact_email?: string | null
          p_profile_slug?: string | null
          p_page_url?: string | null
        }
        Returns: undefined
      }
      check_limit: {
        Args: { p_company_id: string; p_limit_key: string }
        Returns: number | null
      }
    }
    Enums: Record<string, never>
  }
}

// Atajos al estilo de los que genera `supabase gen types typescript`.
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
export type FunctionArgs<T extends keyof Database['public']['Functions']> =
  Database['public']['Functions'][T]['Args']
export type FunctionReturns<T extends keyof Database['public']['Functions']> =
  Database['public']['Functions'][T]['Returns']

// Tipos de conveniencia para las 5 funciones públicas (el shape del jsonb
// que devuelven, más allá de que Postgres las tipe como Json genérico).
export interface CardForRedirect {
  destination_type: string
  destination_url: string | null
  profile_slug: string | null
  card_status: 'ACTIVE' | 'INACTIVE'
}

export interface LinkForRedirect {
  url: string
  profile_slug: string
}

export interface PublicProfileLink {
  id: string
  title: string
  url: string
  icon: string | null
  /** 'product' = tarjeta de producto (foto, precio) agregada desde REYMEN Ops. */
  type: string | null
  /** Solo productos (migración 20261021120001); ausentes antes de aplicarla. */
  subtitle?: string | null
  price_label?: string | null
  image_url?: string | null
}

export interface PublicProfile {
  display_name: string
  job_title: string | null
  company: string | null
  bio: string | null
  photo_url: string | null
  logo_url: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  website: string | null
  address: string | null
  maps_url: string | null
  instagram: string | null
  facebook: string | null
  linkedin: string | null
  tiktok: string | null
  youtube: string | null
  is_noindex: boolean
  theme: {
    slug: string | null
    config: Json
    overrides: Json
  }
  links: PublicProfileLink[]
}

export interface VCardData {
  first_name: string | null
  last_name: string | null
  company: string | null
  job_title: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  website: string | null
  address: string | null
}
