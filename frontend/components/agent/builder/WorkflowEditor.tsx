import { useState, useCallback, useMemo } from 'react';
import { useLocalization } from '../../../contexts/LocalizationContext';

/**
 * 工作流节点类型
 */
export type WorkflowNodeType = 
  | 'intent'      // 意图节点：触发条件
  | 'action'      // 操作节点：执行操作
  | 'decision'    // 决策节点：条件判断
  | 'wait'        // 等待节点：等待时间/事件
  | 'loop'        // 循环节点：循环执行
  | 'webhook'     // Webhook节点：接收Webhook
  | 'notify';     // 通知节点：发送通知

/**
 * 工作流节点
 */
export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position: { x: number; y: number };
  data: {
    label: string;
    config: Record<string, any>;
  };
}

/**
 * 工作流连接
 */
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  condition?: string; // 条件：success, error, timeout等
}

/**
 * 工作流定义
 */
export interface WorkflowDefinition {
  version: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

interface WorkflowEditorProps {
  workflow?: WorkflowDefinition;
  onWorkflowChange?: (workflow: WorkflowDefinition) => void;
  onSave?: (workflow: WorkflowDefinition) => void;
  capabilities?: string[]; // 从表单模式导入的能力列表
  onImportFromCapabilities?: (capabilities: string[]) => WorkflowDefinition; // 导入函数
}

/**
 * 可视化工作流编辑器
 * 使用简化的实现，后续可以集成React Flow
 */
export function WorkflowEditor({
  workflow: initialWorkflow,
  onWorkflowChange,
  onSave,
  capabilities = [],
  onImportFromCapabilities,
}: WorkflowEditorProps) {
  const { t } = useLocalization();
  const [workflow, setWorkflow] = useState<WorkflowDefinition>(
    initialWorkflow || {
      version: '1.0',
      nodes: [],
      edges: [],
    }
  );
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showNodePalette, setShowNodePalette] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  // 节点类型配置
  const nodeTypes = useMemo(() => ({
    intent: {
      label: t({ zh: '意图', en: 'Intent' }),
      icon: '🎯',
      color: 'bg-blue-500',
      description: t({ zh: '触发条件：对话、时间、Webhook、API', en: 'Trigger: Message, Time, Webhook, API' }),
    },
    action: {
      label: t({ zh: '操作', en: 'Action' }),
      icon: '⚡',
      color: 'bg-green-500',
      description: t({ zh: '执行操作：调用API、脚本、支付', en: 'Execute: API call, script, payment' }),
    },
    decision: {
      label: t({ zh: '决策', en: 'Decision' }),
      icon: '🔀',
      color: 'bg-yellow-500',
      description: t({ zh: '条件判断：if/else', en: 'Condition: if/else' }),
    },
    wait: {
      label: t({ zh: '等待', en: 'Wait' }),
      icon: '⏳',
      color: 'bg-purple-500',
      description: t({ zh: '等待：时间、事件', en: 'Wait: time, event' }),
    },
    loop: {
      label: t({ zh: '循环', en: 'Loop' }),
      icon: '🔄',
      color: 'bg-orange-500',
      description: t({ zh: '循环执行', en: 'Loop execution' }),
    },
    webhook: {
      label: t({ zh: 'Webhook', en: 'Webhook' }),
      icon: '🔗',
      color: 'bg-pink-500',
      description: t({ zh: '接收Webhook', en: 'Receive webhook' }),
    },
    notify: {
      label: t({ zh: '通知', en: 'Notify' }),
      icon: '📢',
      color: 'bg-indigo-500',
      description: t({ zh: '发送通知', en: 'Send notification' }),
    },
  }), [t]);

  // 添加节点
  const handleAddNode = useCallback((type: WorkflowNodeType) => {
    const newNode: WorkflowNode = {
      id: `node_${Date.now()}`,
      type,
      position: {
        x: Math.random() * 400 + 100,
        y: Math.random() * 300 + 100,
      },
      data: {
        label: nodeTypes[type].label,
        config: {},
      },
    };

    const newWorkflow = {
      ...workflow,
      nodes: [...workflow.nodes, newNode],
    };

    setWorkflow(newWorkflow);
    onWorkflowChange?.(newWorkflow);
    setShowNodePalette(false);
  }, [workflow, nodeTypes, onWorkflowChange]);

