'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Wallet, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  ArrowLeftRight, 
  Clock, 
  Plus,
  Loader2,
  ShieldCheck,
  Zap,
  RefreshCw,
  Copy,
  Check,
  ArrowDownRight,
  ArrowUpLeft,
  DollarSign,
  ExternalLink,
  TrendingUp,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAccounts } from '../../contexts/AccountContext';
import { useWeb3 } from '../../contexts/Web3Context';
import { Account, Transaction, accountApi } from '../../lib/api/account.api';
import { paymentApi } from '../../lib/api/payment.api';
import { TransakWidget } from '../payment/TransakWidget';
import { PayoutSettingsPanel } from './PayoutSettingsPanel';
import { MPCWalletCard } from '../wallet/MPCWalletCard';
import { Sparkles, KeyRound } from 'lucide-react';

// 专业链图标 SVG 组件
const ChainIcons = {
  evm: () => (
    <svg viewBox="0 0 32 32" className="w-6 h-6">
      <circle cx="16" cy="16" r="16" fill="#627EEA"/>
      <path d="M16.498 4v8.87l7.497 3.35L16.498 4z" fill="#fff" fillOpacity=".6"/>
      <path d="M16.498 4L9 16.22l7.498-3.35V4z" fill="#fff"/>
      <path d="M16.498 21.968v6.027L24 17.616l-7.502 4.352z" fill="#fff" fillOpacity=".6"/>
      <path d="M16.498 27.995v-6.028L9 17.616l7.498 10.379z" fill="#fff"/>
    </svg>
  ),
  base: () => (
    <svg viewBox="0 0 32 32" className="w-6 h-6">
      <circle cx="16" cy="16" r="16" fill="#0052FF"/>
      <path d="M16 6c5.523 0 10 4.477 10 10s-4.477 10-10 10S6 21.523 6 16 10.477 6 16 6zm0 3a7 7 0 100 14 7 7 0 000-14z" fill="#fff"/>
    </svg>
  ),
  bnb: () => (
    <svg viewBox="0 0 32 32" className="w-6 h-6">
      <circle cx="16" cy="16" r="16" fill="#F3BA2F"/>
      <path d="M12.116 14.404L16 10.52l3.886 3.886 2.26-2.26L16 6l-6.144 6.144 2.26 2.26zM6 16l2.26-2.26L10.52 16l-2.26 2.26L6 16zm6.116 1.596L16 21.48l3.886-3.886 2.26 2.259L16 26l-6.144-6.144-.003-.003 2.263-2.257zM21.48 16l2.26-2.26L26 16l-2.26 2.26L21.48 16zm-3.188-.002h.002L16 13.706 14.294 15.4l-.002.002-.292.292-.406.405 2.406 2.408 2.294-2.294-.002-.002.002-.002-.002-.211z" fill="#fff"/>
    </svg>
  ),
  solana: () => (
    <svg viewBox="0 0 32 32" className="w-6 h-6">
      <circle cx="16" cy="16" r="16" fill="#9945FF"/>
      <path d="M9.5 19.1c.1-.1.3-.2.5-.2h13.3c.3 0 .5.4.3.6l-2.2 2.2c-.1.1-.3.2-.5.2H7.6c-.3 0-.5-.4-.3-.6l2.2-2.2zm0-6.3c.1-.1.3-.2.5-.2h13.3c.3 0 .5.4.3.6l-2.2 2.2c-.1.1-.3.2-.5.2H7.6c-.3 0-.5-.4-.3-.6l2.2-2.2zm11.6-2.6c-.1.1-.3.2-.5.2H7.3c-.3 0-.5-.4-.3-.6l2.2-2.2c.1-.1.3-.2.5-.2h13.3c.3 0 .5.4.3.6l-2.2 2.2z" fill="#fff"/>
    </svg>
  ),
  bitcoin: () => (
    <svg viewBox="0 0 32 32" className="w-6 h-6">
      <circle cx="16" cy="16" r="16" fill="#F7931A"/>
      <path d="M21.9 13.3c.3-1.9-1.2-2.9-3.2-3.6l.6-2.6-1.6-.4-.6 2.5c-.4-.1-.8-.2-1.3-.3l.6-2.5-1.6-.4-.6 2.6c-.4-.1-.7-.2-1-.2v-.1l-2.2-.5-.4 1.7s1.2.3 1.2.3c.6.2.8.6.7 1l-.7 3c0 .1.1.1.1.2-.1 0-.1 0-.2-.1l-1 4c-.1.2-.3.5-.7.4 0 0-1.2-.3-1.2-.3l-.8 1.9 2.1.5c.4.1.8.2 1.2.3l-.7 2.6 1.6.4.6-2.6c.4.1.9.2 1.3.3l-.6 2.6 1.6.4.6-2.6c2.6.5 4.6.3 5.4-2.1.7-1.9 0-3-1.4-3.7 1-.2 1.8-.9 2-2.3zm-3.6 5c-.5 2-3.9.9-5 .6l.9-3.6c1.1.3 4.6.8 4.1 3zm.5-5c-.4 1.8-3.2.9-4.1.7l.8-3.2c.9.2 3.8.6 3.3 2.5z" fill="#fff"/>
    </svg>
  ),
  multi: () => (
    <svg viewBox="0 0 32 32" className="w-6 h-6">
      <circle cx="16" cy="16" r="16" fill="#6366F1"/>
      <path d="M16 8l6 4v8l-6 4-6-4v-8l6-4z" fill="none" stroke="#fff" strokeWidth="1.5"/>
      <circle cx="16" cy="16" r="3" fill="#fff"/>
    </svg>
  ),
};

