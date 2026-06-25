import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'agentrix',
  password: process.env.DB_PASSWORD || 'agentrix',
  database: process.env.DB_DATABASE || 'agentrix',
  synchronize: false,
  logging: false,
});

async function checkTables() {
  try {
    await AppDataSource.initialize();
    console.log('Data Source has been initialized!');

    const tablesToCheck = [
      'users',
      'wallet_connections',
      'transaction_routes',
      'risk_assessments',
      'strategy_graphs',
      'strategy_nodes',
      'agent_authorizations',
      'atomic_settlements',
      'smart_splits',
      'batch_executions',
      'budgets',
      'subscriptions',
      'transaction_classifications',
      'merchant_trust_scores',
      'kyc_reuse_records',
      'auto_earn_tasks',
      'auto_earn_logs',
      'agent_permissions',
      'agent_usage_logs',
      'agent_wallets',
      'ecommerce_connections',
      'fund_paths',
      'mpc_wallets',
      'agent_memory',
      'agent_workflow',
      'agent_sessions',
      'agent_messages',
      'merchant_referrals',
      'referral_commissions',
      'coupons',
      'orders',
      'tokens',
      'nfts',
      'agent_templates',
      'user_agents',
      'social_accounts',
      'products',
      'payments',
      'product_sync_mappings',
      'merchant_profiles',
      'api_keys',
      'risk_assessments',
      'product_reviews',
      'auto_pay_grants'
    ];

    for (const table of tablesToCheck) {
      const result = await AppDataSource.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '${table}')`
      );
      console.log(`Table ${table}: ${result[0].exists ? 'EXISTS' : 'MISSING'}`);
    }

    await AppDataSource.destroy();
  } catch (err) {
    console.error('Error during Data Source initialization', err);
  }
}

checkTables();
