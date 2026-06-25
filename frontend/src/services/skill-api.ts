import axios from 'axios';
import { Skill, SkillStatus } from '../types/skill.types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const skillApi = {
  async getSkills(status?: SkillStatus, view: 'summary' | 'full' = 'full') {
    const response = await axios.get<Skill[]>(`${API_BASE}/api/skills`, {
      params: { status, view }
    });
    return response.data;
  },

  async getSkill(id: string) {
    const response = await axios.get<Skill>(`${API_BASE}/api/skills/${id}`);
    return response.data;
  },

  async createSkill(data: Partial<Skill>) {
    const response = await axios.post<Skill>(`${API_BASE}/api/skills`, data);
    return response.data;
  },

  async updateSkill(id: string, data: Partial<Skill>) {
    const response = await axios.patch<Skill>(`${API_BASE}/api/skills/${id}`, data);
    return response.data;
  },

  async deleteSkill(id: string) {
    const response = await axios.delete(`${API_BASE}/api/skills/${id}`);
    return response.data;
  },

  async getPack(id: string, platform: 'openai' | 'claude' | 'gemini' | 'openapi') {
    const response = await axios.get(`${API_BASE}/api/skills/${id}/pack/${platform}`);
    return response.data;
  },

  async publishSkill(id: string) {
    const response = await axios.post<Skill>(`${API_BASE}/api/skills/${id}/publish`);
    return response.data;
  }
};
