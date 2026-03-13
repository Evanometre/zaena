// FILE: lib/types.ts
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
      products: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          sku: string | null;
          unit: string | null;
          category: string | null;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          sku?: string | null;
          unit?: string | null;
          category?: string | null;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          sku?: string | null;
          unit?: string | null;
          category?: string | null;
          is_active?: boolean;
        };
      };
      inventory: {
        Row: {
          product_id: string;
          location_id: string;
          quantity_on_hand: number;
          weighted_avg_cost: number;
          updated_at: string;
        };
      };
      sales: {
        Row: {
          id: string;
          receipt_number: string;
          organization_id: string;
          location_id: string;
          device_id: string;
          subtotal: number;
          discount: number;
          tax: number;
          total_amount: number;
          total_cogs: number;
          payment_status: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          receipt_number: string;
          organization_id: string;
          location_id: string;
          device_id: string;
          subtotal: number;
          discount?: number;
          tax?: number;
          total_amount: number;
          total_cogs: number;
          payment_status?: string;
          created_by?: string | null;
          created_at?: string;
        };
      };
    };
  };
}