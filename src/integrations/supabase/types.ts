export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          reason: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          reason?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          reason?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      booking_charges: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          created_by: string | null
          description: string
          extra_id: string | null
          id: string
          qty: number
          taxable: boolean
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          created_by?: string | null
          description: string
          extra_id?: string | null
          id?: string
          qty?: number
          taxable?: boolean
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          extra_id?: string | null
          id?: string
          qty?: number
          taxable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "booking_charges_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_totals"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "booking_charges_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_charges_extra_id_fkey"
            columns: ["extra_id"]
            isOneToOne: false
            referencedRelation: "extras"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_rooms: {
        Row: {
          active: boolean
          booking_id: string
          check_in: string
          check_out: string
          created_at: string
          id: string
          rate: number
          removed_at: string | null
          removed_reason: string | null
          room_id: string | null
          room_number: string | null
        }
        Insert: {
          active?: boolean
          booking_id: string
          check_in: string
          check_out: string
          created_at?: string
          id?: string
          rate?: number
          removed_at?: string | null
          removed_reason?: string | null
          room_id?: string | null
          room_number?: string | null
        }
        Update: {
          active?: boolean
          booking_id?: string
          check_in?: string
          check_out?: string
          created_at?: string
          id?: string
          rate?: number
          removed_at?: string | null
          removed_reason?: string | null
          room_id?: string | null
          room_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_rooms_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_totals"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "booking_rooms_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_rooms_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_status_history: {
        Row: {
          booking_id: string
          changed_at: string
          changed_by: string | null
          from_status: string | null
          id: string
          note: string | null
          to_status: string
        }
        Insert: {
          booking_id: string
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          note?: string | null
          to_status: string
        }
        Update: {
          booking_id?: string
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          note?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_status_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_totals"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "booking_status_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          actual_check_in: string | null
          actual_check_out: string | null
          adults: number
          balance_exception: boolean
          balance_exception_note: string | null
          booking_no: string
          check_in: string
          check_out: string
          children: number
          created_at: string
          created_by: string | null
          discount: number
          gst_bill: boolean
          guest_id: string
          id: string
          invoice_issued_at: string | null
          invoice_no: string | null
          notes: string | null
          rate: number
          room_id: string | null
          room_number: string | null
          source: string
          status: string
          tax_rate: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actual_check_in?: string | null
          actual_check_out?: string | null
          adults?: number
          balance_exception?: boolean
          balance_exception_note?: string | null
          booking_no: string
          check_in: string
          check_out: string
          children?: number
          created_at?: string
          created_by?: string | null
          discount?: number
          gst_bill?: boolean
          guest_id: string
          id?: string
          invoice_issued_at?: string | null
          invoice_no?: string | null
          notes?: string | null
          rate: number
          room_id?: string | null
          room_number?: string | null
          source?: string
          status?: string
          tax_rate?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actual_check_in?: string | null
          actual_check_out?: string | null
          adults?: number
          balance_exception?: boolean
          balance_exception_note?: string | null
          booking_no?: string
          check_in?: string
          check_out?: string
          children?: number
          created_at?: string
          created_by?: string | null
          discount?: number
          gst_bill?: boolean
          guest_id?: string
          id?: string
          invoice_issued_at?: string | null
          invoice_no?: string | null
          notes?: string | null
          rate?: number
          room_id?: string | null
          room_number?: string | null
          source?: string
          status?: string
          tax_rate?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      extras: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          price: number
          sort: number
          unit: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          price?: number
          sort?: number
          unit?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          price?: number
          sort?: number
          unit?: string
        }
        Relationships: []
      }
      guest_documents: {
        Row: {
          booking_id: string | null
          created_at: string
          doc_type: string
          guest_id: string
          id: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          doc_type?: string
          guest_id: string
          id?: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          doc_type?: string
          guest_id?: string
          id?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_documents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_totals"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "guest_documents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_documents_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_id_entries: {
        Row: {
          booking_id: string | null
          created_at: string
          created_by: string | null
          guest_id: string
          id: string
          id_number: string
          id_type: string
          person_name: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          guest_id: string
          id?: string
          id_number: string
          id_type?: string
          person_name: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          guest_id?: string
          id?: string
          id_number?: string
          id_type?: string
          person_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_id_entries_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_totals"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "guest_id_entries_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_id_entries_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      guests: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          id_number: string | null
          id_type: string | null
          mobile: string
          name: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          id_number?: string | null
          id_type?: string | null
          mobile: string
          name: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          id_number?: string | null
          id_type?: string | null
          mobile?: string
          name?: string
        }
        Relationships: []
      }
      hotel_settings: {
        Row: {
          address: string | null
          booking_prefix: string
          cancellation_policy: string | null
          check_in_time: string
          check_out_time: string
          currency: string
          default_tax_rate: number
          email: string | null
          gstin: string | null
          id: number
          id_retention_days: number
          invoice_prefix: string
          logo_url: string | null
          name: string
          next_booking_no: number
          next_invoice_no: number
          next_receipt_no: number
          payment_methods: string[]
          phone: string | null
          property_type: string
          receipt_footer: string | null
          receipt_prefix: string
          setup_complete: boolean
          show_address: boolean
          show_balance: boolean
          show_gstin: boolean
          show_logo: boolean
          tax_label: string
          terms: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          booking_prefix?: string
          cancellation_policy?: string | null
          check_in_time?: string
          check_out_time?: string
          currency?: string
          default_tax_rate?: number
          email?: string | null
          gstin?: string | null
          id?: number
          id_retention_days?: number
          invoice_prefix?: string
          logo_url?: string | null
          name?: string
          next_booking_no?: number
          next_invoice_no?: number
          next_receipt_no?: number
          payment_methods?: string[]
          phone?: string | null
          property_type?: string
          receipt_footer?: string | null
          receipt_prefix?: string
          setup_complete?: boolean
          show_address?: boolean
          show_balance?: boolean
          show_gstin?: boolean
          show_logo?: boolean
          tax_label?: string
          terms?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          booking_prefix?: string
          cancellation_policy?: string | null
          check_in_time?: string
          check_out_time?: string
          currency?: string
          default_tax_rate?: number
          email?: string | null
          gstin?: string | null
          id?: number
          id_retention_days?: number
          invoice_prefix?: string
          logo_url?: string | null
          name?: string
          next_booking_no?: number
          next_invoice_no?: number
          next_receipt_no?: number
          payment_methods?: string[]
          phone?: string | null
          property_type?: string
          receipt_footer?: string | null
          receipt_prefix?: string
          setup_complete?: boolean
          show_address?: boolean
          show_balance?: boolean
          show_gstin?: boolean
          show_logo?: boolean
          tax_label?: string
          terms?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          method: string
          note: string | null
          receipt_no: string
          received_at: string
          reference: string | null
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          method: string
          note?: string | null
          receipt_no: string
          received_at?: string
          reference?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          method?: string
          note?: string | null
          receipt_no?: string
          received_at?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_totals"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          can_backdate: boolean
          can_checkout_with_balance: boolean
          can_correct: boolean
          can_discount: boolean
          can_refund: boolean
          can_view_ids: boolean
          can_view_reports: boolean
          created_at: string
          email: string | null
          full_name: string
          id: string
        }
        Insert: {
          active?: boolean
          can_backdate?: boolean
          can_checkout_with_balance?: boolean
          can_correct?: boolean
          can_discount?: boolean
          can_refund?: boolean
          can_view_ids?: boolean
          can_view_reports?: boolean
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
        }
        Update: {
          active?: boolean
          can_backdate?: boolean
          can_checkout_with_balance?: boolean
          can_correct?: boolean
          can_discount?: boolean
          can_refund?: boolean
          can_view_ids?: boolean
          can_view_reports?: boolean
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      receipt_revisions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          payment_id: string
          reason: string | null
          revision: number
          snapshot: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          payment_id: string
          reason?: string | null
          revision: number
          snapshot: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          payment_id?: string
          reason?: string | null
          revision?: number
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "receipt_revisions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      room_blocks: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          kind: string
          reason: string | null
          room_id: string
          start_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          kind?: string
          reason?: string | null
          room_id: string
          start_date: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          kind?: string
          reason?: string | null
          room_id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_blocks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_categories: {
        Row: {
          amenities: string[]
          base_rate: number
          created_at: string
          description: string | null
          id: string
          max_guests: number
          name: string
          unit_type: string
        }
        Insert: {
          amenities?: string[]
          base_rate?: number
          created_at?: string
          description?: string | null
          id?: string
          max_guests?: number
          name: string
          unit_type?: string
        }
        Update: {
          amenities?: string[]
          base_rate?: number
          created_at?: string
          description?: string | null
          id?: string
          max_guests?: number
          name?: string
          unit_type?: string
        }
        Relationships: []
      }
      rooms: {
        Row: {
          active: boolean
          amenities: string[]
          archived_at: string | null
          category_id: string | null
          created_at: string
          description: string | null
          floor: string | null
          housekeeping: string
          id: string
          max_guests: number
          number: string
          rate: number
        }
        Insert: {
          active?: boolean
          amenities?: string[]
          archived_at?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          floor?: string | null
          housekeeping?: string
          id?: string
          max_guests?: number
          number: string
          rate?: number
        }
        Update: {
          active?: boolean
          amenities?: string[]
          archived_at?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          floor?: string | null
          housekeeping?: string
          id?: string
          max_guests?: number
          number?: string
          rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "rooms_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "room_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      booking_totals: {
        Row: {
          booking_id: string | null
          discount: number | null
          extra_charges: number | null
          nights: number | null
          paid: number | null
          refunded: number | null
          room_charges: number | null
          tax_amount: number | null
          total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_booking_extra: {
        Args: { _booking_id: string; _extra_id: string; _qty: number }
        Returns: string
      }
      available_rooms: {
        Args: { _from: string; _to: string }
        Returns: {
          active: boolean
          amenities: string[]
          archived_at: string | null
          category_id: string | null
          created_at: string
          description: string | null
          floor: string | null
          housekeeping: string
          id: string
          max_guests: number
          number: string
          rate: number
        }[]
        SetofOptions: {
          from: "*"
          to: "rooms"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      booking_balance: { Args: { _booking_id: string }; Returns: number }
      build_receipt_snapshot: { Args: { _payment_id: string }; Returns: Json }
      cancel_booking: {
        Args: { _booking_id: string; _charge: number; _reason: string }
        Returns: undefined
      }
      change_booking_status: {
        Args: { _booking_id: string; _note: string; _to: string }
        Returns: undefined
      }
      correct_receipt: {
        Args: {
          _method: string
          _note: string
          _payment_id: string
          _reason: string
          _reference: string
        }
        Returns: undefined
      }
      create_booking: {
        Args: {
          _adults: number
          _advance: number
          _advance_method: string
          _check_in: string
          _check_in_now: boolean
          _check_out: string
          _children: number
          _discount: number
          _guest_email: string
          _guest_id: string
          _guest_mobile: string
          _guest_name: string
          _notes: string
          _rate: number
          _room_id: string
          _source: string
          _tax_rate: number
        }
        Returns: string
      }
      create_booking_multi: {
        Args: {
          _adults: number
          _advance: number
          _advance_method: string
          _check_in: string
          _check_out: string
          _children: number
          _discount: number
          _gst_bill: boolean
          _guest_email: string
          _guest_id: string
          _guest_mobile: string
          _guest_name: string
          _notes: string
          _rooms: Json
          _source: string
        }
        Returns: string
      }
      delete_room: { Args: { _room_id: string }; Returns: string }
      expired_guest_documents: {
        Args: never
        Returns: {
          booking_id: string | null
          created_at: string
          doc_type: string
          guest_id: string
          id: string
          storage_path: string
          uploaded_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "guest_documents"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_perm: { Args: { _perm: string; _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      log_id_access: {
        Args: { _action: string; _doc_id: string }
        Returns: undefined
      }
      modify_booking: {
        Args: {
          _add_rooms: Json
          _adults: number
          _booking_id: string
          _cancel_charge: number
          _check_in: string
          _check_out: string
          _children: number
          _discount: number
          _gst_bill: boolean
          _reason: string
          _remove_rooms: string[]
        }
        Returns: undefined
      }
      owner_exists: { Args: never; Returns: boolean }
      record_payment: {
        Args: {
          _amount: number
          _booking_id: string
          _kind: string
          _method: string
          _note: string
          _reference: string
        }
        Returns: string
      }
      remove_booking_charge: {
        Args: { _charge_id: string }
        Returns: undefined
      }
      update_booking_stay: {
        Args: {
          _adults: number
          _booking_id: string
          _check_in: string
          _check_out: string
          _children: number
          _discount: number
          _rate: number
          _reason: string
          _room_id: string
          _tax_rate: number
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "owner" | "receptionist"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "receptionist"],
    },
  },
} as const
