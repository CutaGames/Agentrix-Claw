import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixAllRemainingColumnNaming1774900000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('🔧 Starting comprehensive column naming fix migration...');

    // 定义需要修复的表和列映射
    const tableColumnMappings: Record<string, Array<{ old: string; new: string }>> = {
      audit_logs: [
        { old: 'userId', new: 'user_id' },
        { old: 'agentId', new: 'agent_id' },
        { old: 'sessionId', new: 'session_id' },
        { old: 'actionType', new: 'action_type' },
        { old: 'targetType', new: 'target_type' },
        { old: 'targetId', new: 'target_id' },
        { old: 'ipAddress', new: 'ip_address' },
        { old: 'userAgent', new: 'user_agent' },
        { old: 'createdAt', new: 'created_at' },
      ],
      agent_sessions: [
        { old: 'userId', new: 'user_id' },
        { old: 'agentId', new: 'agent_id' },
        { old: 'sessionId', new: 'session_id' },
        { old: 'templateId', new: 'template_id' },
        { old: 'createdAt', new: 'created_at' },
        { old: 'updatedAt', new: 'updated_at' },
        { old: 'lastMessageAt', new: 'last_message_at' },
        { old: 'messageCount', new: 'message_count' },
        { old: 'isActive', new: 'is_active' },
      ],
      agent_stats: [
        { old: 'agentId', new: 'agent_id' },
        { old: 'userId', new: 'user_id' },
        { old: 'totalMessages', new: 'total_messages' },
        { old: 'totalSessions', new: 'total_sessions' },
        { old: 'totalTokens', new: 'total_tokens' },
        { old: 'totalCost', new: 'total_cost' },
        { old: 'averageResponseTime', new: 'average_response_time' },
        { old: 'successRate', new: 'success_rate' },
        { old: 'lastActiveAt', new: 'last_active_at' },
        { old: 'createdAt', new: 'created_at' },
        { old: 'updatedAt', new: 'updated_at' },
      ],
      commissions: [
        { old: 'paymentId', new: 'payment_id' },
        { old: 'payeeId', new: 'payee_id' },
        { old: 'payeeType', new: 'payee_type' },
        { old: 'payerId', new: 'payer_id' },
        { old: 'orderId', new: 'order_id' },
        { old: 'productId', new: 'product_id' },
        { old: 'createdAt', new: 'created_at' },
        { old: 'updatedAt', new: 'updated_at' },
        { old: 'processedAt', new: 'processed_at' },
        { old: 'paidAt', new: 'paid_at' },
        { old: 'settlementId', new: 'settlement_id' },
        { old: 'settlementStatus', new: 'settlement_status' },
        { old: 'rateSnapshot', new: 'rate_snapshot' },
      ],
      market_monitors: [
        { old: 'userId', new: 'user_id' },
        { old: 'strategyGraphId', new: 'strategy_graph_id' },
        { old: 'targetPrice', new: 'target_price' },
        { old: 'currentPrice', new: 'current_price' },
        { old: 'priceDirection', new: 'price_direction' },
        { old: 'tokenSymbol', new: 'token_symbol' },
        { old: 'tokenAddress', new: 'token_address' },
        { old: 'isActive', new: 'is_active' },
        { old: 'lastCheckedAt', new: 'last_checked_at' },
        { old: 'triggeredAt', new: 'triggered_at' },
        { old: 'createdAt', new: 'created_at' },
        { old: 'updatedAt', new: 'updated_at' },
      ],
      agent_messages: [
        { old: 'sessionId', new: 'session_id' },
        { old: 'userId', new: 'user_id' },
        { old: 'agentId', new: 'agent_id' },
        { old: 'messageType', new: 'message_type' },
        { old: 'tokenCount', new: 'token_count' },
        { old: 'processingTime', new: 'processing_time' },
        { old: 'createdAt', new: 'created_at' },
      ],
      transactions: [
        { old: 'userId', new: 'user_id' },
        { old: 'accountId', new: 'account_id' },
        { old: 'orderId', new: 'order_id' },
        { old: 'transactionType', new: 'transaction_type' },
        { old: 'balanceBefore', new: 'balance_before' },
        { old: 'balanceAfter', new: 'balance_after' },
        { old: 'referenceId', new: 'reference_id' },
        { old: 'referenceType', new: 'reference_type' },
        { old: 'createdAt', new: 'created_at' },
        { old: 'completedAt', new: 'completed_at' },
      ],
      payments: [
        { old: 'userId', new: 'user_id' },
        { old: 'orderId', new: 'order_id' },
        { old: 'paymentMethod', new: 'payment_method' },
        { old: 'paymentProvider', new: 'payment_provider' },
        { old: 'externalId', new: 'external_id' },
        { old: 'feeAmount', new: 'fee_amount' },
        { old: 'netAmount', new: 'net_amount' },
        { old: 'txHash', new: 'tx_hash' },
        { old: 'walletAddress', new: 'wallet_address' },
        { old: 'webhookData', new: 'webhook_data' },
        { old: 'createdAt', new: 'created_at' },
        { old: 'updatedAt', new: 'updated_at' },
        { old: 'confirmedAt', new: 'confirmed_at' },
        { old: 'failedAt', new: 'failed_at' },
        { old: 'failureReason', new: 'failure_reason' },
      ],
    };

    for (const [tableName, columns] of Object.entries(tableColumnMappings)) {
      // 检查表是否存在
      const tableExists = await queryRunner.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1
        )
      `, [tableName]);

      if (!tableExists[0].exists) {
        console.log(`  ⚠️ Table ${tableName} does not exist, skipping...`);
        continue;
      }

      // 获取现有列
      const existingColumns = await queryRunner.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
      `, [tableName]);
      const columnNames = existingColumns.map((c: any) => c.column_name);

      console.log(`  📋 Processing ${tableName}...`);

      for (const col of columns) {
        if (columnNames.includes(col.old) && !columnNames.includes(col.new)) {
          try {
            await queryRunner.query(`
              ALTER TABLE "${tableName}" RENAME COLUMN "${col.old}" TO "${col.new}"
            `);
            console.log(`    ✅ ${tableName}: ${col.old} -> ${col.new}`);
          } catch (error) {
            console.log(`    ⚠️ ${tableName}: Failed to rename ${col.old}: ${(error as Error).message}`);
          }
        } else if (columnNames.includes(col.new)) {
          // 新列已存在，跳过
        } else if (!columnNames.includes(col.old) && !columnNames.includes(col.new)) {
          // 两个列都不存在，可能需要添加
        }
      }
    }

    console.log('✅ Comprehensive column naming fix complete');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('Skipping down migration - column renames are permanent');
  }
}
