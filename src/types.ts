// Historické hodnoty schématu; po druhé migraci mají účty stejná oprávnění.
export type Role = 'ADMIN' | 'SKLADNIK';
export type OrderStatus = 'pending' | 'shipped';
export type OrderFilter = 'all' | 'pending' | 'warning' | 'overdue' | 'shipped';

export type Product = {
  code: string;
  name: string;
  variant: string;
  quantity: number;
  produced_quantity: number | null;
  packed_quantity?: number;
  prepared_quantity?: number;
};

export type Profile = {
  id: string;
  display_name: string;
  role: Role;
  is_active: boolean;
};

export type OrderView = { order_id: string; user_id: string; viewed_at: string };

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
  products: Product[];
  source_order_number: string;
  customer_code: string;
  requested_ship_date: string | null;
  source_file_name: string;
};

export type OrderInput = {
  order_number: string;
  customer?: string;
  note: string;
  created_at?: string;
  status?: OrderStatus;
  products?: Product[];
  source_order_number?: string;
  customer_code?: string;
  requested_ship_date?: string | null;
  source_file_name?: string;
};

// Tvar kompatibilní s generikem SupabaseClient. SQL migrace je zdrojem schématu.
export type Database = {
  public: {
    Tables: {
      order_views: {
        Row: OrderView;
        Insert: OrderView;
        Update: Partial<OrderView>;
        Relationships: [];
      };
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
      mark_order_viewed: { Args: { p_order_id: string }; Returns: OrderView[] };
      ship_order: { Args: { p_order_id: string }; Returns: Order[] };
      pack_product: { Args: { p_order_id: string; p_product_index: number; p_delta: number; p_expected_product: Product }; Returns: Order[] };
      prepare_product: { Args: { p_order_id: string; p_product_index: number; p_delta: number; p_expected_product: Product }; Returns: Order[] };
      current_role: { Args: Record<string, never>; Returns: Role | null };
    };
    Enums: { app_role: Role; order_status: OrderStatus };
    CompositeTypes: { [_ in never]: never };
  };
};
