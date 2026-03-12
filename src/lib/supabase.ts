import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://oewuzgugsjqtznmgnfhp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ld3V6Z3Vnc2pxdHpubWduZmhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNDQ1NDgsImV4cCI6MjA4ODkyMDU0OH0.sLR4Y7cBqD9bqT4KRc6CUTUxJ2y_BqoQ0l15Avk5BbU";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
