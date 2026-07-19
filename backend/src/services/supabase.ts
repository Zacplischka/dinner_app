// Supabase client for backend operations
// Uses service role key for admin operations.
//
// The client is typed by the generated Database schema (supabase/database.types.ts,
// regenerate with `npm run gen:types` — never hand-edit). Stores own the snake_case
// rows and map them to domain/wire values; handwritten row types no longer live here.

import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';
import type { Database, Json } from '../db/database.types.js';

export type { Database, Json };

// Create Supabase client with service role for backend operations
export const supabase = createClient<Database>(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