const chainInfo: Record<string, { label: string; speed: string }> = {
  evm: { label: 'Ethereum', speed: 'Fast' },
  base: { label: 'Base', speed: 'Instant' },
  bnb: { label: 'BNB Chain', speed: 'Moderate' },
  solana: { label: 'Solana', speed: 'Instant' },
  bitcoin: { label: 'Bitcoin', speed: 'Slow' },
  multi: { label: 'Multi-Chain', speed: 'Variable' },
};

interface AccountItemProps {
  account: Account;
  isDefault?: boolean;
  onDeposit?: () => void;
  onWithdraw?: () => void;
}

const AccountItem: React.FC<AccountItemProps> = ({ account, isDefault, onDeposit, onWithdraw }) => {
  const [copied, setCopied] = useState(false);
  const chain = account.chainType || 'evm';
  const info = chainInfo[chain] || chainInfo.evm;
  const ChainIcon = ChainIcons[chain] || ChainIcons.evm;
  const balances = account.balances || {};
  const [currency, amount] = Object.entries(balances)[0] || ['USDC', '0'];

  const copyAddress = () => {
    if (account.walletAddress) {
      navigator.clipboard.writeText(account.walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 hover:bg-slate-800/80 hover:border-slate-600 transition-all group">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-700/50 flex items-center justify-center">
            <ChainIcon />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{info.label}</span>
              {isDefault && <span className="text-[9px] px-1.5 py-0.5 bg-indigo-500/20 text-indigo-400 rounded font-bold">DEFAULT</span>}
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-500 font-mono mt-0.5">
              {account.walletAddress ? `${account.walletAddress.slice(0, 6)}...${account.walletAddress.slice(-4)}` : 'Internal'}
              {account.walletAddress && (
                <button onClick={copyAddress} className="hover:text-white transition-colors">
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-base font-mono font-bold text-white">${parseFloat(amount).toLocaleString()}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">{currency}</div>
        </div>
      </div>
      <div className="flex gap-2">
        <button 
          onClick={onDeposit}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-medium rounded-lg transition-all"
        >
          <ArrowDownToLine size={12} /> Deposit
        </button>
        <button 
          onClick={onWithdraw}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-medium rounded-lg transition-all"
        >
          <ArrowUpFromLine size={12} /> Withdraw
        </button>
      </div>
    </div>
  );
};

const DepositModal = ({ isOpen, onClose, walletAddress }: { isOpen: boolean; onClose: () => void; walletAddress?: string }) => {
  const [method, setMethod] = useState<'transak' | 'crypto'>('transak');
  const [copied, setCopied] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [showTransakWidget, setShowTransakWidget] = useState(false);

  const copyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setDepositAmount('');
      setShowTransakWidget(false);
      setMethod('transak');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // For display, shorten the address
  const shortAddress = walletAddress 
    ? `${walletAddress.slice(0, 10)}...${walletAddress.slice(-8)}` 
    : 'No wallet connected';

  const canProceedTransak = walletAddress && depositAmount && parseFloat(depositAmount) > 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700/50 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-slate-700/50 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Deposit Funds</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all">
            <RefreshCw size={18} />
          </button>
        </div>
        
        {/* Method Tabs */}
        <div className="p-3 flex gap-2 border-b border-slate-700/50">
          <button 
            onClick={() => { setMethod('transak'); setShowTransakWidget(false); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${method === 'transak' ? 'bg-blue-600 text-white' : 'bg-slate-800/50 text-slate-400 hover:text-white border border-slate-700/50'}`}
          >
            Card/Bank
          </button>
          <button 
            onClick={() => setMethod('crypto')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${method === 'crypto' ? 'bg-blue-600 text-white' : 'bg-slate-800/50 text-slate-400 hover:text-white border border-slate-700/50'}`}
          >
            Crypto
          </button>
        </div>

        <div className="p-5">
          {method === 'transak' ? (
            showTransakWidget && canProceedTransak ? (
              <TransakWidget 
                orderId={`deposit-${Date.now()}`} 
                walletAddress={walletAddress} 
                amount={parseFloat(depositAmount)} 
                onSuccess={() => onClose()} 
                onClose={onClose} 
              />
            ) : (
              <div className="space-y-5">
                {/* Amount Input */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-400">Amount (USD)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold text-slate-500">$</span>
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="100.00"
                      min="10"
                      className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl pl-10 pr-4 py-3.5 text-xl font-semibold text-white focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                  <div className="flex gap-2">
                    {[50, 100, 500, 1000].map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setDepositAmount(preset.toString())}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                          depositAmount === preset.toString() 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-slate-800/50 text-slate-400 hover:text-white border border-slate-700/50'
                        }`}
                      >
                        ${preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Wallet Address */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-400">Receiving Wallet</label>
                  {walletAddress ? (
                    <div className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                      <Wallet size={16} className="text-emerald-400" />
                      <span className="font-mono text-sm text-slate-300 truncate">{shortAddress}</span>
                      <Check size={14} className="text-emerald-400 ml-auto" />
                    </div>
                  ) : (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-sm">
                      <Wallet size={16} className="inline mr-2" />
                      No wallet connected
                    </div>
                  )}
                </div>

                {/* Proceed Button */}
                <button
                  onClick={() => setShowTransakWidget(true)}
                  disabled={!canProceedTransak}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <ArrowDownToLine size={16} />
                  Continue
                </button>

                <p className="text-[10px] text-slate-600 text-center">
                  Powered by Transak • Cards, bank transfer & more
                </p>
              </div>
            )
          ) : (
            <div className="space-y-5 text-center">
              {walletAddress ? (
                <>
                  <div className="bg-white rounded-xl mx-auto p-3 inline-block">
                    <QRCodeSVG value={walletAddress} size={160} level="M" includeMargin={false} />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-slate-400">Your Deposit Address (USDC)</p>
                    <div className="flex items-center justify-center gap-2 p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                      <span className="font-mono text-sm text-slate-300 truncate">{shortAddress}</span>
                      <button onClick={copyAddress} className="text-blue-400 hover:text-blue-300 transition-colors">
                        {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14}/>}
                      </button>
                      <a href={`https://etherscan.io/address/${walletAddress}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 transition-colors">
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    Send USDC via Ethereum, Base, or BNB Chain. Credits appear within 5-10 minutes.
                  </p>
                  <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 rounded-lg px-3 py-2">
                    <ShieldCheck size={12} />
                    <span>Personal deposit address</span>
                  </div>
                </>
              ) : (
                <div className="py-8 space-y-3">
                  <div className="w-16 h-16 bg-amber-500/10 text-amber-400 rounded-full mx-auto flex items-center justify-center">
                    <Wallet size={28} />
                  </div>
                  <h4 className="text-base font-semibold text-white">Connect Wallet</h4>
                  <p className="text-slate-400 text-sm max-w-xs mx-auto">
                    Connect a wallet to get your deposit address.
                  </p>
                  <button className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-all">
                    Connect
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const WithdrawModal = ({ isOpen, onClose, selectedAccount }: { isOpen: boolean; onClose: () => void; selectedAccount?: Account }) => {
  const [amount, setAmount] = useState('');
  const [address, setAddress] = useState('');
  const [withdrawMode, setWithdrawMode] = useState<'crypto' | 'fiat'>('fiat');
  const [isProcessing, setIsProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [transakUrl, setTransakUrl] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleWithdrawCrypto = async () => {
    if (!selectedAccount) return;
    setIsProcessing(true);
    try {
      const currency = Object.keys(selectedAccount.balances || {})[0] || 'USDC';
      await accountApi.withdraw(selectedAccount.id, {
        amount: parseFloat(amount),
        currency,
        toAddress: address
      });
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleWithdrawFiat = async () => {
    if (!amount) return;
    setIsProcessing(true);
    try {
      const session = await paymentApi.createTransakSession({
        amount: parseFloat(amount),
        fiatCurrency: 'USD',
        cryptoCurrency: 'USDC',
        network: 'polygon',
        productType: 'SELL',
        redirectURL: window.location.href,
      });
      if (session.widgetUrl) {
        setTransakUrl(session.widgetUrl);
        window.open(session.widgetUrl, '_blank');
        setSuccess(true);
        setTimeout(() => {
          onClose();
          setSuccess(false);
          setTransakUrl(null);
        }, 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700/50 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-slate-700/50 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Withdraw Funds</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all">
            <RefreshCw size={18} />
          </button>
        </div>
        
        <div className="p-5">
          {success ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-14 h-14 bg-emerald-500/20 text-emerald-500 rounded-full mx-auto flex items-center justify-center">
                <Check size={28} />
              </div>
              <h4 className="text-base font-semibold text-white">
                {withdrawMode === 'fiat' ? 'Offramp Session Created' : 'Withdrawal Initiated'}
              </h4>
              <p className="text-slate-400 text-sm">
                {withdrawMode === 'fiat'
                  ? 'Transak offramp page opened — complete your bank transfer there.'
                  : 'Funds will arrive shortly.'}
              </p>
              {transakUrl && (
                <a href={transakUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300">
                  <ExternalLink size={14} /> Open Transak again
                </a>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Mode selector */}
              <div className="flex bg-slate-800/50 border border-white/5 rounded-xl p-1">
                <button
                  onClick={() => setWithdrawMode('fiat')}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${withdrawMode === 'fiat' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  Bank Transfer (Fiat)
                </button>
                <button
                  onClick={() => setWithdrawMode('crypto')}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${withdrawMode === 'crypto' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  Crypto Wallet
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Source Account</label>
                <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/50 text-white text-sm">
                  {selectedAccount ? (selectedAccount.chainType || 'evm').toUpperCase() : 'Default Account'} — ${selectedAccount?.balances ? Object.values(selectedAccount.balances)[0] : '0'}
                </div>
              </div>

              {withdrawMode === 'fiat' ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2">Amount (USDC → USD)</label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                  <p className="text-xs text-slate-500">Powered by Transak — sells your USDC and sends USD to your bank account.</p>
                  <button
                    onClick={handleWithdrawFiat}
                    disabled={isProcessing || !amount}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-all mt-2 flex items-center justify-center gap-2"
                  >
                    {isProcessing ? <RefreshCw size={16} className="animate-spin" /> : <ArrowUpFromLine size={16} />}
                    {isProcessing ? 'Opening...' : 'Withdraw to Bank (Transak)'}
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2">Destination Address</label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="0x..."
                      className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2">Amount (USDC)</label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                  <button
                    onClick={handleWithdrawCrypto}
                    disabled={isProcessing || !amount || !address}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-all mt-2 flex items-center justify-center gap-2"
                  >
                    {isProcessing ? <RefreshCw size={16} className="animate-spin" /> : <ArrowUpFromLine size={16} />}
                    {isProcessing ? 'Processing...' : 'Withdraw to Wallet'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const TransactionHistory: React.FC<{ accountId: string }> = ({ accountId }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  const { getTransactions } = useAccounts();

  const fetchTx = useCallback(async () => {
    setLoading(true);
    const result = await getTransactions(accountId);
    if (result) setTransactions(result.transactions);
    setLoading(false);
  }, [accountId, getTransactions]);

  useEffect(() => { fetchTx(); }, [fetchTx]);

  const filteredTx = transactions.filter(tx => {
    if (filter === 'all') return true;
    const isOut = ['payment', 'withdraw', 'transfer_out'].includes(tx.type);
    return filter === 'out' ? isOut : !isOut;
  });

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" /></div>;

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'in', 'out'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800/50 text-slate-400 hover:text-white border border-slate-700/50'
            }`}
          >
            {f === 'all' ? 'All' : f === 'in' ? 'Received' : 'Sent'}
          </button>
        ))}
      </div>

      {/* Transaction list */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl overflow-hidden">
        {filteredTx.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <Clock size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">No transactions yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {filteredTx.map(tx => {
              const isPayment = ['payment', 'withdraw', 'transfer_out'].includes(tx.type);
              return (
                <div key={tx.id} className="flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isPayment ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      {isPayment ? <ArrowUpLeft size={16} /> : <ArrowDownRight size={16} />}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white capitalize">{tx.type.replace('_', ' ')}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-500">{new Date(tx.createdAt).toLocaleDateString()}</span>
                        {tx.txHash && (
                          <a href={`https://etherscan.io/tx/${tx.txHash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                            {tx.txHash.slice(0, 8)}... <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-semibold ${isPayment ? 'text-white' : 'text-emerald-400'}`}>
                      {isPayment ? '-' : '+'}${parseFloat(tx.amount).toLocaleString()}
                    </div>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      tx.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                    }`}>
                      {tx.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

interface UnifiedAccountPanelProps {
  onCreateAccount?: () => void;
  activeView?: 'balances' | 'transactions' | 'deposit' | 'withdraw' | 'payout-settings';
  showPendingEarnings?: boolean;
}

const UnifiedAccountPanel: React.FC<UnifiedAccountPanelProps> = ({ 
  onCreateAccount,
  activeView: initialView = 'balances'
}) => {
  const { accounts, defaultAccount, summary, loading } = useAccounts();
  const { address: connectedWalletAddress, defaultWallet, isConnected } = useWeb3();
  const [activeView, setActiveView] = useState<'balances' | 'transactions' | 'payout-settings'>(
    initialView === 'transactions' ? 'transactions' : 
    initialView === 'payout-settings' ? 'payout-settings' : 'balances'
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showDepositModal, setShowDepositModal] = useState(initialView === 'deposit');
  const [showWithdrawModal, setShowWithdrawModal] = useState(initialView === 'withdraw');

  // Update modals when initialView changes sync with L1/L2 nav
  useEffect(() => {
    if (initialView === 'deposit') setShowDepositModal(true);
    if (initialView === 'withdraw') setShowWithdrawModal(true);
    if (initialView === 'transactions') setActiveView('transactions');
    if (initialView === 'payout-settings') setActiveView('payout-settings');
    if (initialView === 'balances') setActiveView('balances');
  }, [initialView]);

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) || defaultAccount || undefined;
  
  // Get the best available wallet address: from selected account, default account, or connected wallet
  const depositWalletAddress = selectedAccount?.walletAddress || defaultAccount?.walletAddress || connectedWalletAddress || defaultWallet?.address;

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-blue-500" /></div>;

  return (
    <div className="max-w-4xl mx-auto py-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white">Unified Account</h2>
          <p className="text-slate-500 text-sm mt-1">Multi-chain liquidity management</p>
        </div>
        <div className="flex bg-slate-800/50 border border-white/5 p-1 rounded-lg">
           <button onClick={() => setActiveView('balances')} className={`px-4 py-2 rounded-md text-xs font-medium transition-all ${activeView === 'balances' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>Assets</button>
           <button onClick={() => setActiveView('transactions')} className={`px-4 py-2 rounded-md text-xs font-medium transition-all ${activeView === 'transactions' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>History</button>
           <button onClick={() => setActiveView('payout-settings')} className={`px-4 py-2 rounded-md text-xs font-medium transition-all ${activeView === 'payout-settings' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>{process.env.NEXT_PUBLIC_LANG === 'zh' ? '结算' : 'Payouts'}</button>
        </div>
      </div>

      {activeView === 'transactions' ? (
        <TransactionHistory accountId={selectedAccountId || defaultAccount?.id || ''} />
      ) : activeView === 'payout-settings' ? (
        <div className="p-0">
          <PayoutSettingsPanel />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Main Balance Card - Refined gradient with subtle elegance */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-8 text-white relative overflow-hidden border border-white/5">
            {/* Subtle accent gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5" />
            
            <div className="relative z-10">
              {/* Header with trend indicator */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2 text-slate-400 text-xs font-medium uppercase tracking-wider">
                  <DollarSign size={14} className="text-blue-400" /> Total Net Worth
                </div>
                <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium bg-emerald-500/10 px-2.5 py-1 rounded-full">
                  <TrendingUp size={12} />
                  <span>+0.00%</span>
                </div>
              </div>
              
              {/* Main Balance - Prominent display */}
              <div className="text-5xl font-bold tracking-tight mb-8 text-white">
                ${summary?.totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
              </div>
              
              {/* Balance Breakdown - Compact cards */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-white/5 rounded-xl p-4">
                  <div className="text-[10px] text-slate-500 uppercase font-medium mb-1">Liquid</div>
                  <div className="text-lg font-semibold text-white">${((summary?.totalBalance || 0) - (summary?.totalFrozen || 0)).toLocaleString()}</div>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <div className="text-[10px] text-slate-500 uppercase font-medium mb-1">Staked</div>
                  <div className="text-lg font-semibold text-amber-400">${summary?.totalFrozen.toLocaleString() || '0'}</div>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <div className="text-[10px] text-slate-500 uppercase font-medium mb-1">Pending</div>
                  <div className="text-lg font-semibold text-emerald-400">${summary?.totalPending.toLocaleString() || '0'}</div>
                </div>
              </div>
              
              {/* Action Buttons - Clear hierarchy */}
              <div className="flex gap-3">
                 <button onClick={() => setShowDepositModal(true)} className="flex-1 px-6 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 text-sm transition-colors">
                   <ArrowDownToLine size={18} /> Deposit
                 </button>
                 <button onClick={() => setShowWithdrawModal(true)} className="flex-1 px-6 py-3.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-semibold rounded-xl flex items-center justify-center gap-2 text-sm transition-colors">
                   <ArrowUpFromLine size={18} /> Withdraw
                 </button>
              </div>
            </div>
          </div>

          {/* Multi-Chain Accounts Section */}
          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Wallets ({accounts.length})</h3>
              <button onClick={onCreateAccount} className="text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"><Plus size={14} /> Add</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
               {accounts.map(account => (
                 <AccountItem key={account.id} account={account} isDefault={account.id === defaultAccount?.id} onDeposit={() => { setSelectedAccountId(account.id); setShowDepositModal(true); }} onWithdraw={() => { setSelectedAccountId(account.id); setShowWithdrawModal(true); }} />
               ))}
            </div>
          </div>

          {/* MPC Wallet Section - Web2 users smart wallet */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Sparkles size={14} className="text-purple-400" />
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Smart Wallet (MPC)</h3>
            </div>
            <div className="bg-gradient-to-br from-purple-900/30 to-indigo-900/30 rounded-2xl border border-purple-500/20 p-1">
              <MPCWalletCard compact={false} />
            </div>
          </div>

          {/* Security Badge - Subtle and professional */}
          <div className="bg-slate-800/50 border border-white/5 rounded-xl p-5 flex items-center gap-4">
             <div className="p-2.5 bg-emerald-500/10 rounded-lg text-emerald-400"><ShieldCheck size={20} /></div>
             <div className="flex-1">
                <h4 className="font-semibold text-white text-sm">Protected by Agentrix Securitas</h4>
                <p className="text-xs text-slate-500 mt-0.5">Enterprise KMS security. Instant, gas-less internal settlements.</p>
             </div>
          </div>
        </div>
      )}

      <DepositModal isOpen={showDepositModal} onClose={() => setShowDepositModal(false)} walletAddress={depositWalletAddress} />
      <WithdrawModal isOpen={showWithdrawModal} onClose={() => setShowWithdrawModal(false)} selectedAccount={selectedAccount} />
    </div>
  );
};

export default UnifiedAccountPanel;
