// backend/src/supabaseClient.js
import dotenv from "dotenv";
dotenv.config();
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Supabase URL or Key is not defined. Please check your .env file.",
  );
} else if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "SUPABASE_SERVICE_ROLE_KEY is not set. Falling back to SUPABASE_KEY.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
