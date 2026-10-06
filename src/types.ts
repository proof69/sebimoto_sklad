// Historické hodnoty schématu; po druhé migraci mají účty stejná oprávnění.
export type Role = 'ADMIN' | 'SKLADNIK';
export type OrderStatus = 'pending' | 'shipped';
export type OrderFilter = 'all' | 'pending' | 'warning' | 'overdue' | 'shipped';

export type Profile = {
  id: string;
  display_name: string;
  role: Role;
  is_active: boolean;
};

export type Order = {
  id: string;
  order_number: string;
  customer: string;
  note: string;
  created_at: string;
  updated_at: string;
  status: OrderStatus;
  shipped_at: string | null;
  created_by: string;
  shipped_by: string | null;
};

export type OrderInput = {
  order_number: string;
  customer?: string;
  note: string;
  created_at?: string;
  status?: OrderStatus;
};

// Tvar kompatibilní s generikem SupabaseClient. SQL migrace je zdrojem schématu.
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Profile;
        Update: Partial<Profile>;
        Relationships: [];
      };
      orders: {
        Row: Order;
        Insert: OrderInput & { id?: string; created_by?: string };
        Update: Partial<OrderInput>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      ship_order: { Args: { p_order_id: string }; Returns: Order[] };
      current_role: { Args: Record<string, never>; Returns: Role | null };
    };
    Enums: { app_role: Role; order_status: OrderStatus };
    CompositeTypes: { [_ in never]: never };
  };
};
