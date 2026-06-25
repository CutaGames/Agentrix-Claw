'use client';

import { apiClient } from './client';

export type DatasetStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'archived';
export type VectorizationStatus = 'pending' | 'indexing' | 'completed' | 'failed';
export type PrivacyLevel = 1 | 2 | 3 | 4 | 5;

export interface Dataset {
  id: string;
  userId: string;
  name: string;
  description?: string;
  dataType: 'csv' | 'json' | 'sql' | 'api' | 'stream';
  status: DatasetStatus;
  
  // Schema
  schema?: {
    fields: Array<{
      name: string;
      type: string;
      description?: string;
    }>;
  };
  
  // Vectorization
  vectorizationStatus: VectorizationStatus;
  vectorConfig?: {
    model: string;
    dimensions: number;
    chunkSize: number;
  };
  
  // Privacy
  privacyLevel: PrivacyLevel;
  privacyConfig?: {
    maskedFields: string[];
    anonymizationRules: Record<string, string>;
  };
  
  // Stats
  totalRows: number;
  processedRows: number;
  fileSize: number;
  
  // Access Control
  isPublic: boolean;
  allowedUsers?: string[];
  
  // X402 Billing
  pricingModel: 'free' | 'per_query' | 'per_row' | 'subscription';
  pricePerQuery?: number;
  pricePerRow?: number;
  currency: string;
  
  createdAt: string;
  updatedAt: string;
}

export interface DatasetQuery {
  id: string;
  datasetId: string;
  userId: string;
  query: string;
  resultRows: number;
  cost: number;
  currency: string;
  executedAt: string;
}

export interface VectorizationProgress {
  status: VectorizationStatus;
  totalRows: number;
  processedRows: number;
  vectorDimensions: number;
  estimatedTimeRemaining: number;
  quality: {
    embeddingCoverage: number;
    indexHealth: 'good' | 'degraded' | 'poor';
  };
}

export interface CreateDatasetRequest {
  name: string;
  description?: string;
  dataType: 'csv' | 'json' | 'sql' | 'api' | 'stream';
  sourceUrl?: string;
  privacyLevel?: PrivacyLevel;
  pricingModel?: 'free' | 'per_query' | 'per_row' | 'subscription';
  pricePerQuery?: number;
  pricePerRow?: number;
}

export interface UpdateDatasetRequest {
  name?: string;
  description?: string;
  privacyLevel?: PrivacyLevel;
  privacyConfig?: {
    maskedFields?: string[];
    anonymizationRules?: Record<string, string>;
  };
  pricingModel?: 'free' | 'per_query' | 'per_row' | 'subscription';
  pricePerQuery?: number;
  pricePerRow?: number;
}

export const datasetApi = {
  // List my datasets
  list: async (params?: { status?: DatasetStatus; limit?: number; offset?: number }): Promise<{ items: Dataset[]; total: number }> => {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    return apiClient.get(`/api/datasets?${queryParams.toString()}`);
  },

  // Get dataset by ID
  getById: async (id: string): Promise<Dataset> => {
    return apiClient.get(`/api/datasets/${id}`);
  },

  // Create dataset
  create: async (data: CreateDatasetRequest): Promise<Dataset> => {
    return apiClient.post('/api/datasets', data);
  },

  // Update dataset
  update: async (id: string, data: UpdateDatasetRequest): Promise<Dataset> => {
    return apiClient.patch(`/api/datasets/${id}`, data);
  },

  // Delete dataset
  delete: async (id: string): Promise<void> => {
    return apiClient.delete(`/api/datasets/${id}`);
  },

  // Upload data file
  uploadFile: async (id: string, file: File): Promise<{ uploadUrl: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post(`/api/datasets/${id}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // Start vectorization
  startVectorization: async (id: string, config?: { model?: string; chunkSize?: number }): Promise<void> => {
    return apiClient.post(`/api/datasets/${id}/vectorize`, config || {});
  },

  // Get vectorization progress
  getVectorizationProgress: async (id: string): Promise<VectorizationProgress> => {
    return apiClient.get(`/api/datasets/${id}/vectorization-progress`);
  },

  // Query dataset
  query: async (id: string, query: string): Promise<{ results: any[]; cost: number; currency: string }> => {
    return apiClient.post(`/api/datasets/${id}/query`, { query });
  },

  // Get query history
  getQueryHistory: async (id: string, params?: { limit?: number; offset?: number }): Promise<{ items: DatasetQuery[]; total: number }> => {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    return apiClient.get(`/api/datasets/${id}/queries?${queryParams.toString()}`);
  },

  // Update privacy settings
  updatePrivacy: async (id: string, privacyLevel: PrivacyLevel, config?: { maskedFields?: string[]; anonymizationRules?: Record<string, string> }): Promise<Dataset> => {
    return apiClient.patch(`/api/datasets/${id}/privacy`, { privacyLevel, ...config });
  },

  // Get privacy preview
  getPrivacyPreview: async (id: string, privacyLevel: PrivacyLevel): Promise<{ before: any[]; after: any[] }> => {
    return apiClient.post(`/api/datasets/${id}/privacy-preview`, { privacyLevel });
  },
};

export default datasetApi;
