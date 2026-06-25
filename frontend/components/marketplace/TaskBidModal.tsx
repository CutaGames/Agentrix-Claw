/**
 * TaskBidModal — 任务竞标弹窗
 *
 * 用户在任务市场点击"接受任务"后弹出，提交竞标方案。
 * 字段：proposedBudget, estimatedDays, proposal
 * API: POST /api/merchant-tasks/marketplace/tasks/:id/bid
 *
 * Requirements: 5.3, 5.4
 */

import { useState, useEffect, useCallback } from 'react';
import { X, Send, AlertCircle, CheckCircle2, LogIn } from 'lucide-react';
import axios from 'axios';
import { useLocalization } from '../../contexts/LocalizationContext';
import { TaskListItem } from '../../services/marketplaceApi';

interface TaskBidModalProps {
  task: TaskListItem | null;
  open: boolean;
  onClose: () => void;
}

export function TaskBidModal({ task, open, onClose }: TaskBidModalProps) {
  const { t } = useLocalization();

  const [proposedBudget, setProposedBudget] = useState('');
  const [estimatedDays, setEstimatedDays] = useState('');
  const [proposal, setProposal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(true);

  // Check login status
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token =
        localStorage.getItem('access_token') ||
        localStorage.getItem('authToken') ||
        sessionStorage.getItem('authToken');
      setIsLoggedIn(!!token);
    }
  }, [open]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      setProposedBudget('');
      setEstimatedDays('');
      setProposal('');
      setError('');
      setSuccess(false);
    }
  }, [open]);

  const handleSubmit = useCallback(async () => {
    if (!task) return;

    setError('');

    // Validation
    const budget = parseFloat(proposedBudget);
    const days = parseInt(estimatedDays, 10);

    if (!budget || budget <= 0) {
      setError(t({ zh: '请输入有效的报价金额', en: 'Please enter a valid bid amount' }));
      return;
    }
    if (!days || days <= 0) {
      setError(t({ zh: '请输入有效的预计天数', en: 'Please enter valid estimated days' }));
      return;
    }
    if (proposal.trim().length < 50) {
      setError(
        t({
          zh: '方案描述至少需要 50 个字符',
          en: 'Proposal must be at least 50 characters',
        }),
      );
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`/api/merchant-tasks/marketplace/tasks/${task.id}/bid`, {
        proposedBudget: budget,
        estimatedDays: days,
        proposal: proposal.trim(),
      });
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        t({ zh: '提交失败，请稍后再试', en: 'Submission failed. Please try again later.' });
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [task, proposedBudget, estimatedDays, proposal, t, onClose]);

  if (!open || !task) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg rounded-xl border border-gray-700 bg-gray-800 p-6 shadow-2xl">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
          aria-label={t({ zh: '关闭', en: 'Close' })}
        >
          <X size={18} />
        </button>

        {/* Title */}
        <h2 className="mb-1 text-lg font-bold text-white">
          {t({ zh: '提交竞标', en: 'Submit a Bid' })}
        </h2>
        <p className="mb-5 text-sm text-gray-400">
          {task.title}
        </p>

        {/* Not logged in */}
        {!isLoggedIn ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <LogIn size={36} className="text-gray-500" />
            <p className="text-center text-sm text-gray-300">
              {t({
                zh: '请先登录后再提交竞标',
                en: 'Please log in before submitting a bid',
              })}
            </p>
            <a
              href="/login?redirect=/market/tasks"
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-500"
            >
              {t({ zh: '前往登录', en: 'Go to Login' })}
            </a>
          </div>
        ) : success ? (
          /* Success state */
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 size={40} className="text-green-400" />
            <p className="text-center text-sm font-medium text-green-300">
              {t({
                zh: '竞标已提交成功！等待任务发布者审核。',
                en: 'Bid submitted successfully! Waiting for the task owner to review.',
              })}
            </p>
          </div>
        ) : (
          /* Bid form */
          <div className="space-y-4">
            {/* Proposed Budget */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">
                {t({
                  zh: `报价（${task.currency || 'USD'}）`,
                  en: `Proposed Budget (${task.currency || 'USD'})`,
                })}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={proposedBudget}
                onChange={(e) => setProposedBudget(e.target.value)}
                placeholder={t({ zh: '输入你的报价金额', en: 'Enter your bid amount' })}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3.5 py-2.5 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                {t({
                  zh: `任务预算参考：$${task.rewardAmount.toFixed(2)}`,
                  en: `Task budget reference: $${task.rewardAmount.toFixed(2)}`,
                })}
              </p>
            </div>

            {/* Estimated Days */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">
                {t({ zh: '预计完成天数', en: 'Estimated Days' })}
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={estimatedDays}
                onChange={(e) => setEstimatedDays(e.target.value)}
                placeholder={t({ zh: '输入预计天数', en: 'Enter estimated days' })}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3.5 py-2.5 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
            </div>

            {/* Proposal */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">
                {t({ zh: '方案说明', en: 'Proposal' })}
              </label>
              <textarea
                value={proposal}
                onChange={(e) => setProposal(e.target.value)}
                placeholder={t({
                  zh: '请描述你的方法、经验和优势（至少 50 字符）…',
                  en: 'Describe your approach, experience and strengths (min 50 chars)…',
                })}
                rows={5}
                maxLength={2000}
                className="w-full resize-none rounded-lg border border-gray-700 bg-gray-900 px-3.5 py-2.5 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
              <p className="mt-1 text-right text-[11px] text-gray-500">
                {proposal.length}/2000
              </p>
            </div>

            {/* Error message */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5">
                <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-400" />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            {/* Submit button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Send size={14} />
              )}
              {submitting
                ? t({ zh: '提交中…', en: 'Submitting…' })
                : t({ zh: '提交竞标', en: 'Submit Bid' })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
