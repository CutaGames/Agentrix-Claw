/**
 * A2A MCP Tool Definitions
 * 
 * Agent-to-Agent task management tools exposed via MCP protocol.
 * Enables agents to delegate tasks, track status, deliver results,
 * review quality, and query reputation scores.
 */

export const a2aMcpTools = [
  {
    name: 'a2a_create_task',
    description: 'Delegate a task to another agent (Agent-to-Agent). Creates a task with optional payment mandate, budget pool, deadline, and webhook callback. 委托任务给另一个Agent，支持付款授权、预算池、截止日期和回调。',
    inputSchema: {
      type: 'object',
      properties: {
        requester_agent_id: { type: 'string', description: 'ID of the agent requesting the task' },
        target_agent_id: { type: 'string', description: 'ID of the agent to execute the task' },
        title: { type: 'string', description: 'Task title / summary' },
        description: { type: 'string', description: 'Detailed task description or prompt' },
        task_type: { type: 'string', description: 'Task category (e.g. "code_review", "translation", "design")' },
        params: { type: 'object', description: 'Additional input parameters for the task' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], description: 'Task priority', default: 'normal' },
        max_price: { type: 'number', description: 'Maximum price willing to pay (micro units)' },
        currency: { type: 'string', description: 'Payment currency', default: 'USDC' },
        mandate_id: { type: 'string', description: 'AP2 mandate ID for autonomous payment' },
        budget_pool_id: { type: 'string', description: 'Budget pool ID to fund from' },
        skill_id: { type: 'string', description: 'Marketplace skill ID if applicable' },
        deadline: { type: 'string', description: 'ISO 8601 deadline for task completion' },
        callback: {
          type: 'object',
          description: 'Webhook callback configuration',
          properties: {
            url: { type: 'string', description: 'Webhook URL' },
            events: { type: 'array', items: { type: 'string' }, description: 'Events to subscribe to (e.g. accepted, delivered, completed)' },
            secret: { type: 'string', description: 'HMAC signing secret' },
          },
        },
        parent_task_id: { type: 'string', description: 'Parent task ID for sub-task chains (DAG orchestration)' },
        metadata: { type: 'object', description: 'Additional metadata' },
      },
      required: ['requester_agent_id', 'target_agent_id', 'title'],
    },
  },
  {
    name: 'a2a_get_task',
    description: 'Get details of an A2A task by ID. Returns status, deliverables, quality score, and timeline. 获取A2A任务详情。',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to query' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'a2a_list_tasks',
    description: 'List A2A tasks with filters. Filter by agent, role (requester/target), status, and task type. 列出A2A任务，支持按Agent、角色、状态筛选。',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Filter by agent ID' },
        role: { type: 'string', enum: ['requester', 'target'], description: 'Filter by role' },
        status: { type: 'string', description: 'Filter by status (comma-separated for multiple)' },
        task_type: { type: 'string', description: 'Filter by task type' },
        page: { type: 'number', description: 'Page number', default: 1 },
        limit: { type: 'number', description: 'Results per page', default: 20 },
      },
      required: [],
    },
  },
  {
    name: 'a2a_accept_task',
    description: 'Accept an A2A task as the target agent. Optionally propose an agreed price. 作为目标Agent接受任务。',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to accept' },
        agent_id: { type: 'string', description: 'Your agent ID (must be the target agent)' },
        agreed_price: { type: 'number', description: 'Agreed price for the task (micro units)' },
        message: { type: 'string', description: 'Acceptance message' },
      },
      required: ['task_id', 'agent_id'],
    },
  },
  {
    name: 'a2a_deliver_task',
    description: 'Submit deliverables for an A2A task. Attach text, JSON, code, files, or URLs as deliverables. 提交A2A任务交付物。',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID' },
        agent_id: { type: 'string', description: 'Your agent ID (must be the target agent)' },
        deliverables: {
          type: 'array',
          description: 'Array of deliverables',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['text', 'json', 'file', 'url', 'code'], description: 'Deliverable type' },
              content: { type: 'string', description: 'Deliverable content' },
              metadata: { type: 'object', description: 'Optional metadata' },
            },
            required: ['type', 'content'],
          },
        },
        message: { type: 'string', description: 'Delivery message' },
      },
      required: ['task_id', 'agent_id', 'deliverables'],
    },
  },
  {
    name: 'a2a_review_task',
    description: 'Review and approve/reject A2A task deliverables. Supports manual review or automatic quality assessment with configurable threshold. 审核A2A任务交付物，支持手动或自动质量评估。',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to review' },
        agent_id: { type: 'string', description: 'Your agent ID (must be the requester agent)' },
        approved: { type: 'boolean', description: 'true = approve, false = reject' },
        quality_score: { type: 'number', description: 'Quality score 0-100' },
        comment: { type: 'string', description: 'Review comment' },
        auto_assess: { type: 'boolean', description: 'Set true to use automatic quality assessment instead of manual review' },
        threshold: { type: 'number', description: 'Auto-approve threshold (default 70)', default: 70 },
        criteria: {
          type: 'array',
          description: 'Detailed scoring criteria',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              score: { type: 'number' },
              weight: { type: 'number' },
              comment: { type: 'string' },
            },
          },
        },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'a2a_cancel_task',
    description: 'Cancel an A2A task. Can be called by either requester or target agent. 取消A2A任务。',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to cancel' },
        agent_id: { type: 'string', description: 'Your agent ID' },
        reason: { type: 'string', description: 'Cancellation reason' },
      },
      required: ['task_id', 'agent_id'],
    },
  },
  {
    name: 'a2a_get_reputation',
    description: 'Get agent reputation score and performance metrics. Returns overall score, tier, task stats, quality average, response time, and on-time rate. 获取Agent信誉评分和绩效指标。',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent ID to query reputation for' },
      },
      required: ['agent_id'],
    },
  },
];
