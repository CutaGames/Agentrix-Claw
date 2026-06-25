import { apiClient } from './client';

export interface WebsiteStats {
  totalAgents: number;
  totalTransactions: number;
  totalGMV: string;
  activeMerchants: number;
  totalUsers: number;
}

export interface ContactForm {
  name: string;
  email: string;
  message: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  merchant: string;
  rating?: number;
  stock?: number;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  merchant: string;
  duration?: string;
  rating?: number;
}

export const websiteApi = {
  getStats: async (): Promise<WebsiteStats> => {
    return apiClient.get<WebsiteStats>('/mock/website/stats');
  },

  submitContact: async (form: ContactForm): Promise<{ success: boolean; message: string }> => {
    return apiClient.post('/mock/website/contact', form);
  },

  subscribe: async (email: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.post('/mock/website/subscribe', { email });
  },

  download: async (type: string): Promise<{ success: boolean; url: string; message: string }> => {
    return apiClient.get(`/mock/website/download?type=${type}`);
  },

  getDemoProducts: async (category?: string): Promise<Product[]> => {
    const params = category ? { category } : {};
    return apiClient.get<Product[]>('/mock/website/demo/products', { params });
  },

  getDemoServices: async (category?: string): Promise<Service[]> => {
    const params = category ? { category } : {};
    return apiClient.get<Service[]>('/mock/website/demo/services', { params });
  },
};

