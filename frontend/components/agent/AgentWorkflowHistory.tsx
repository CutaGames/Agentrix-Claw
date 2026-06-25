import { useState } from 'react';

interface WorkflowStep {
  id: string;
  type: 'intent' | 'action' | 'decision' | 'api_call' | 'result';
  title: string;
  description: string;
  timestamp: Date;
  data?: any;
}

interface AgentWorkflowHistoryProps {
  workflow: WorkflowStep[];
  expanded?: boolean;
}

export function AgentWorkflowHistory({ workflow, expanded = false }: AgentWorkflowHistoryProps) {
  const [isExpanded, setIsExpanded] = useState(expanded);

  if (!workflow || workflow.length === 0) return null;

  const getStepIcon = (type: string) => {
    switch (type) {
      case 'intent':
        return '🧠';
      case 'action':
        return '⚡';
      case 'decision':
        return '🎯';
      case 'api_call':
        return '🔌';
      case 'result':
        return '✅';
      default:
        return '📝';
    }
  };

  const getStepColor = (type: string) => {
    switch (type) {
      case 'intent':
        return 'text-purple-600 bg-purple-50 border-purple-200';
      case 'action':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'decision':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'api_call':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'result':
        return 'text-gray-600 bg-gray-50 border-gray-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="mt-4 border-t border-gray-200 pt-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full text-left text-sm text-gray-600 hover:text-gray-900"
      >
        <span className="flex items-center space-x-2">
          <span>🔍</span>
          <span>Agent 工作流记录</span>
          <span className="text-xs text-gray-400">({workflow.length} 步)</span>
        </span>
        <span className="text-gray-400">{isExpanded ? '▼' : '▶'}</span>
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-2">
          {workflow.map((step, index) => (
            <div
              key={step.id}
              className={`p-3 rounded-lg border ${getStepColor(step.type)}`}
            >
              <div className="flex items-start space-x-3">
                <span className="text-lg flex-shrink-0">{getStepIcon(step.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h5 className="text-sm font-medium">{step.title}</h5>
                    <span className="text-xs text-gray-500">
                      {step.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{step.description}</p>
                  {step.data && (
                    <details className="mt-2">
                      <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                        查看详情
                      </summary>
                      <pre className="mt-2 text-xs bg-white/50 p-2 rounded overflow-x-auto">
                        {JSON.stringify(step.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

