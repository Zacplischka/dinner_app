// Type-only view of the committed Supabase schema types.
//
// The authority is supabase/database.types.ts (regenerate with `npm run gen:types`,
// never hand-edit). That file lives outside the backend's rootDir, so importing it
// directly would drag a non-declaration source into the emit. This declaration shim
// re-exports it type-only, which TypeScript resolves without a rootDir violation.
export type { Database, Json } from '../../../supabase/database.types.js';
