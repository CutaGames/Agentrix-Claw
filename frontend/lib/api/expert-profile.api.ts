'use client';

import { apiClient } from './client';

// Types
export type ExpertStatus = 'pending' | 'active' | 'suspended' | 'revoked';
export type ExpertSpecialty = 'legal' | 'finance' | 'medical' | 'technology' | 'education' | 'consulting' | 'other';

export interface CapabilityCard {
  id: string;
  name: string;
  description: string;
  category: ExpertSpecialty;
  deliverables: string[];
  requirements: string[];
  estimatedTime: string;
  basePrice: number;
  currency: string;
}

export interface SLAConfig {
  maxResponseTime: number; // hours
  minSuccessRate: number; // percentage
  minSatisfactionScore: number; // 1-5
  refundPolicy: 'none' | 'partial' | 'full';
  refundPeriodDays: number;
}

export interface SLAMetrics {
  avgResponseTime: number;
  successRate: number;
  satisfactionScore: number;
  totalConsultations: number;
  completedConsultations: number;
  cancelledConsultations: number;
}

export interface ExpertProfile {
  id: string;
  userId: string;
  displayName: string;
  title: string;
  bio: string;
  avatar?: string;
  specialty: ExpertSpecialty;
  yearsOfExperience: number;
  credentials: string[];
  status: ExpertStatus;
  
  // Capability Cards
  capabilityCards: CapabilityCard[];
  
  // SLA Configuration
  slaConfig: SLAConfig;
  
  // Performance Metrics
  slaMetrics: SLAMetrics;
  
  // Revenue
  totalEarnings: number;
  pendingEarnings: number;
  revenueShare: number;
  
  // Verification
  isVerified: boolean;
  verifiedAt?: string;
  
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpertProfileRequest {
  displayName: string;
  title: string;
  bio: string;
  specialty: ExpertSpecialty;
  yearsOfExperience: number;
  credentials?: string[];
}

export interface UpdateExpertProfileRequest {
  displayName?: string;
  title?: string;
  bio?: string;
  specialty?: ExpertSpecialty;
  yearsOfExperience?: number;
  credentials?: string[];
}

export interface CreateCapabilityCardRequest {
  name: string;
  description: string;
  category: ExpertSpecialty;
  deliverables: string[];
  requirements: string[];
  estimatedTime: string;
  basePrice: number;
  currency?: string;
}

export interface Consultation {
  id: string;
  expertProfileId: string;
  clientUserId: string;
  capabilityCardId: string;
  status: 'requested' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' | 'disputed';
  requestedAt: string;
  acceptedAt?: string;
  completedAt?: string;
  price: number;
  currency: string;
  clientSatisfaction?: number;
  deliverables?: string[];
  notes?: string;
}

// API Functions
export const expertProfileApi = {
  // Get my expert profile
  getMy: async (): Promise<ExpertProfile | null> => {
    try {
      const response = await apiClient.get<ExpertProfile>('/api/expert-profiles/my');
      return response;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  // Create expert profile
  create: async (data: CreateExpertProfileRequest): Promise<ExpertProfile> => {
    return apiClient.post<ExpertProfile>('/api/expert-profiles', data);
  },

  // Update expert profile
  update: async (id: string, data: UpdateExpertProfileRequest): Promise<ExpertProfile> => {
    return apiClient.patch<ExpertProfile>(`/api/expert-profiles/${id}`, data);
  },

  // Get SLA metrics
  getSLAMetrics: async (id: string): Promise<SLAMetrics> => {
    return apiClient.get<SLAMetrics>(`/api/expert-profiles/${id}/sla-metrics`);
  },

  // Update SLA config
  updateSLAConfig: async (id: string, config: Partial<SLAConfig>): Promise<ExpertProfile> => {
    return apiClient.patch<ExpertProfile>(`/api/expert-profiles/${id}/sla-config`, config);
  },

  // Capability Cards
  addCapabilityCard: async (profileId: string, data: CreateCapabilityCardRequest): Promise<CapabilityCard> => {
    return apiClient.post<CapabilityCard>(`/api/expert-profiles/${profileId}/capability-cards`, data);
  },

  updateCapabilityCard: async (profileId: string, cardId: string, data: Partial<CreateCapabilityCardRequest>): Promise<CapabilityCard> => {
    return apiClient.patch<CapabilityCard>(`/api/expert-profiles/${profileId}/capability-cards/${cardId}`, data);
  },

  deleteCapabilityCard: async (profileId: string, cardId: string): Promise<void> => {
    return apiClient.delete(`/api/expert-profiles/${profileId}/capability-cards/${cardId}`);
  },

  // Consultations
  getConsultations: async (profileId: string, params?: { status?: string; limit?: number; offset?: number }): Promise<{ items: Consultation[]; total: number }> => {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    return apiClient.get(`/api/expert-profiles/${profileId}/consultations?${queryParams.toString()}`);
  },

  acceptConsultation: async (profileId: string, consultationId: string): Promise<Consultation> => {
    return apiClient.post<Consultation>(`/api/expert-profiles/${profileId}/consultations/${consultationId}/accept`);
  },

  completeConsultation: async (profileId: string, consultationId: string, deliverables: string[]): Promise<Consultation> => {
    return apiClient.post<Consultation>(`/api/expert-profiles/${profileId}/consultations/${consultationId}/complete`, { deliverables });
  },

  // Request verification
  requestVerification: async (id: string, documents: string[]): Promise<void> => {
    return apiClient.post(`/api/expert-profiles/${id}/request-verification`, { documents });
  },
};

export default expertProfileApi;
