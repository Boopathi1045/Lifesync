
import { createClient } from '@supabase/supabase-js';

/**
 * OPTION 1: Hardcode your credentials here for quick setup.
 * Paste your Supabase project URL and Anon/Public Key between the quotes.
 */
const HARDCODED_URL = 'https://lalfldxikenuszrqyapm.supabase.co'; // e.g., 'https://your-project-id.supabase.co'
const HARDCODED_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhbGZsZHhpa2VudXN6cnF5YXBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwODIzNjgsImV4cCI6MjA4NDY1ODM2OH0.1F_qdvxX6r_PaHPJIOuLDLRkf3NAnNI9B4A8ol7ryMs'; // e.g., 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'

const getSupabaseConfig = () => {
  const url = (HARDCODED_URL || (window as any).process?.env?.SUPABASE_URL || localStorage.getItem('LS_SUPABASE_URL') || '').trim();
  const key = (HARDCODED_KEY || (window as any).process?.env?.SUPABASE_ANON_KEY || localStorage.getItem('LS_SUPABASE_ANON_KEY') || '').trim();
  return { url, key };
};

const { url: supabaseUrl, key: supabaseAnonKey } = getSupabaseConfig();

// Initialize client if keys are present
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const TABLES = {
  REMINDERS: 'reminders',
  PASSWORDS: 'passwords',
  MEDIA: 'media_items',
  ACCOUNTS: 'accounts',
  FRIENDS: 'friends',
  TRANSACTIONS: 'transactions',
  SUBSCRIPTIONS: 'subscriptions',
  PURPOSES: 'purposes',
  DAILY_HABITS: 'daily_habits',
  NOTES: 'notes'
};

/**
 * SQL Schema for reference:
 * 
 * CREATE TABLE reminders (id TEXT PRIMARY KEY, title TEXT, description TEXT, "dueDate" TIMESTAMP WITH TIME ZONE, category TEXT, "isDone" BOOLEAN);
 * CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT, type TEXT, balance NUMERIC, "openingBalance" NUMERIC, "totalInflow" NUMERIC, "totalOutflow" NUMERIC);
 * CREATE TABLE friends (id TEXT PRIMARY KEY, name TEXT, "netBalance" NUMERIC);
 * CREATE TABLE transactions (id TEXT PRIMARY KEY, amount NUMERIC, purpose TEXT, date DATE, type TEXT, "accountId" TEXT, "toAccountId" TEXT, "friendId" TEXT, "isTransfer" BOOLEAN, "participantNames" TEXT[], "payerName" TEXT);
 * CREATE TABLE passwords (id TEXT PRIMARY KEY, service TEXT, username TEXT, "passwordString" TEXT, notes TEXT, history JSONB);
 * CREATE TABLE media_items (id TEXT PRIMARY KEY, title TEXT, thumbnail TEXT, link TEXT, "isWatched" BOOLEAN, "dateAdded" TIMESTAMP WITH TIME ZONE);
 * CREATE TABLE subscriptions (id TEXT PRIMARY KEY, name TEXT, amount NUMERIC, frequency TEXT, "accountId" TEXT, "startDate" DATE, "endDate" TEXT, "isActive" BOOLEAN);
 * CREATE TABLE purposes (id TEXT PRIMARY KEY, name TEXT, "isSystem" BOOLEAN);
 * CREATE TABLE daily_habits (date DATE PRIMARY KEY, water_intake INTEGER DEFAULT 0, wake_up_time TEXT, sleep_time TEXT, naps JSONB);
 * CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT, content TEXT, items JSONB, type TEXT, color TEXT, "isPinned" BOOLEAN, "createdAt" TIMESTAMP WITH TIME ZONE, "updatedAt" TIMESTAMP WITH TIME ZONE);
 * 
 * IMPORTANT: If you get RLS errors (42501), run this in Supabase SQL Editor:
 * ALTER TABLE reminders DISABLE ROW LEVEL SECURITY;
 * ALTER TABLE passwords DISABLE ROW LEVEL SECURITY;
 * ALTER TABLE media_items DISABLE ROW LEVEL SECURITY;
 * ALTER TABLE accounts DISABLE ROW LEVEL SECURITY;
 * ALTER TABLE friends DISABLE ROW LEVEL SECURITY;
 * ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
 * ALTER TABLE subscriptions DISABLE ROW LEVEL SECURITY;
 * ALTER TABLE purposes DISABLE ROW LEVEL SECURITY;
 * ALTER TABLE daily_habits DISABLE ROW LEVEL SECURITY;
 * ALTER TABLE notes DISABLE ROW LEVEL SECURITY;
 */
