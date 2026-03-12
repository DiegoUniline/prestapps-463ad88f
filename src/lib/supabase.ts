import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://oewuzgugsjqtznmgnfhp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ld3V6Z3Vnc2pxdHpubWduZmhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE3ODc3MjMsImV4cCI6MjA1NzM2MzcyM30.nNDDGksMJoRBqTGz8ZUe9yvYMu_vEBBFnPCh41HfJBk";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
