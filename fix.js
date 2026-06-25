const fs = require('fs');
let code = fs.readFileSync('src/screens/agent/AgentConsoleScreen.tsx', 'utf8');

// 1. Add import
if (!code.includes('SelectEngineModal')) {
  code = code.replace(/import \{ switchInstanceModel/, "import { SelectEngineModal } from '../../components/SelectEngineModal';\nimport { switchInstanceModel");
}

// 2. Add state
code = code.replace(/const activeInstance = useAuthStore[^\n]*\n/, "const activeInstance = useAuthStore((s) => s.activeInstance);\n  const [showEngineModal, setShowEngineModal] = useState(false);\n");

// 3. Replace onPress
const after = `onPress={() => setShowEngineModal(true)}`;
code = code.replace(/onPress=\{\(\) => \{\s*const available = SUPPORTED_MODELS\.filter[\s\S]*?Cancel', style: 'cancel' as const \},\s*\]\);\s*\}\}/, after);

// 4. Add modal at end
if (!code.includes('<SelectEngineModal')) {
  code = code.replace(/<\/View>\s*\n\s*\);\s*\n\s*\}/, `
      <SelectEngineModal 
        visible={showEngineModal} 
        onClose={() => setShowEngineModal(false)}
        selectedModelId={selectedModelId}
        onSelect={async (id) => {
          setSelectedModel(id);
          if (activeInstance?.id) {
            try { await switchInstanceModel(activeInstance.id, id); } catch (_) {}
          }
        }}
      />
    </View>
  );
}`);
}

fs.writeFileSync('src/screens/agent/AgentConsoleScreen.tsx', code);
