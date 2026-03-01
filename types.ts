
export enum View {
  DASHBOARD = 'DASHBOARD',
  REMINDERS = 'REMINDERS',
  HABITS = 'HABITS',
  PASSWORDS = 'PASSWORDS',
  WATCH_LATER = 'WATCH_LATER',
  FINANCE = 'FINANCE',
  NOTES = 'NOTES',
  SETTINGS = 'SETTINGS'
}

export enum ReminderCategory {
  GENERAL = 'GENERAL',
  WORK = 'WORK'
}

export interface Reminder {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  category: ReminderCategory;
  isDone: boolean;
}

export type NoteType = 'TEXT' | 'CHECKLIST';

export interface ChecklistItem {
  id: string;
  text: string;
  isCompleted: boolean;
}

export interface Note {
  id: string;
  title: string;
  content: string; // Used for text notes
  items?: ChecklistItem[]; // Used for checklist notes
  type: NoteType;
  color: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PasswordHistoryItem {
  date: string;
  passwordString: string;
}

export interface PasswordEntry {
  id: string;
  service: string;
  username: string;
  passwordString: string;
  notes: string;
  history: PasswordHistoryItem[];
}

export interface MediaItem {
  id: string;
  title: string;
  thumbnail?: string;
  link?: string;
  isWatched: boolean;
  dateAdded: string;
}

export enum AccountType {
  CASH = 'CASH',
  BANK = 'BANK',
  WALLET = 'WALLET',
  CREDIT = 'CREDIT'
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  openingBalance: number;
  totalInflow: number;
  totalOutflow: number;
}

export interface Friend {
  id: string;
  name: string;
  netBalance: number; // Positive = they owe you, Negative = you owe them
}

export type TransactionType = 'EXPENSE' | 'TRANSFER' | 'SPLIT' | 'SETTLEMENT' | 'INCOME' | 'ADJUSTMENT' | 'SUBSCRIPTION';

export interface Transaction {
  id: string;
  amount: number;
  purpose: string;
  date: string;
  type: TransactionType;
  accountId?: string;
  toAccountId?: string; // For transfers
  friendId?: string; // For individual settlements
  isTransfer?: boolean;
  participantNames?: string[]; // Names involved in split
  payerName?: string; // Who actually paid the bill
}

export enum SubscriptionFrequency {
  MONTHLY = 'MONTHLY',
  THREE_MONTHS = '3 MONTHS',
  SIX_MONTHS = '6 MONTHS',
  YEARLY = 'YEARLY'
}

export interface Subscription {
  id: string;
  name: string;
  amount: number;
  frequency: SubscriptionFrequency;
  accountId: string;
  startDate: string;
  endDate: string; // The year/date until which it is active
  isActive: boolean;
}

export interface PurposeCategory {
  id: string;
  name: string;
  isSystem?: boolean;
}

export interface FocusSettings {
  allowedCategories: ReminderCategory[];
  allowHabitNotifications: boolean;
}
