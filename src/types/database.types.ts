export type Json =
  | string
  | number
  | boolean
  | null
  | { readonly [key: string]: Json | undefined }
  | readonly Json[];

export type Database = {
  public: {
    Tables: {
      messages: {
        Row: {
          created_at: string;
          id: string;
          message_text: string;
          plate_number: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message_text: string;
          plate_number: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message_text?: string;
          plate_number?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      verified_plates: {
        Row: {
          created_at: string;
          id: string;
          is_verified: boolean;
          plate_number: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_verified?: boolean;
          plate_number: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_verified?: boolean;
          plate_number?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "verified_plates_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
