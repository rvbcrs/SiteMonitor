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
      monitors: {
        Row: {
          id: string
          url: string
          selector: string
          interval: number
          last_checked: string | null
          last_value: string | null
          created_at: string
          user_id: string
        }
        Insert: {
          id?: string
          url: string
          selector: string
          interval: number
          last_checked?: string | null
          last_value?: string | null
          created_at?: string
          user_id: string
        }
        Update: {
          id?: string
          url?: string
          selector?: string
          interval?: number
          last_checked?: string | null
          last_value?: string | null
          created_at?: string
          user_id?: string
        }
      }
      notification_preferences: {
        Row: {
          id: string
          user_id: string
          email_enabled: boolean
          email_address: string | null
          whatsapp_enabled: boolean
          whatsapp_number: string | null
          signal_enabled: boolean
          signal_number: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          email_enabled?: boolean
          email_address?: string | null
          whatsapp_enabled?: boolean
          whatsapp_number?: string | null
          signal_enabled?: boolean
          signal_number?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          email_enabled?: boolean
          email_address?: string | null
          whatsapp_enabled?: boolean
          whatsapp_number?: string | null
          signal_enabled?: boolean
          signal_number?: string | null
          created_at?: string
        }
      }
    }
  }
}