/**
 * Supabase Client Initialization
 */

const SUPABASE_URL = 'https://egpvxwntqpwaajvgybdx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncHZ4d250cXB3YWFqdmd5YmR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0OTEwMjQsImV4cCI6MjA4MTA2NzAyNH0.TXK7iID_bTSvG-_UKlPTvVvOLQ7xYGX95CwlvLM0svQ';

let _supabase = null;

if (window.supabase) {
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    console.error("Supabase library not loaded. Ensure CDN script is in <head>.");
}

window.supabaseClient = _supabase;
