export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      collections: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      captures: {
        Row: {
          id: string;
          user_id: string;
          facets: string[];
          source_url: string;
          source_origin: string;
          page_title: string;
          element_label: string;
          primary_font_family: string | null;
          text_color: string | null;
          background_color: string | null;
          screenshot_path: string | null;
          snapshot_version: number;
          snapshot: Json;
          note: string | null;
          favorite: boolean;
          collection_id: string | null;
          captured_at: string;
          created_at: string;
          updated_at: string;
          search_document: unknown;
        };
        Insert: {
          id?: string;
          user_id?: string;
          facets: string[];
          source_url: string;
          source_origin: string;
          page_title?: string;
          element_label?: string;
          primary_font_family?: string | null;
          text_color?: string | null;
          background_color?: string | null;
          screenshot_path?: string | null;
          snapshot_version?: number;
          snapshot: Json;
          note?: string | null;
          favorite?: boolean;
          collection_id?: string | null;
          captured_at?: string;
          created_at?: string;
          updated_at?: string;
          search_document?: never;
        };
        Update: {
          id?: string;
          user_id?: string;
          facets?: string[];
          source_url?: string;
          source_origin?: string;
          page_title?: string;
          element_label?: string;
          primary_font_family?: string | null;
          text_color?: string | null;
          background_color?: string | null;
          screenshot_path?: string | null;
          snapshot_version?: number;
          snapshot?: Json;
          note?: string | null;
          favorite?: boolean;
          collection_id?: string | null;
          captured_at?: string;
          created_at?: string;
          updated_at?: string;
          search_document?: never;
        };
        Relationships: [];
      };
      tags: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      capture_tags: {
        Row: {
          capture_id: string;
          tag_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          capture_id: string;
          tag_id: string;
          user_id?: string;
          created_at?: string;
        };
        Update: {
          capture_id?: string;
          tag_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

export type PublicTables = Database['public']['Tables'];
export type ProfileRow = PublicTables['profiles']['Row'];
export type CollectionRow = PublicTables['collections']['Row'];
export type CaptureRow = PublicTables['captures']['Row'];
export type CaptureInsert = PublicTables['captures']['Insert'];
export type CaptureUpdate = PublicTables['captures']['Update'];
export type TagRow = PublicTables['tags']['Row'];
export type CaptureTagRow = PublicTables['capture_tags']['Row'];
