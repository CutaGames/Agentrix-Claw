const fs = require('fs');
let code = fs.readFileSync('src/stores/settingsStore.ts', 'utf8');

// add type
if (!code.includes('customApiKeys: Record<string, string>;')) {
  code = code.replace(/interface SettingsState \{/, "interface SettingsState {\n  customApiKeys: Record<string, string>;\n  setCustomApiKey: (provider: string, key: string) => void;");
}

// add default state
if (!code.includes('customApiKeys: {},')) {
  code = code.replace(/selectedModelId: 'claude-3-5-haiku',/, "selectedModelId: 'claude-3-5-haiku',\n      customApiKeys: {},\n");
}

// add setter
if (!code.includes('setCustomApiKey: (provider, key)')) {
  code = code.replace(/setAgentSetting:/, "setCustomApiKey: (provider, key) => set((state) => ({ customApiKeys: { ...state.customApiKeys, [provider]: key } })),\n      setAgentSetting:");
}

fs.writeFileSync('src/stores/settingsStore.ts', code);