  // 删除节点
  const handleDeleteNode = useCallback((nodeId: string) => {
    const newWorkflow = {
      ...workflow,
      nodes: workflow.nodes.filter(n => n.id !== nodeId),
      edges: workflow.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
    };

    setWorkflow(newWorkflow);
    onWorkflowChange?.(newWorkflow);
    if (selectedNode === nodeId) {
      setSelectedNode(null);
    }
  }, [workflow, selectedNode, onWorkflowChange]);

  // 更新节点配置
  const handleUpdateNodeConfig = useCallback((nodeId: string, config: Record<string, any>) => {
    const newWorkflow = {
      ...workflow,
      nodes: workflow.nodes.map(n => 
        n.id === nodeId 
          ? { ...n, data: { ...n.data, config } }
          : n
      ),
    };

    setWorkflow(newWorkflow);
    onWorkflowChange?.(newWorkflow);
  }, [workflow, onWorkflowChange]);

  // 添加连接
  const handleAddEdge = useCallback((source: string, target: string, condition?: string) => {
    const newEdge: WorkflowEdge = {
      id: `edge_${Date.now()}`,
      source,
      target,
      condition,
    };

    const newWorkflow = {
      ...workflow,
      edges: [...workflow.edges, newEdge],
    };

    setWorkflow(newWorkflow);
    onWorkflowChange?.(newWorkflow);
  }, [workflow, onWorkflowChange]);

  // 从能力列表导入工作流
  const handleImportFromCapabilities = useCallback(() => {
    if (capabilities.length === 0) {
      return;
    }

    if (onImportFromCapabilities) {
      const importedWorkflow = onImportFromCapabilities(capabilities);
      setWorkflow(importedWorkflow);
      onWorkflowChange?.(importedWorkflow);
      return;
    }

    // 默认导入逻辑：为每个能力创建一个 Action 节点
    const importedNodes: WorkflowNode[] = capabilities.map((cap, index) => ({
      id: `imported_${cap}_${index}`,
      type: 'action',
      position: {
        x: 100 + (index % 3) * 200,
        y: 100 + Math.floor(index / 3) * 150,
      },
      data: {
        label: cap,
        config: {
          actionType: 'capability',
          capabilityId: cap,
        },
      },
    }));

    // 创建连接
    const importedEdges: WorkflowEdge[] = [];
    for (let i = 0; i < importedNodes.length - 1; i++) {
      importedEdges.push({
        id: `edge_${i}`,
        source: importedNodes[i].id,
        target: importedNodes[i + 1].id,
        condition: 'success',
      });
    }

    const importedWorkflow: WorkflowDefinition = {
      version: '1.0',
      nodes: importedNodes,
      edges: importedEdges,
    };

    setWorkflow(importedWorkflow);
    onWorkflowChange?.(importedWorkflow);
  }, [capabilities, onImportFromCapabilities, onWorkflowChange]);

  // 验证工作流
  const validateWorkflow = useCallback(() => {
    const errors: string[] = [];

    // 检查是否有节点
    if (workflow.nodes.length === 0) {
      errors.push(t({ zh: '工作流至少需要一个节点', en: 'Workflow needs at least one node' }));
    }

    // 检查是否有孤立节点（没有连接的节点）
    const connectedNodeIds = new Set<string>();
    workflow.edges.forEach((edge) => {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    });

    workflow.nodes.forEach((node) => {
      if (!connectedNodeIds.has(node.id) && workflow.nodes.length > 1) {
        errors.push(
          t({
            zh: `节点 "${node.data.label}" 未连接到其他节点`,
            en: `Node "${node.data.label}" is not connected to other nodes`,
          })
        );
      }
    });

    // 检查是否有循环依赖（简单检查）
    const hasCycle = workflow.edges.some((edge) => {
      const visited = new Set<string>();
      let current = edge.source;
      while (current) {
        if (visited.has(current)) {
          return true;
        }
        visited.add(current);
        const nextEdge = workflow.edges.find((e) => e.source === current);
        current = nextEdge?.target || '';
      }
      return false;
    });

    if (hasCycle) {
      errors.push(t({ zh: '检测到循环依赖', en: 'Circular dependency detected' }));
    }

    setValidationErrors(errors);
    return errors.length === 0;
  }, [workflow, t]);

