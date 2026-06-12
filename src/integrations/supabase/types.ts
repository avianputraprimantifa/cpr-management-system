export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      email_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          metadata: Json
          recipient_email: string
          recipient_user_id: string | null
          related_bill_id: string | null
          resend_id: string | null
          status: string
          subject: string
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          metadata?: Json
          recipient_email: string
          recipient_user_id?: string | null
          related_bill_id?: string | null
          resend_id?: string | null
          status: string
          subject: string
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          recipient_email?: string
          recipient_user_id?: string | null
          related_bill_id?: string | null
          resend_id?: string | null
          status?: string
          subject?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      environment_items: {
        Row: {
          category: Database["public"]["Enums"]["env_category"]
          created_at: string
          id: string
          item_date: string
          notes: string | null
          photo_path: string | null
          status: Database["public"]["Enums"]["env_status"]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["env_category"]
          created_at?: string
          id?: string
          item_date?: string
          notes?: string | null
          photo_path?: string | null
          status: Database["public"]["Enums"]["env_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["env_category"]
          created_at?: string
          id?: string
          item_date?: string
          notes?: string | null
          photo_path?: string | null
          status?: Database["public"]["Enums"]["env_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      guard_shifts: {
        Row: {
          created_at: string
          guard_user_id: string
          id: string
          notes: string | null
          shift_date: string
          shift_type: Database["public"]["Enums"]["shift_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          guard_user_id: string
          id?: string
          notes?: string | null
          shift_date: string
          shift_type: Database["public"]["Enums"]["shift_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          guard_user_id?: string
          id?: string
          notes?: string | null
          shift_date?: string
          shift_type?: Database["public"]["Enums"]["shift_type"]
          updated_at?: string
        }
        Relationships: []
      }
      ipl_bills: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          name: string
          paid_at: string | null
          payment_submitted_at: string | null
          period: string
          receipt_path: string | null
          receipt_thumbnail_path: string | null
          resident_user_id: string
          status: Database["public"]["Enums"]["bill_status"]
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          due_date: string
          id?: string
          name: string
          paid_at?: string | null
          payment_submitted_at?: string | null
          period: string
          receipt_path?: string | null
          receipt_thumbnail_path?: string | null
          resident_user_id: string
          status?: Database["public"]["Enums"]["bill_status"]
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          name?: string
          paid_at?: string | null
          payment_submitted_at?: string | null
          period?: string
          receipt_path?: string | null
          receipt_thumbnail_path?: string | null
          resident_user_id?: string
          status?: Database["public"]["Enums"]["bill_status"]
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      ipl_settings: {
        Row: {
          bank_account_name: string
          bank_account_number: string
          bank_name: string
          default_amount: number
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bank_account_name?: string
          bank_account_number?: string
          bank_name?: string
          default_amount?: number
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bank_account_name?: string
          bank_account_number?: string
          bank_name?: string
          default_amount?: number
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          read: boolean
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          block_unit: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          default_password_kept_at: string | null
          must_reset_password: boolean
          password_setup_completed_at: string | null
          phone: string | null
          status: Database["public"]["Enums"]["profile_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          block_unit?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          default_password_kept_at?: string | null
          must_reset_password?: boolean
          password_setup_completed_at?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          block_unit?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          default_password_kept_at?: string | null
          must_reset_password?: boolean
          password_setup_completed_at?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "pengurus" | "penghuni" | "satpam"
      bill_status: "belum_dibayar" | "dalam_pengecekan" | "lunas"
      env_category: "sampah" | "kolam_renang" | "lainnya"
      env_status: "baik" | "perlu_perhatian" | "bermasalah"
      profile_status: "aktif" | "nonaktif"
      shift_type: "pagi" | "malam"
    }
    CompositeTypes: { [_ in never]: never }
  }
}
