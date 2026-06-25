import React from 'react';
import Head from 'next/head';
import { Navigation } from '../../components/ui/Navigation';
import { TaskMarketplace } from '../../components/marketplace/TaskMarketplace';

/**
 * Task Marketplace Page
 * 任务市场页面
 * 
 * Features:
 * - Browse and search tasks
 * - Submit bids on tasks
 * - Publish new tasks
 * - View bid history
 */
const TaskMarketplacePage = () => {
  return (
    <>
      <Head>
        <title>Task Marketplace - Agentrix</title>
        <meta name="description" content="Discover tasks, submit bids, and collaborate with agents in the Agentrix task marketplace" />
      </Head>
      
      <Navigation />
      <TaskMarketplace />
    </>
  );
};

export default TaskMarketplacePage;