  // 保存工作流（带验证）
  const handleSave = useCallback(() => {
    if (validateWorkflow()) {
      onSave?.(workflow);
    } else {
      // 显示验证错误
      console.error('Validation errors:', validationErrors);
    }
  }, [workflow, onSave, validateWorkflow, validationErrors]);

  return (
    <div className="h-full flex flex-col bg-neutral-900">
      {/* 工具栏 */}
      <div className="p-4 border-b border-neutral-800 bg-neutral-950">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowNodePalette(!showNodePalette)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {t({ zh: '+ 添加节点', en: '+ Add Node' })}
            </button>
            {capabilities.length > 0 && (
              <button
                onClick={handleImportFromCapabilities}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                title={t({
                  zh: '从表单模式导入能力',
                  en: 'Import capabilities from form mode',
                })}
              >
                {t({ zh: '📥 导入能力', en: '📥 Import Capabilities' })}
              </button>
            )}
            <button
              onClick={validateWorkflow}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
            >
              {t({ zh: '验证工作流', en: 'Validate Workflow' })}
            </button>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              {t({ zh: '预览', en: 'Preview' })}
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              {t({ zh: '保存工作流', en: 'Save Workflow' })}
            </button>
          </div>
          <div className="text-sm text-neutral-400">
            {t({ zh: `节点数: ${workflow.nodes.length}`, en: `Nodes: ${workflow.nodes.length}` })}
          </div>
        </div>
        {/* 验证错误提示 */}
        {validationErrors.length > 0 && (
          <div className="mt-2 p-2 bg-red-900/50 border border-red-700 rounded text-sm text-red-200">
            <div className="font-semibold mb-1">{t({ zh: '验证错误', en: 'Validation Errors' })}:</div>
            <ul className="list-disc list-inside space-y-1">
              {validationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 节点面板 */}
        {showNodePalette && (
          <div className="w-64 border-r border-neutral-800 bg-neutral-950 overflow-y-auto">
            <div className="p-4">
              <h3 className="text-sm font-semibold text-white mb-4">
                {t({ zh: '节点类型', en: 'Node Types' })}
              </h3>
              <div className="space-y-2">
                {Object.entries(nodeTypes).map(([type, config]) => (
                  <button
                    key={type}
                    onClick={() => handleAddNode(type as WorkflowNodeType)}
                    className="w-full p-3 text-left bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{config.icon}</span>
                      <span className="text-white font-medium">{config.label}</span>
                    </div>
                    <p className="text-xs text-neutral-400">{config.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 画布区域 */}
        <div className="flex-1 relative bg-neutral-900 overflow-auto">
          {workflow.nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-neutral-400 mb-4">
                  {t({ zh: '点击"添加节点"开始构建工作流', en: 'Click "Add Node" to start building workflow' })}
                </p>
                <button
                  onClick={() => setShowNodePalette(true)}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {t({ zh: '添加第一个节点', en: 'Add First Node' })}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8">
              <div className="relative" style={{ minWidth: '800px', minHeight: '600px' }}>
                {/* 简化的节点渲染（后续可以集成React Flow） */}
                {workflow.nodes.map((node) => (
                  <div
                    key={node.id}
                    className={`absolute p-4 rounded-lg border-2 cursor-move ${
                      selectedNode === node.id 
                        ? 'border-blue-500 bg-blue-500/10' 
                        : 'border-neutral-700 bg-neutral-800'
                    }`}
                    style={{
                      left: `${node.position.x}px`,
                      top: `${node.position.y}px`,
                      minWidth: '150px',
                    }}
                    onClick={() => setSelectedNode(node.id)}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{nodeTypes[node.type].icon}</span>
                      <span className="text-white font-medium">{node.data.label}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteNode(node.id);
                        }}
                        className="ml-auto text-red-400 hover:text-red-300"
                      >
                        ×
                      </button>
                    </div>
                    <div className="text-xs text-neutral-400">
                      {nodeTypes[node.type].description}
                    </div>
                  </div>
                ))}

                {/* 简化的连接线渲染 */}
                {workflow.edges.map((edge) => {
                  const sourceNode = workflow.nodes.find(n => n.id === edge.source);
                  const targetNode = workflow.nodes.find(n => n.id === edge.target);
                  if (!sourceNode || !targetNode) return null;

                  return (
                    <svg
                      key={edge.id}
                      className="absolute pointer-events-none"
                      style={{
                        left: 0,
                        top: 0,
                        width: '100%',
                        height: '100%',
                        zIndex: 0,
                      }}
                    >
                      <line
                        x1={sourceNode.position.x + 75}
                        y1={sourceNode.position.y + 50}
                        x2={targetNode.position.x + 75}
                        y2={targetNode.position.y + 50}
                        stroke="#4B5563"
                        strokeWidth="2"
                        markerEnd="url(#arrowhead)"
                      />
                      <defs>
                        <marker
                          id="arrowhead"
                          markerWidth="10"
                          markerHeight="10"
                          refX="9"
                          refY="3"
                          orient="auto"
                        >
                          <polygon points="0 0, 10 3, 0 6" fill="#4B5563" />
                        </marker>
                      </defs>
                    </svg>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 预览面板 */}
        {showPreview && (
          <div className="w-80 border-l border-neutral-800 bg-neutral-950 overflow-y-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">
                  {t({ zh: '工作流预览', en: 'Workflow Preview' })}
                </h3>
                <button
                  onClick={() => setShowPreview(false)}
                  className="text-neutral-400 hover:text-white"
                >
                  ×
                </button>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-neutral-400 mb-2">
                  {t({ zh: '执行顺序', en: 'Execution Order' })}:
                </div>
                {workflow.nodes.map((node, index) => (
                  <div
                    key={node.id}
                    className="p-2 bg-neutral-800 rounded text-sm text-white"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-400">{index + 1}.</span>
                      <span>{nodeTypes[node.type].icon}</span>
                      <span>{node.data.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 配置面板 */}
        {selectedNode && !showPreview && (
          <div className="w-80 border-l border-neutral-800 bg-neutral-950 overflow-y-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">
                  {t({ zh: '节点配置', en: 'Node Configuration' })}
                </h3>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-neutral-400 hover:text-white"
                >
                  ×
                </button>
              </div>
              <NodeConfigPanel
                node={workflow.nodes.find(n => n.id === selectedNode)!}
                nodeTypes={nodeTypes}
                onUpdate={(config) => handleUpdateNodeConfig(selectedNode, config)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 节点配置面板
 */
interface NodeConfigPanelProps {
  node: WorkflowNode;
  nodeTypes: Record<string, any>;
  onUpdate: (config: Record<string, any>) => void;
}

function NodeConfigPanel({ node, nodeTypes, onUpdate }: NodeConfigPanelProps) {
  const { t } = useLocalization();
  const [config, setConfig] = useState<Record<string, any>>(node.data.config);

  const handleConfigChange = (key: string, value: any) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    onUpdate(newConfig);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-neutral-400 mb-2">
          {t({ zh: '节点类型', en: 'Node Type' })}
        </label>
        <div className="p-2 bg-neutral-800 rounded text-sm text-white">
          {nodeTypes[node.type].label}
        </div>
      </div>

      {node.type === 'intent' && (
        <>
          <div>
            <label className="block text-xs text-neutral-400 mb-2">
              {t({ zh: '触发类型', en: 'Trigger Type' })}
            </label>
            <select
              value={config.triggerType || 'message'}
              onChange={(e) => handleConfigChange('triggerType', e.target.value)}
              className="w-full p-2 bg-neutral-800 text-white rounded text-sm"
            >
              <option value="message">{t({ zh: '消息', en: 'Message' })}</option>
              <option value="time">{t({ zh: '时间', en: 'Time' })}</option>
              <option value="webhook">{t({ zh: 'Webhook', en: 'Webhook' })}</option>
              <option value="api">{t({ zh: 'API', en: 'API' })}</option>
            </select>
          </div>
          {config.triggerType === 'message' && (
            <div>
              <label className="block text-xs text-neutral-400 mb-2">
                {t({ zh: '匹配模式', en: 'Pattern' })}
              </label>
              <input
                type="text"
                value={config.pattern || ''}
                onChange={(e) => handleConfigChange('pattern', e.target.value)}
                placeholder={t({ zh: '例如：帮我搜索*', en: 'e.g., help me search *' })}
                className="w-full p-2 bg-neutral-800 text-white rounded text-sm"
              />
            </div>
          )}
        </>
      )}

      {node.type === 'action' && (
        <>
          <div>
            <label className="block text-xs text-neutral-400 mb-2">
              {t({ zh: '操作类型', en: 'Action Type' })}
            </label>
            <select
              value={config.actionType || 'api'}
              onChange={(e) => handleConfigChange('actionType', e.target.value)}
              className="w-full p-2 bg-neutral-800 text-white rounded text-sm"
            >
              <option value="api">{t({ zh: 'API调用', en: 'API Call' })}</option>
              <option value="script">{t({ zh: '脚本', en: 'Script' })}</option>
              <option value="payment">{t({ zh: '支付', en: 'Payment' })}</option>
            </select>
          </div>
          {config.actionType === 'api' && (
            <div>
              <label className="block text-xs text-neutral-400 mb-2">
                {t({ zh: 'API端点', en: 'API Endpoint' })}
              </label>
              <input
                type="text"
                value={config.endpoint || ''}
                onChange={(e) => handleConfigChange('endpoint', e.target.value)}
                placeholder="/api/agent/chat"
                className="w-full p-2 bg-neutral-800 text-white rounded text-sm"
              />
            </div>
          )}
        </>
      )}

      {node.type === 'decision' && (
        <div>
          <label className="block text-xs text-neutral-400 mb-2">
            {t({ zh: '条件表达式', en: 'Condition' })}
          </label>
          <input
            type="text"
            value={config.condition || ''}
            onChange={(e) => handleConfigChange('condition', e.target.value)}
            placeholder="amount > 100"
            className="w-full p-2 bg-neutral-800 text-white rounded text-sm"
          />
        </div>
      )}

      {node.type === 'wait' && (
        <div>
          <label className="block text-xs text-neutral-400 mb-2">
            {t({ zh: '等待时间（秒）', en: 'Wait Time (seconds)' })}
          </label>
          <input
            type="number"
            value={config.waitTime || 0}
            onChange={(e) => handleConfigChange('waitTime', Number(e.target.value))}
            className="w-full p-2 bg-neutral-800 text-white rounded text-sm"
          />
        </div>
      )}

      <div>
        <label className="block text-xs text-neutral-400 mb-2">
          {t({ zh: '超时时间（秒）', en: 'Timeout (seconds)' })}
        </label>
        <input
          type="number"
          value={config.timeout || 30}
          onChange={(e) => handleConfigChange('timeout', Number(e.target.value))}
          className="w-full p-2 bg-neutral-800 text-white rounded text-sm"
        />
      </div>

      <div>
        <label className="block text-xs text-neutral-400 mb-2">
          {t({ zh: '重试次数', en: 'Retry Count' })}
        </label>
        <input
          type="number"
          value={config.retryCount || 0}
          onChange={(e) => handleConfigChange('retryCount', Number(e.target.value))}
          className="w-full p-2 bg-neutral-800 text-white rounded text-sm"
        />
      </div>
    </div>
  );
}

