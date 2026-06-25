import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export const merchantApi = {
  getStats: async (days: number = 7) => {
    const token = localStorage.getItem('access_token');
    const response = await axios.get(`${API_URL}/merchant/stats`, {
      params: { days },
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  getTransactions: async (params: { page?: number; limit?: number; status?: string; mode?: string }) => {
    const token = localStorage.getItem('access_token');
    const response = await axios.get(`${API_URL}/merchant/transactions`, {
      params,
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  }
};
