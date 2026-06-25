const fs = require('fs');
let code = fs.readFileSync('src/screens/agent/AgentConsoleScreen.tsx', 'utf8');
code = code.replace(/const available = SUPPORTED_MODELS[\s\S]*?;\s*\}\)/g, 'setShowEngineModal(true)}');
fs.writeFileSync('src/screens/agent/AgentConsoleScreen.tsx', code);
