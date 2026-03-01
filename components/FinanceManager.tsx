
import React, { useState, useMemo } from 'react';
import { Account, Friend, AccountType, Transaction, PurposeCategory, Subscription, SubscriptionFrequency, TransactionType } from '../types';
import { TABLES } from '../lib/supabase';

interface FinanceManagerProps {
  accounts: Account[];
  setAccounts: React.Dispatch<React.SetStateAction<Account[]>>;
  friends: Friend[];
  setFriends: React.Dispatch<React.SetStateAction<Friend[]>>;
  transactions: Transaction[];
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  purposes: PurposeCategory[];
  setPurposes: React.Dispatch<React.SetStateAction<PurposeCategory[]>>;
  subscriptions: Subscription[];
  setSubscriptions: React.Dispatch<React.SetStateAction<Subscription[]>>;
  removeFromDB: (table: string, id: string) => Promise<void>;
  saveToDB: (table: string, data: any) => Promise<void>;
}

const FinanceManager: React.FC<FinanceManagerProps> = ({
  accounts, setAccounts,
  friends, setFriends,
  transactions, setTransactions,
  purposes, setPurposes,
  subscriptions, setSubscriptions,
  removeFromDB,
  saveToDB
}) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'ACCOUNTS' | 'TRANSACTIONS' | 'SPLITS' | 'SUBS'>('OVERVIEW');
  const [modal, setModal] = useState<'ADD_ACCOUNT' | 'EDIT_ACCOUNT' | 'ADD_EXPENSE' | 'ADD_TRANSFER' | 'SPLIT_BILL' | 'ADD_FRIEND' | 'CONFIRM_DELETE' | 'CONFIRM_DELETE_TX' | 'CONFIRM_DELETE_SUB' | 'CONFIRM_DELETE_FRIEND' | 'CONFIRM_UPDATE_ACC' | 'ADD_SUB' | 'SETTLE_FRIEND' | 'MANAGE_PURPOSES' | 'ADD_INCOME' | null>(null);

  // Form States
  const [accForm, setAccForm] = useState({ id: '', name: '', type: AccountType.BANK, balance: 0 });
  const [trfForm, setTrfForm] = useState({ amount: 0, fromId: '', toId: '', date: new Date().toISOString().split('T')[0] });
  const [subForm, setSubForm] = useState({ name: '', amount: 0, frequency: SubscriptionFrequency.MONTHLY, accountId: '', endDate: '2026' });
  const [splitForm, setSplitForm] = useState({ amount: 0, purposeId: '', payerType: 'ME' as 'ME' | 'FRIEND', accountId: '', payerFriendId: '' });
  const [expForm, setExpForm] = useState({ amount: 0, purposeId: '', accountId: '', date: new Date().toISOString().split('T')[0], notes: '' });
  const [incForm, setIncForm] = useState({ amount: 0, accountId: '', notes: '', date: new Date().toISOString().split('T')[0] });
  const [purposeInput, setPurposeInput] = useState({ id: '', name: '' });

  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [newFriendName, setNewFriendName] = useState('');
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);
  const [settleFriendId, setSettleFriendId] = useState<string | null>(null);
  const [settleAccountId, setSettleAccountId] = useState<string>('');
  const [filterAccountId, setFilterAccountId] = useState<string>('ALL');

  const netWorth = accounts.reduce((acc, curr) => acc + Number(curr.balance), 0);
  const totalReceivable = friends.filter(f => f.netBalance > 0).reduce((acc, curr) => acc + curr.netBalance, 0);
  const totalPayable = Math.abs(friends.filter(f => f.netBalance < 0).reduce((acc, curr) => acc + curr.netBalance, 0));

  // --- ACCOUNT ACTIONS ---
  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const newAcc: Account = {
      id: Math.random().toString(36).substr(2, 9),
      name: accForm.name,
      type: accForm.type,
      balance: accForm.balance,
      openingBalance: accForm.balance,
      totalInflow: accForm.balance,
      totalOutflow: 0
    };

    const previous = [...accounts];
    setAccounts(prev => [...prev, newAcc]);

    try {
      await saveToDB(TABLES.ACCOUNTS, newAcc);
      setModal(null);
      setAccForm({ id: '', name: '', type: AccountType.BANK, balance: 0 });
    } catch (err) {
      setAccounts(previous);
      alert('Failed to save account.');
    }
  };

  const startEditAccount = (acc: Account) => {
    setAccForm({ id: acc.id, name: acc.name, type: acc.type, balance: acc.balance });
    setModal('EDIT_ACCOUNT');
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setModal('CONFIRM_UPDATE_ACC');
  };

  const executeUpdateAccount = async () => {
    const oldAccount = accounts.find(a => a.id === accForm.id);
    if (!oldAccount) return;

    const balanceDiff = accForm.balance - oldAccount.balance;
    const previousAccounts = [...accounts];
    const previousTransactions = [...transactions];

    const updatedAccount = { ...oldAccount, name: accForm.name, type: accForm.type, balance: accForm.balance };
    setAccounts(prev => prev.map(a => a.id === accForm.id ? updatedAccount : a));

    let newTx: Transaction | null = null;
    if (balanceDiff !== 0) {
      const type = balanceDiff > 0 ? 'INCOME' : 'EXPENSE';
      const absAmount = Math.abs(balanceDiff);

      newTx = {
        id: Math.random().toString(36).substr(2, 9),
        amount: absAmount,
        purpose: `Manual Balance Adjustment for ${accForm.name}`,
        date: new Date().toISOString().split('T')[0],
        type: type,
        accountId: accForm.id,
        payerName: 'System'
      };
      setTransactions(prev => [newTx!, ...prev]);
    }

    try {
      await saveToDB(TABLES.ACCOUNTS, updatedAccount);
      if (newTx) await saveToDB(TABLES.TRANSACTIONS, newTx);
      setModal(null);
    } catch (err) {
      setAccounts(previousAccounts);
      setTransactions(previousTransactions);
      alert('Failed to update account.');
    }
  };

  const handleDeleteAccount = async () => {
    if (!pendingTargetId) return;
    const previous = [...accounts];
    try {
      setAccounts(prev => prev.filter(a => a.id !== pendingTargetId));
      await removeFromDB(TABLES.ACCOUNTS, pendingTargetId);
      setModal(null);
      setPendingTargetId(null);
    } catch (err) {
      setAccounts(previous);
      alert('Failed to delete account.');
    }
  };

  // --- INCOME ACTIONS ---
  const handleAddIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incForm.accountId || incForm.amount <= 0) return;

    const account = accounts.find(a => a.id === incForm.accountId);
    if (!account) return;

    const previousAccounts = [...accounts];
    const previousTransactions = [...transactions];

    const updatedAccount = {
      ...account,
      balance: account.balance + incForm.amount,
      totalInflow: account.totalInflow + incForm.amount
    };

    const newTx: Transaction = {
      id: Math.random().toString(36).substr(2, 9),
      amount: incForm.amount,
      purpose: incForm.notes || 'Income',
      date: incForm.date,
      type: 'INCOME',
      accountId: incForm.accountId,
      payerName: 'Self'
    };

    setAccounts(prev => prev.map(a => a.id === incForm.accountId ? updatedAccount : a));
    setTransactions(prev => [newTx, ...prev]);

    try {
      await saveToDB(TABLES.ACCOUNTS, updatedAccount);
      await saveToDB(TABLES.TRANSACTIONS, newTx);
      setModal(null);
      setIncForm({ amount: 0, accountId: '', notes: '', date: new Date().toISOString().split('T')[0] });
    } catch (err) {
      setAccounts(previousAccounts);
      setTransactions(previousTransactions);
      alert('Failed to record income.');
    }
  };

  // --- EXPENSE ACTIONS ---
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expForm.accountId || !expForm.purposeId || expForm.amount <= 0) return;

    const account = accounts.find(a => a.id === expForm.accountId);
    if (!account) return;

    const purposeName = purposes.find(p => p.id === expForm.purposeId)?.name || 'General Expense';

    const previousAccounts = [...accounts];
    const previousTransactions = [...transactions];

    const updatedAccount = {
      ...account,
      balance: account.balance - expForm.amount,
      totalOutflow: account.totalOutflow + expForm.amount
    };

    const newTx: Transaction = {
      id: Math.random().toString(36).substr(2, 9),
      amount: expForm.amount,
      purpose: purposeName + (expForm.notes ? `: ${expForm.notes}` : ''),
      date: expForm.date,
      type: 'EXPENSE',
      accountId: expForm.accountId,
      payerName: 'Me'
    };

    setAccounts(prev => prev.map(a => a.id === expForm.accountId ? updatedAccount : a));
    setTransactions(prev => [newTx, ...prev]);

    try {
      await saveToDB(TABLES.ACCOUNTS, updatedAccount);
      await saveToDB(TABLES.TRANSACTIONS, newTx);
      setModal(null);
      setExpForm({ amount: 0, purposeId: '', accountId: '', date: new Date().toISOString().split('T')[0], notes: '' });
    } catch (err) {
      setAccounts(previousAccounts);
      setTransactions(previousTransactions);
      alert('Failed to record expense.');
    }
  };

  // --- TRANSFER ACTIONS ---
  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const { amount, fromId, toId, date } = trfForm;
    if (fromId === toId || amount <= 0) return;

    const fromAcc = accounts.find(a => a.id === fromId);
    const toAcc = accounts.find(a => a.id === toId);
    if (!fromAcc || !toAcc) return;

    const previousAccounts = [...accounts];
    const previousTransactions = [...transactions];

    const updatedFrom = { ...fromAcc, balance: fromAcc.balance - amount };
    const updatedTo = { ...toAcc, balance: toAcc.balance + amount };

    const newTx: Transaction = {
      id: Math.random().toString(36).substr(2, 9),
      amount,
      purpose: `Transfer: ${fromAcc.name} ➔ ${toAcc.name}`,
      date,
      type: 'TRANSFER',
      accountId: fromId,
      toAccountId: toId,
      isTransfer: true
    };

    setAccounts(prev => prev.map(a => {
      if (a.id === fromId) return updatedFrom;
      if (a.id === toId) return updatedTo;
      return a;
    }));
    setTransactions(prev => [newTx, ...prev]);

    try {
      await saveToDB(TABLES.ACCOUNTS, [updatedFrom, updatedTo]);
      await saveToDB(TABLES.TRANSACTIONS, newTx);
      setModal(null);
      setTrfForm({ amount: 0, fromId: '', toId: '', date: new Date().toISOString().split('T')[0] });
    } catch (err) {
      setAccounts(previousAccounts);
      setTransactions(previousTransactions);
      alert('Failed to execute transfer.');
    }
  };

  // --- SUBSCRIPTION ACTIONS ---
  const handleAddSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subForm.accountId || subForm.amount <= 0) return;

    const account = accounts.find(a => a.id === subForm.accountId);
    if (!account) return;

    const previousAccounts = [...accounts];
    const previousSubscriptions = [...subscriptions];
    const previousTransactions = [...transactions];

    const updatedAccount = { ...account, balance: account.balance - subForm.amount };
    const newSub: Subscription = {
      id: Math.random().toString(36).substr(2, 9),
      ...subForm,
      startDate: new Date().toISOString().split('T')[0],
      isActive: true
    };
    const newTx: Transaction = {
      id: Math.random().toString(36).substr(2, 9),
      amount: subForm.amount,
      purpose: `Subscription: ${subForm.name}`,
      date: new Date().toISOString().split('T')[0],
      type: 'SUBSCRIPTION',
      accountId: subForm.accountId,
      payerName: 'Me'
    };

    setAccounts(prev => prev.map(a => a.id === subForm.accountId ? updatedAccount : a));
    setSubscriptions(prev => [...prev, newSub]);
    setTransactions(prev => [newTx, ...prev]);

    try {
      await saveToDB(TABLES.ACCOUNTS, updatedAccount);
      await saveToDB(TABLES.SUBSCRIPTIONS, newSub);
      await saveToDB(TABLES.TRANSACTIONS, newTx);
      setModal(null);
    } catch (err) {
      setAccounts(previousAccounts);
      setSubscriptions(previousSubscriptions);
      setTransactions(previousTransactions);
      alert('Failed to setup subscription.');
    }
  };

  // --- SPLIT & SETTLEMENT ---
  const handleSplitBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFriends.length === 0) return;
    const totalMembers = selectedFriends.length + 1;
    const share = splitForm.amount / totalMembers;
    const participantNames = [...friends.filter(f => selectedFriends.includes(f.id)).map(f => f.name)];
    const payerName = splitForm.payerType === 'ME' ? 'Me' : (friends.find(f => f.id === splitForm.payerFriendId)?.name || 'Friend');
    const purposeName = purposes.find(p => p.id === splitForm.purposeId)?.name || 'Bill';

    const previousAccounts = [...accounts];
    const previousFriends = [...friends];
    const previousTransactions = [...transactions];

    let updatedAccount: Account | null = null;
    const updatedFriends: Friend[] = [];

    if (splitForm.payerType === 'ME') {
      const account = accounts.find(a => a.id === splitForm.accountId);
      if (account) {
        updatedAccount = { ...account, balance: account.balance - splitForm.amount };
        setAccounts(prev => prev.map(a => a.id === splitForm.accountId ? updatedAccount! : a));
      }
      friends.forEach(f => {
        if (selectedFriends.includes(f.id)) {
          updatedFriends.push({ ...f, netBalance: f.netBalance + share });
        }
      });
    } else {
      const payerFriend = friends.find(f => f.id === splitForm.payerFriendId);
      if (payerFriend) {
        updatedFriends.push({ ...payerFriend, netBalance: payerFriend.netBalance - (splitForm.amount - share) });
      }
    }

    if (updatedFriends.length > 0) {
      setFriends(prev => prev.map(f => {
        const updated = updatedFriends.find(uf => uf.id === f.id);
        return updated || f;
      }));
    }

    const newTx: Transaction = {
      id: Math.random().toString(36).substr(2, 9),
      amount: splitForm.amount,
      purpose: `Split: ${purposeName} (${totalMembers} members, ₹${share.toFixed(2)} each)`,
      date: new Date().toISOString().split('T')[0],
      type: 'SPLIT',
      accountId: splitForm.accountId,
      payerName,
      participantNames
    };
    setTransactions(prev => [newTx, ...prev]);

    try {
      if (updatedAccount) await saveToDB(TABLES.ACCOUNTS, updatedAccount);
      if (updatedFriends.length > 0) await saveToDB(TABLES.FRIENDS, updatedFriends);
      await saveToDB(TABLES.TRANSACTIONS, newTx);
      setModal(null);
      setSelectedFriends([]);
    } catch (err) {
      setAccounts(previousAccounts);
      setFriends(previousFriends);
      setTransactions(previousTransactions);
      alert('Failed to execute split.');
    }
  };

  const handleSettlementAction = async (e: React.FormEvent) => {
    e.preventDefault();
    const friend = friends.find(f => f.id === settleFriendId);
    const account = accounts.find(a => a.id === settleAccountId);
    if (!friend || !account) return;

    const amount = Math.abs(friend.netBalance);
    const previousAccounts = [...accounts];
    const previousFriends = [...friends];
    const previousTransactions = [...transactions];

    const updatedAccount = {
      ...account,
      balance: friend.netBalance > 0 ? account.balance + amount : account.balance - amount
    };
    const updatedFriend = { ...friend, netBalance: 0 };

    const newTx: Transaction = {
      id: Math.random().toString(36).substr(2, 9),
      amount,
      purpose: `Settlement: ${friend.name}`,
      date: new Date().toISOString().split('T')[0],
      type: 'SETTLEMENT',
      accountId: settleAccountId,
      payerName: friend.netBalance > 0 ? friend.name : 'Me'
    };

    setAccounts(prev => prev.map(a => a.id === settleAccountId ? updatedAccount : a));
    setFriends(prev => prev.map(f => f.id === settleFriendId ? updatedFriend : f));
    setTransactions(prev => [newTx, ...prev]);

    try {
      await saveToDB(TABLES.ACCOUNTS, updatedAccount);
      await saveToDB(TABLES.FRIENDS, updatedFriend);
      await saveToDB(TABLES.TRANSACTIONS, newTx);
      setModal(null);
    } catch (err) {
      setAccounts(previousAccounts);
      setFriends(previousFriends);
      setTransactions(previousTransactions);
      alert('Failed to finalize settlement.');
    }
  };

  // --- PURPOSE MANAGEMENT ---
  const handleAddPurpose = async () => {
    if (!purposeInput.name.trim()) return;
    const newP = { id: Math.random().toString(36).substr(2, 9), name: purposeInput.name, isSystem: false };
    const previous = [...purposes];
    setPurposes(prev => [...prev, newP]);
    try {
      await saveToDB(TABLES.PURPOSES, newP);
      setPurposeInput({ id: '', name: '' });
    } catch (err) {
      setPurposes(previous);
      alert('Failed to add category.');
    }
  };

  const deletePurpose = async (id: string) => {
    const previous = [...purposes];
    try {
      setPurposes(prev => prev.filter(p => p.id !== id));
      await removeFromDB(TABLES.PURPOSES, id);
    } catch (err) {
      setPurposes(previous);
      alert('Failed to delete category.');
    }
  };

  const deleteTransaction = (id: string) => {
    setPendingTargetId(id);
    setModal('CONFIRM_DELETE_TX');
  };

  const executeDeleteTransaction = async () => {
    if (!pendingTargetId) return;
    const id = pendingTargetId;
    const previous = [...transactions];
    try {
      setTransactions(prev => prev.filter(t => t.id !== id));
      await removeFromDB(TABLES.TRANSACTIONS, id);
      setModal(null);
      setPendingTargetId(null);
    } catch (err) {
      setTransactions(previous);
      alert('Failed to delete transaction.');
    }
  };

  const deleteSubscription = (id: string) => {
    setPendingTargetId(id);
    setModal('CONFIRM_DELETE_SUB');
  };

  const executeDeleteSubscription = async () => {
    if (!pendingTargetId) return;
    const id = pendingTargetId;
    const previous = [...subscriptions];
    try {
      setSubscriptions(prev => prev.filter(s => s.id !== id));
      await removeFromDB(TABLES.SUBSCRIPTIONS, id);
      setModal(null);
      setPendingTargetId(null);
    } catch (err) {
      setSubscriptions(previous);
      alert('Failed to delete subscription.');
    }
  };

  const deleteFriend = (id: string) => {
    const friend = friends.find(f => f.id === id);
    if (friend && friend.netBalance !== 0) {
      alert('Cannot delete a friend with a non-zero balance. Settle first.');
      return;
    }
    setPendingTargetId(id);
    setModal('CONFIRM_DELETE_FRIEND');
  };

  const executeDeleteFriend = async () => {
    if (!pendingTargetId) return;
    const id = pendingTargetId;
    const previous = [...friends];
    try {
      setFriends(prev => prev.filter(f => f.id !== id));
      await removeFromDB(TABLES.FRIENDS, id);
      setModal(null);
      setPendingTargetId(null);
    } catch (err) {
      setFriends(previous);
      alert('Failed to delete contact.');
    }
  };

  const splitTransactions = useMemo(() => transactions.filter(t => t.type === 'SPLIT'), [transactions]);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-10 pb-32">
      <header className="flex flex-col lg:flex-row lg:items-start justify-between gap-8">
        <div className="text-white">
          <h2 className="text-4xl font-black pb-1 leading-tight">Finance<br />Manager</h2>
          <p className="text-white/70 mt-3 max-w-xs">Manage your wealth with simplicity and ease.</p>
        </div>
        <div className="flex flex-col items-end gap-6">
          <div className="flex bg-white/10 p-1.5 rounded-full w-full md:w-fit overflow-x-auto relative z-10">
            {(['OVERVIEW', 'ACCOUNTS', 'TRANSACTIONS', 'SPLITS', 'SUBS'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`whitespace-nowrap flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-[10px] tracking-widest transition-all ${activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-white/80 hover:text-white hover:bg-white/10'}`}>
                {tab === 'OVERVIEW' && <span className="material-symbols-rounded text-base">dashboard</span>}
                {tab === 'ACCOUNTS' && <span className="material-symbols-rounded text-base">account_balance_wallet</span>}
                {tab === 'TRANSACTIONS' && <span className="material-symbols-rounded text-base">history</span>}
                {tab === 'SPLITS' && <span className="material-symbols-rounded text-base">call_split</span>}
                {tab === 'SUBS' && <span className="material-symbols-rounded text-base">event_repeat</span>}
                {tab}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap justify-end gap-3 mt-4">
            {activeTab === 'ACCOUNTS' && (
              <>
                <button onClick={() => setModal('ADD_EXPENSE')} className="bg-white/10 text-white px-5 py-3 rounded-2xl font-black text-[10px] tracking-widest hover:bg-white/20 transition-all">ADD EXPENSE</button>
                <button onClick={() => setModal('ADD_INCOME')} className="bg-white text-slate-900 px-5 py-3 rounded-2xl font-black text-[10px] tracking-widest hover:-translate-y-0.5 transition-transform shadow-lg shadow-black/10">ADD INCOME</button>
                <button onClick={() => setModal('ADD_TRANSFER')} className="bg-white/10 text-white px-5 py-3 rounded-2xl font-black text-[10px] tracking-widest hover:bg-white/20 transition-all">TRANSFER</button>
              </>
            )}
            {activeTab === 'SUBS' && (
              <button onClick={() => setModal('ADD_SUB')} className="bg-white/10 text-white px-5 py-3 rounded-2xl font-black text-[10px] tracking-widest hover:bg-white/20 transition-all">ADD SUB</button>
            )}
            {activeTab === 'SPLITS' && (
              <button onClick={() => setModal('SPLIT_BILL')} className="bg-white/10 text-white px-5 py-3 rounded-2xl font-black text-[10px] tracking-widest hover:bg-white/20 transition-all">SPLIT BILL</button>
            )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-10">
        {activeTab === 'OVERVIEW' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-[#c1e5ed] text-slate-900 p-6 sm:p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-center gap-2 min-h-[180px]">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#5f7f8a] mb-2">Total Net Worth</p>
                <h3 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter break-all sm:break-normal">₹{netWorth.toLocaleString()}</h3>
              </div>
              <div className="bg-[#fce1cd] text-slate-900 p-6 sm:p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-center gap-2 min-h-[180px]">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#ad8771] mb-2">You Paid Other</p>
                <p className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter text-[#a86539] break-all sm:break-normal">₹{totalReceivable.toLocaleString()}</p>
              </div>
              <div className="bg-white text-slate-900 p-6 sm:p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-center gap-2 min-h-[180px]">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Other Paid Me</p>
                <p className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter text-slate-800 break-all sm:break-normal">₹{totalPayable.toLocaleString()}</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ACCOUNTS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
            {accounts.map(acc => (
              <div key={acc.id} className="glass-panel glass-panel-hover p-8 rounded-[3rem] group flex flex-col justify-between h-full min-h-[220px]">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500">{acc.type}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEditAccount(acc)} className="p-2 hover:bg-primary/10 rounded-lg text-slate-400 hover:text-primary">✎ Edit</button>
                      <button onClick={() => { setPendingTargetId(acc.id); setModal('CONFIRM_DELETE'); }} className="p-2 hover:bg-rose-500/10 rounded-lg text-slate-400 hover:text-rose-500">✕</button>
                    </div>
                  </div>
                  <h4 className="text-2xl font-black">{acc.name}</h4>
                  <p className="text-5xl font-black mt-6 tracking-tighter">₹{acc.balance.toLocaleString()}</p>
                </div>
                <div className="mt-8 flex gap-4 text-[9px] font-black uppercase tracking-widest text-slate-400">
                  <span className="text-emerald-500">In: ₹{acc.totalInflow.toLocaleString()}</span>
                  <span className="text-rose-500">Out: ₹{acc.totalOutflow.toLocaleString()}</span>
                </div>
              </div>
            ))}
            <button onClick={() => setModal('ADD_ACCOUNT')} className="glass-card border-dashed border-2 p-10 flex flex-col items-center justify-center text-slate-400 hover:border-primary/50 hover:bg-primary/5 transition-all group min-h-[220px]">
              <span className="text-4xl mb-2 group-hover:scale-125 transition-transform text-slate-300 group-hover:text-primary">+</span>
              <p className="font-black text-xs uppercase tracking-widest group-hover:text-primary transition-colors">New Account</p>
            </button>
          </div>
        )}

        {activeTab === 'TRANSACTIONS' && (
          <div className="glass-panel rounded-[4rem] p-12 space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h3 className="text-3xl font-black tracking-tight">Financial Ledger</h3>
              <select
                value={filterAccountId}
                onChange={(e) => setFilterAccountId(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white px-4 py-2 rounded-xl font-bold text-sm border-none focus:ring-2 focus:ring-primary outline-none"
              >
                <option value="ALL">All Accounts</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-4">
              {transactions.filter(tx => filterAccountId === 'ALL' ? true : tx.accountId === filterAccountId || tx.toAccountId === filterAccountId).map(tx => (
                <div key={tx.id} className="flex items-center justify-between p-4 sm:p-6 glass-card hover:border-primary/20 transition-all border border-transparent group gap-2 sm:gap-4">
                  <div className="flex items-center gap-3 sm:gap-6 flex-1 min-w-0 pr-2">
                    <div className="size-10 sm:size-14 rounded-2xl glass-card flex items-center justify-center text-xl sm:text-2xl shadow-sm shrink-0">
                      {tx.type === 'TRANSFER' ? '🔄' : tx.type === 'SPLIT' ? '👥' : tx.type === 'SETTLEMENT' ? '🤝' : tx.type === 'INCOME' ? '📈' : '💸'}
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-sm sm:text-lg truncate">{tx.purpose}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">{tx.date}</span>
                        {tx.payerName && (
                          <span className="text-[10px] font-black text-primary uppercase tracking-widest shrink-0">Payer: {tx.payerName}</span>
                        )}
                        {tx.type === 'SPLIT' && tx.participantNames && (
                          <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest shrink-0">{tx.participantNames.length + 1} People</span>
                        )}
                        {filterAccountId === 'ALL' && (
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest shrink-0 ml-auto bg-slate-800/50 px-2 py-0.5 rounded-full">
                            {accounts.find(a => a.id === tx.accountId)?.name || 'Unknown Account'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 sm:gap-6 shrink-0">
                    <p className={`text-lg sm:text-2xl font-black whitespace-nowrap ${tx.type === 'INCOME' ? 'text-emerald-500' : tx.type === 'TRANSFER' ? 'text-slate-400' : 'text-rose-500'}`}>
                      {tx.type === 'INCOME' ? '+' : tx.type === 'TRANSFER' ? '⇄' : '-'}₹{tx.amount.toLocaleString()}
                    </p>
                    <button onClick={() => deleteTransaction(tx.id)} className="opacity-100 sm:opacity-0 group-hover:opacity-100 p-1 sm:p-2 text-slate-400 hover:text-rose-500 transition-all">✕</button>
                  </div>
                </div>
              ))}
              {transactions.filter(tx => filterAccountId === 'ALL' ? true : tx.accountId === filterAccountId || tx.toAccountId === filterAccountId).length === 0 && <p className="text-center py-20 text-slate-400 font-bold uppercase tracking-widest">No activity found.</p>}
            </div>
          </div>
        )}

        {activeTab === 'SPLITS' && (
          <div className="space-y-12 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {friends.map(friend => (
                <div key={friend.id} className="glass-panel glass-panel-hover p-8 rounded-[3rem] flex items-center justify-between group">
                  <div className="flex items-center gap-5">
                    <div className="size-16 rounded-[1.5rem] glass-card flex items-center justify-center text-2xl relative">
                      👤
                      <button onClick={() => deleteFriend(friend.id)} className="absolute -top-2 -right-2 size-6 bg-rose-500 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">✕</button>
                    </div>
                    <div>
                      <h4 className="text-xl font-black">{friend.name}</h4>
                      <p className={`text-[10px] font-black uppercase tracking-widest ${friend.netBalance > 0 ? 'text-emerald-500' : friend.netBalance < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                        {friend.netBalance > 0 ? `You paid other` : friend.netBalance < 0 ? `Other paid me` : 'Settled'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-black ${friend.netBalance > 0 ? 'text-emerald-500' : friend.netBalance < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                      ₹{Math.abs(friend.netBalance).toFixed(2)}
                    </p>
                    {friend.netBalance !== 0 && (
                      <button onClick={() => { setSettleFriendId(friend.id); setModal('SETTLE_FRIEND'); }} className="text-[10px] font-black text-primary hover:underline uppercase tracking-widest mt-1">Settle</button>
                    )}
                  </div>
                </div>
              ))}
              <button onClick={() => setModal('ADD_FRIEND')} className="glass-card border-dashed border-2 p-10 flex flex-col items-center justify-center text-slate-400 hover:border-primary/50 hover:bg-primary/5 transition-all group">
                <span className="text-4xl mb-1 group-hover:scale-125 transition-transform text-slate-300 group-hover:text-primary">+</span>
                <p className="font-black text-sm uppercase tracking-widest group-hover:text-primary transition-colors">Add Friend</p>
              </button>
            </div>

            {/* Split Activity History */}
            <div className="glass-panel rounded-[3rem] p-10">
              <h3 className="text-2xl font-black tracking-tight mb-8">Split Activity History</h3>
              <div className="space-y-4">
                {splitTransactions.map(st => {
                  const memberCount = (st.participantNames?.length || 0) + 1;
                  const splitPerPerson = st.amount / memberCount;
                  return (
                    <div key={st.id} className="flex items-center justify-between p-6 glass-card hover:border-emerald-500/30 transition-all border border-transparent">
                      <div className="flex items-center gap-4">
                        <div className="size-12 bg-emerald-500/10 text-emerald-600 rounded-2xl flex items-center justify-center text-xl font-bold">∑</div>
                        <div>
                          <p className="font-black text-slate-800 dark:text-slate-100">{st.purpose}</p>
                          <div className="flex gap-4 mt-1">
                            <p className="text-[9px] font-black uppercase tracking-widest text-primary">Payer: {st.payerName}</p>
                            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500">{memberCount} Members (₹${splitPerPerson.toFixed(2)} each)</p>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black text-slate-900 dark:text-white">₹{st.amount.toLocaleString()}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{st.date}</p>
                      </div>
                    </div>
                  );
                })}
                {splitTransactions.length === 0 && <p className="text-center py-10 text-slate-400 text-xs font-black uppercase tracking-widest">No shared split history.</p>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'SUBS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
            {subscriptions.map(sub => (
              <div key={sub.id} className="glass-panel glass-panel-hover p-8 rounded-[3rem] relative group">
                <button onClick={() => deleteSubscription(sub.id)} className="absolute top-6 right-6 p-2 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all">✕</button>
                <div className="flex justify-between items-start mb-4">
                  <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-emerald-500/10 text-emerald-600 rounded-full">{sub.frequency}</span>
                  <span className="text-2xl">💳</span>
                </div>
                <h4 className="text-2xl font-black">{sub.name}</h4>
                <p className="text-4xl font-black mt-4 text-primary">₹{sub.amount.toLocaleString()}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-6">Until {sub.endDate}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- MODALS --- */}

      {/* Add Income Modal */}
      {modal === 'ADD_INCOME' && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[200] flex items-center justify-center p-6">
          <div className="bg-white dark:bg-[#1c2333] w-full max-w-lg rounded-[3rem] p-10 border border-white/10 animate-in zoom-in duration-300 shadow-2xl">
            <h3 className="text-3xl font-black mb-8 tracking-tight">Add Income</h3>
            <form onSubmit={handleAddIncome} className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Amount (₹)</label>
                <input required type="number" step="0.01" autoFocus value={incForm.amount || ''} onChange={e => setIncForm({ ...incForm, amount: Number(e.target.value) })} className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl py-4 px-6 text-3xl font-black" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Target Account</label>
                <select required value={incForm.accountId} onChange={e => setIncForm({ ...incForm, accountId: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl py-4 px-6 font-bold">
                  <option value="">Choose Account</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <input type="text" placeholder="Source / Notes" value={incForm.notes} onChange={e => setIncForm({ ...incForm, notes: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl py-4 px-6 font-bold" />
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setModal(null)} className="flex-1 font-black text-slate-500">Cancel</button>
                <button type="submit" className="flex-[2] bg-emerald-600 text-white py-4 rounded-2xl font-black shadow-xl">Deposit Income</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Account Edit/Add Modal */}
      {(modal === 'ADD_ACCOUNT' || modal === 'EDIT_ACCOUNT') && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[200] flex items-center justify-center p-6">
          <div className="bg-white dark:bg-[#1c2333] w-full max-w-lg rounded-[3rem] p-10 border border-white/10 animate-in zoom-in duration-300 shadow-2xl">
            <h3 className="text-3xl font-black mb-8 tracking-tight">
              {modal === 'ADD_ACCOUNT' ? 'Setup New Account' : 'Edit Account Details'}
            </h3>
            <form onSubmit={modal === 'ADD_ACCOUNT' ? handleAddAccount : handleUpdateAccount} className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Label</label>
                <input required placeholder="e.g. Primary Checking" value={accForm.name} onChange={e => setAccForm({ ...accForm, name: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 px-6 font-bold focus:ring-2 focus:ring-primary transition-all text-slate-800 dark:text-white" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Account Class</label>
                <select value={accForm.type} onChange={e => setAccForm({ ...accForm, type: e.target.value as AccountType })} className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 px-6 font-bold focus:ring-2 focus:ring-primary text-slate-800 dark:text-white">
                  {Object.values(AccountType).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Current Balance (₹)</label>
                <input required type="number" step="0.01" value={accForm.balance || ''} onChange={e => setAccForm({ ...accForm, balance: Number(e.target.value) })} className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 px-6 text-3xl font-black focus:ring-2 focus:ring-primary text-slate-800 dark:text-white" />
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setModal(null)} className="flex-1 font-black text-slate-500 hover:text-slate-700 transition-colors">Discard</button>
                <button type="submit" className="flex-[2] bg-primary text-white py-4 rounded-2xl font-black shadow-xl hover:scale-[1.02] transition-all">
                  {modal === 'ADD_ACCOUNT' ? 'Create Account' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update Account Confirmation */}
      {modal === 'CONFIRM_UPDATE_ACC' && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[250] flex items-center justify-center p-6 text-center">
          <div className="bg-white dark:bg-[#1c2333] w-full max-w-sm rounded-[3rem] p-12 border border-blue-500/20 shadow-2xl animate-in zoom-in duration-300">
            <div className="size-20 bg-blue-500/10 text-blue-500 rounded-full mx-auto flex items-center justify-center text-3xl mb-6 font-bold">!</div>
            <h3 className="text-2xl font-black mb-4">Confirm Changes</h3>
            <p className="text-sm text-slate-500 leading-relaxed mb-8">Balance change will be logged as an adjustment for "{accForm.name}".</p>
            <div className="flex gap-4">
              <button onClick={() => setModal('EDIT_ACCOUNT')} className="flex-1 font-black text-slate-400">Back</button>
              <button onClick={executeUpdateAccount} className="flex-1 bg-blue-500 text-white py-4 rounded-2xl font-black shadow-lg">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {modal === 'CONFIRM_DELETE' && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[250] flex items-center justify-center p-6 text-center">
          <div className="bg-white dark:bg-[#1c2333] w-full max-w-sm rounded-[3rem] p-12 border border-rose-500/20 shadow-2xl">
            <div className="size-20 bg-rose-500/10 text-rose-500 rounded-full mx-auto flex items-center justify-center text-3xl mb-6 font-bold">!</div>
            <h3 className="text-2xl font-black mb-4">Acknowledge Deletion</h3>
            <p className="text-sm text-slate-500 leading-relaxed mb-8">This removes the account from all worth calculations. This cannot be reversed.</p>
            <div className="flex gap-4">
              <button onClick={() => setModal(null)} className="flex-1 font-black text-slate-400">Abort</button>
              <button onClick={handleDeleteAccount} className="flex-1 bg-rose-500 text-white py-4 rounded-2xl font-black shadow-lg">Delete Forever</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Transaction Confirmation */}
      {modal === 'CONFIRM_DELETE_TX' && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[250] flex items-center justify-center p-6 text-center">
          <div className="bg-white dark:bg-[#1c2333] w-full max-w-sm rounded-[3rem] p-12 border border-rose-500/20 shadow-2xl">
            <div className="size-20 bg-rose-500/10 text-rose-500 rounded-full mx-auto flex items-center justify-center text-3xl mb-6 font-bold">!</div>
            <h3 className="text-2xl font-black mb-4">Delete Transaction?</h3>
            <p className="text-sm text-slate-500 leading-relaxed mb-8">This will NOT revert any associated balance changes.</p>
            <div className="flex gap-4">
              <button onClick={() => setModal(null)} className="flex-1 font-black text-slate-400">Abort</button>
              <button onClick={executeDeleteTransaction} className="flex-1 bg-rose-500 text-white py-4 rounded-2xl font-black shadow-lg">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Subscription Confirmation */}
      {modal === 'CONFIRM_DELETE_SUB' && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[250] flex items-center justify-center p-6 text-center">
          <div className="bg-white dark:bg-[#1c2333] w-full max-w-sm rounded-[3rem] p-12 border border-rose-500/20 shadow-2xl">
            <div className="size-20 bg-rose-500/10 text-rose-500 rounded-full mx-auto flex items-center justify-center text-3xl mb-6 font-bold">!</div>
            <h3 className="text-2xl font-black mb-4">Cancel Subscription?</h3>
            <p className="text-sm text-slate-500 leading-relaxed mb-8">This clears the subscription from your records.</p>
            <div className="flex gap-4">
              <button onClick={() => setModal(null)} className="flex-1 font-black text-slate-400">Abort</button>
              <button onClick={executeDeleteSubscription} className="flex-1 bg-rose-500 text-white py-4 rounded-2xl font-black shadow-lg">Cancel Sub</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Friend Confirmation */}
      {modal === 'CONFIRM_DELETE_FRIEND' && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[250] flex items-center justify-center p-6 text-center">
          <div className="bg-white dark:bg-[#1c2333] w-full max-w-sm rounded-[3rem] p-12 border border-rose-500/20 shadow-2xl">
            <div className="size-20 bg-rose-500/10 text-rose-500 rounded-full mx-auto flex items-center justify-center text-3xl mb-6 font-bold">!</div>
            <h3 className="text-2xl font-black mb-4">Remove Contact?</h3>
            <p className="text-sm text-slate-500 leading-relaxed mb-8">This removes the friend and allows no future splits.</p>
            <div className="flex gap-4">
              <button onClick={() => setModal(null)} className="flex-1 font-black text-slate-400">Abort</button>
              <button onClick={executeDeleteFriend} className="flex-1 bg-rose-500 text-white py-4 rounded-2xl font-black shadow-lg">Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {modal === 'ADD_EXPENSE' && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[200] flex items-center justify-center p-6">
          <div className="bg-white dark:bg-[#1c2333] w-full max-w-lg rounded-[3rem] p-10 border border-white/10 animate-in zoom-in duration-300 shadow-2xl">
            <h3 className="text-3xl font-black mb-8 tracking-tight">Record Expense</h3>
            <form onSubmit={handleAddExpense} className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Cost (₹)</label>
                <input required type="number" step="0.01" value={expForm.amount || ''} onChange={e => setExpForm({ ...expForm, amount: Number(e.target.value) })} className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl py-4 px-6 text-3xl font-black" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Pay From</label>
                  <select required value={expForm.accountId} onChange={e => setExpForm({ ...expForm, accountId: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl py-4 px-6 font-bold">
                    <option value="">Account</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <div className="flex justify-between mb-2 px-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</label>
                    <button type="button" onClick={() => setModal('MANAGE_PURPOSES')} className="text-[9px] font-black text-primary uppercase hover:underline">Manage</button>
                  </div>
                  <select required value={expForm.purposeId} onChange={e => setExpForm({ ...expForm, purposeId: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl py-4 px-6 font-bold">
                    <option value="">Purpose</option>
                    {purposes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <input type="text" placeholder="Short memo (optional)" value={expForm.notes} onChange={e => setExpForm({ ...expForm, notes: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl py-4 px-6 font-bold" />
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setModal(null)} className="flex-1 font-black text-slate-500">Cancel</button>
                <button type="submit" className="flex-[2] bg-slate-900 text-white py-4 rounded-2xl font-black shadow-xl">Post Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Internal Transfer */}
      {modal === 'ADD_TRANSFER' && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[200] flex items-center justify-center p-6">
          <div className="bg-white dark:bg-[#1c2333] w-full max-w-lg rounded-[3rem] p-10 border border-white/10 animate-in zoom-in duration-300">
            <h3 className="text-3xl font-black mb-8">Internal Transfer</h3>
            <form onSubmit={handleTransfer} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <select required value={trfForm.fromId} onChange={e => setTrfForm({ ...trfForm, fromId: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl py-4 px-6 font-bold">
                  <option value="">Source</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <select required value={trfForm.toId} onChange={e => setTrfForm({ ...trfForm, toId: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl py-4 px-6 font-bold">
                  <option value="">Destination</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <input required type="number" step="0.01" placeholder="Amount to Move" value={trfForm.amount || ''} onChange={e => setTrfForm({ ...trfForm, amount: Number(e.target.value) })} className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl py-4 px-6 text-2xl font-black" />
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setModal(null)} className="flex-1 font-black text-slate-500">Cancel</button>
                <button type="submit" className="flex-[2] bg-primary text-white py-4 rounded-2xl font-black shadow-xl shadow-primary/20">Execute</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Subscription Setup */}
      {modal === 'ADD_SUB' && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[200] flex items-center justify-center p-6">
          <div className="bg-white dark:bg-[#1c2333] w-full max-w-lg rounded-[3rem] p-10 border border-white/10 animate-in zoom-in duration-300">
            <h3 className="text-3xl font-black mb-8 tracking-tight">Setup Subscription</h3>
            <form onSubmit={handleAddSubscription} className="space-y-6">
              <input required placeholder="Service (e.g. Amazon Prime)" value={subForm.name} onChange={e => setSubForm({ ...subForm, name: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl py-4 px-6 font-black" />
              <div className="grid grid-cols-2 gap-4">
                <input required type="number" step="0.01" placeholder="Installment Cost" value={subForm.amount || ''} onChange={e => setSubForm({ ...subForm, amount: Number(e.target.value) })} className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl py-4 px-6 font-bold" />
                <select value={subForm.frequency} onChange={e => setSubForm({ ...subForm, frequency: e.target.value as SubscriptionFrequency })} className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl py-4 px-6 font-bold">
                  {Object.values(SubscriptionFrequency).map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <select required value={subForm.accountId} onChange={e => setSubForm({ ...subForm, accountId: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl py-4 px-6 font-bold">
                  <option value="">Pay From</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <input type="text" placeholder="Active Until (Year)" value={subForm.endDate} onChange={e => setSubForm({ ...subForm, endDate: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl py-4 px-6 font-bold text-center" />
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setModal(null)} className="flex-1 font-black text-slate-500">Cancel</button>
                <button type="submit" className="flex-[2] bg-primary text-white py-4 rounded-2xl font-black shadow-xl">Setup Recurring</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Split Bill Modal */}
      {modal === 'SPLIT_BILL' && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[200] flex items-center justify-center p-6">
          <div className="bg-white dark:bg-[#1c2333] w-full max-w-xl rounded-[3rem] p-10 border border-white/10 max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl">
            <h3 className="text-3xl font-black mb-8 tracking-tight">Economic Split</h3>
            <form onSubmit={handleSplitBill} className="space-y-8">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 mb-3 block tracking-widest px-1">Total Bill Amount (₹)</label>
                <input required type="number" step="0.01" placeholder="0.00" value={splitForm.amount || ''} onChange={e => setSplitForm({ ...splitForm, amount: Number(e.target.value) })} className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl py-5 px-8 text-4xl font-black focus:ring-4 focus:ring-emerald-500/20 transition-all" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 mb-3 block tracking-widest px-1">Payer Class</label>
                  <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-2xl">
                    <button type="button" onClick={() => setSplitForm({ ...splitForm, payerType: 'ME' })} className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${splitForm.payerType === 'ME' ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-400'}`}>Me</button>
                    <button type="button" onClick={() => setSplitForm({ ...splitForm, payerType: 'FRIEND' })} className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${splitForm.payerType === 'FRIEND' ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-400'}`}>A Friend</button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 mb-3 block tracking-widest px-1">Payer Selection</label>
                  <select required value={splitForm.accountId || splitForm.payerFriendId} onChange={e => splitForm.payerType === 'ME' ? setSplitForm({ ...splitForm, accountId: e.target.value }) : setSplitForm({ ...splitForm, payerFriendId: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl py-3.5 px-6 font-bold text-sm">
                    <option value="">Select Payer</option>
                    {splitForm.payerType === 'ME' ? accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>) : friends.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 mb-3 block tracking-widest px-1">Reason / Purpose</label>
                <select required value={splitForm.purposeId} onChange={e => setSplitForm({ ...splitForm, purposeId: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl py-3.5 px-6 font-bold text-sm">
                  <option value="">Category</option>
                  {purposes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 block tracking-widest">Share with Others</label>
                  <span className="text-[10px] font-black text-primary uppercase">{(selectedFriends.length || 0) + 1} Total Participants</span>
                </div>
                <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                  {friends.map(f => (
                    <button key={f.id} type="button" onClick={() => setSelectedFriends(prev => prev.includes(f.id) ? prev.filter(id => id !== f.id) : [...prev, f.id])} className={`p-4 rounded-2xl border-2 transition-all text-xs font-black ${selectedFriends.includes(f.id) ? 'border-primary bg-primary/5 text-primary' : 'border-slate-100 dark:border-slate-800 text-slate-400'}`}>
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>

              {splitForm.amount > 0 && (
                <div className="p-6 bg-emerald-500/10 rounded-[2rem] border border-emerald-500/20 space-y-2 animate-in slide-in-from-top-2">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-emerald-600">
                    <span>Summary</span>
                    <span>Equal Split</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <p className="text-sm font-bold text-emerald-700">Per Person Share:</p>
                    <p className="text-3xl font-black text-emerald-600">₹{(splitForm.amount / (selectedFriends.length + 1)).toFixed(2)}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setModal(null)} className="flex-1 font-black text-slate-500">Cancel</button>
                <button type="submit" className="flex-[2] bg-emerald-500 text-white py-4 rounded-2xl font-black shadow-xl shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 transition-all">Execute Split</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Management */}
      {modal === 'MANAGE_PURPOSES' && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[300] flex items-center justify-center p-6">
          <div className="bg-white dark:bg-[#1c2333] w-full max-w-sm rounded-[3rem] p-10 border border-white/10">
            <h3 className="text-2xl font-black mb-6 tracking-tight">Categories</h3>
            <div className="space-y-3 mb-8 max-h-60 overflow-y-auto custom-scrollbar pr-2">
              {purposes.map(p => (
                <div key={p.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl group">
                  <span className="font-bold text-slate-700 dark:text-slate-200">{p.name}</span>
                  {!p.isSystem && (
                    <button onClick={() => deletePurpose(p.id)} className="text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity font-black text-[10px] uppercase">Remove</button>
                  )}
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <input placeholder="New Category..." value={purposeInput.name} onChange={e => setPurposeInput({ ...purposeInput, name: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-900 rounded-xl py-4 px-5 font-bold" />
              <button onClick={handleAddPurpose} className="w-full bg-slate-900 text-white py-4 rounded-xl font-black text-[10px] uppercase tracking-widest">Add New Category</button>
              <button onClick={() => setModal('ADD_EXPENSE')} className="w-full py-4 font-black text-slate-500 text-[10px] uppercase">Back</button>
            </div>
          </div>
        </div>
      )}

      {/* Friend Settlement */}
      {modal === 'SETTLE_FRIEND' && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[200] flex items-center justify-center p-6">
          <div className="bg-white dark:bg-[#1c2333] w-full max-w-sm rounded-[3rem] p-10 border border-white/10 shadow-2xl animate-in zoom-in">
            <h3 className="text-2xl font-black mb-6 tracking-tight">Confirm Settlement</h3>
            <form onSubmit={handleSettlementAction} className="space-y-6">
              <select required value={settleAccountId} onChange={e => setSettleAccountId(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl py-4 px-6 font-bold">
                <option value="">Target Account</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <div className="flex gap-4">
                <button type="button" onClick={() => setModal(null)} className="flex-1 font-black text-slate-500">Abort</button>
                <button type="submit" className="flex-[2] bg-emerald-500 text-white py-4 rounded-2xl font-black shadow-lg">Finalize Settle</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Friend */}
      {modal === 'ADD_FRIEND' && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[200] flex items-center justify-center p-6">
          <div className="bg-white dark:bg-[#1c2333] w-full max-w-sm rounded-[3rem] p-10 border border-white/10 shadow-2xl">
            <h3 className="text-2xl font-black mb-6 tracking-tight">New Contact</h3>
            <input required autoFocus placeholder="Contact Name" value={newFriendName} onChange={e => setNewFriendName(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl py-4 px-6 font-black" />
            <div className="flex gap-4 mt-6">
              <button onClick={() => setModal(null)} className="flex-1 font-black text-slate-500">Cancel</button>
              <button onClick={async () => {
                if (newFriendName.trim()) {
                  const newF = { id: Math.random().toString(36).substr(2, 9), name: newFriendName, netBalance: 0 };
                  const previous = [...friends];
                  setFriends([...friends, newF]);
                  try {
                    await saveToDB(TABLES.FRIENDS, newF);
                    setModal(null);
                    setNewFriendName('');
                  } catch (err) {
                    setFriends(previous);
                    alert('Failed to add contact.');
                  }
                }
              }} className="flex-[2] bg-primary text-white py-4 rounded-2xl font-black hover:scale-105 active:scale-95 transition-all">Register Contact</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default FinanceManager;
