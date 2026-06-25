'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { kycApi, KYCRecord, KYCLevel, KYCLevelBenefits, SubmitKYCRequest } from '../lib/api/kyc.api';
import { useUser } from './UserContext';

interface KYCContextType {
  kycRecords: KYCRecord[];
  activeKYC: KYCRecord | null;
  currentLevel: KYCLevel;
  levelBenefits: KYCLevelBenefits[];
  renewalNeeded: boolean;
  daysUntilExpiry: number | null;
  loading: boolean;
  error: string | null;

  // 操作
  refreshKYC: () => Promise<void>;
  submitKYC: (data: SubmitKYCRequest) => Promise<KYCRecord | null>;
  checkLevel: (level: KYCLevel) => Promise<boolean>;
  getUploadUrl: (filename: string, contentType: string) => Promise<{ uploadUrl: string; documentUrl: string } | null>;
  cancelKYC: (id: string) => Promise<boolean>;
  addDocuments: (id: string, documents: Array<{ type: string; url: string }>) => Promise<boolean>;
}

const KYCContext = createContext<KYCContextType | undefined>(undefined);

export const KYCProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useUser();
  const [kycRecords, setKycRecords] = useState<KYCRecord[]>([]);
  const [activeKYC, setActiveKYC] = useState<KYCRecord | null>(null);
  const [levelBenefits, setLevelBenefits] = useState<KYCLevelBenefits[]>([]);
  const [renewalNeeded, setRenewalNeeded] = useState(false);
  const [daysUntilExpiry, setDaysUntilExpiry] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshKYC = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      setError(null);
      const [records, active, benefits, renewal] = await Promise.all([
        kycApi.getMy(),
        kycApi.getActive(),
        kycApi.getLevelBenefits(),
        kycApi.checkRenewal(),
      ]);
      setKycRecords(records || []);
      setActiveKYC(active);
      setLevelBenefits(benefits || []);
      setRenewalNeeded(renewal?.needsRenewal || false);
      setDaysUntilExpiry(renewal?.daysRemaining || null);
    } catch (err: any) {
      console.error('Failed to refresh KYC:', err);
      setError(err.message || '获取KYC信息失败');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      refreshKYC();
    } else {
      setKycRecords([]);
      setActiveKYC(null);
      setLevelBenefits([]);
    }
  }, [isAuthenticated, refreshKYC]);

  const currentLevel: KYCLevel = activeKYC?.level || 'basic';

  const submitKYC = async (data: SubmitKYCRequest): Promise<KYCRecord | null> => {
    try {
      const record = await kycApi.submit(data);
      await refreshKYC();
      return record;
    } catch (err: any) {
      setError(err.message || '提交KYC失败');
      return null;
    }
  };

  const checkLevel = async (level: KYCLevel): Promise<boolean> => {
    try {
      const result = await kycApi.checkLevel(level);
      return result?.satisfied || false;
    } catch (err: any) {
      console.error('Failed to check KYC level:', err);
      return false;
    }
  };

  const getUploadUrl = async (filename: string, contentType: string) => {
    try {
      return await kycApi.getUploadUrl(filename, contentType);
    } catch (err: any) {
      console.error('Failed to get upload URL:', err);
      return null;
    }
  };

  const cancelKYC = async (id: string): Promise<boolean> => {
    try {
      await kycApi.cancel(id);
      await refreshKYC();
      return true;
    } catch (err: any) {
      setError(err.message || '取消KYC申请失败');
      return false;
    }
  };

  const addDocuments = async (id: string, documents: Array<{ type: string; url: string }>): Promise<boolean> => {
    try {
      await kycApi.addDocuments(id, documents);
      await refreshKYC();
      return true;
    } catch (err: any) {
      setError(err.message || '添加文档失败');
      return false;
    }
  };

  return (
    <KYCContext.Provider value={{
      kycRecords,
      activeKYC,
      currentLevel,
      levelBenefits,
      renewalNeeded,
      daysUntilExpiry,
      loading,
      error,
      refreshKYC,
      submitKYC,
      checkLevel,
      getUploadUrl,
      cancelKYC,
      addDocuments,
    }}>
      {children}
    </KYCContext.Provider>
  );
};

export const useKYC = () => {
  const context = useContext(KYCContext);
  if (!context) {
    throw new Error('useKYC must be used within KYCProvider');
  }
  return context;
};

export default KYCContext;
