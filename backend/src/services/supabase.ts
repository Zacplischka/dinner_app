// Uses the service role key. Typed by the generated Database schema
// (supabase/database.types.ts, regenerate with `npm run gen:types` — never
// hand-edit). Stores own the snake_case rows and map them to domain/wire values.

import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';
import type { Database } from '../db/database.types.js';

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
