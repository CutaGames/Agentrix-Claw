'use client';

import React from 'react';
import { useAgentMode } from '../../contexts/AgentModeContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { L1Tab } from './L1TopNav';
import { 
  PERSONA_MOBILE_BOTTOM_TABS, 
  PersonaType, 
  getPersonaFromMode 
} from '../../lib/constants/persona-themes';

interface MobileBottomNavProps {
  activeTab: L1Tab;
  onTabChange: (tab: L1Tab) => void;
}

export function MobileBottomNav({ activeTab, onTabChange }: MobileBottomNavProps) {
  const { mode } = useAgentMode();
  const { t } = useLocalization();
  
  // 将 mode 映射到 persona
  const persona = getPersonaFromMode(mode);
  const tabs = PERSONA_MOBILE_BOTTOM_TABS[persona] || PERSONA_MOBILE_BOTTOM_TABS.personal;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 safe-area-inset-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id as L1Tab)}
              className={`flex flex-col items-center justify-center flex-1 h-full px-1 transition-all ${
                isActive 
                  ? 'text-blue-400' 
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <div className={`relative ${isActive ? 'scale-110' : ''} transition-transform`}>
                <Icon className="w-5 h-5" />
                {isActive && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-400" />
                )}
              </div>
              <span className={`text-[10px] mt-1 font-medium ${isActive ? 'text-blue-400' : ''}`}>
                {t(tab.label)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default MobileBottomNav;
