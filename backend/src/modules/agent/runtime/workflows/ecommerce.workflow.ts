import { WorkflowDefinition } from '../interfaces/workflow.interface';

/**
 * 电商购物流程定义
 * 流程：搜索商品 → 加入购物车 → 结算 → 支付
 */
export const ecommerceWorkflow: WorkflowDefinition = {
  id: 'ecommerce',
  name: '电商购物流程',
  description: '完整的电商购物流程：从搜索到支付',
  triggers: ['product_search', 'buy', 'purchase', 'shopping'],
  steps: [
    {
      id: 'search',
      skillId: 'product_search',
      input: {
        query: '{{query}}',
        priceMin: '{{priceMin}}',
        priceMax: '{{priceMax}}',
        category: '{{category}}',
      },
      output: {
        products: 'products',
        query: 'query',
      },
    },
    {
      id: 'add_to_cart',
      skillId: 'add_to_cart',
      input: {
        productId: '{{selectedProductId}}',
        productIndex: '{{selectedProductIndex}}',
        quantity: '{{quantity}}',
      },
      output: {
        cart: 'cart',
        product: 'addedProduct',
      },
      condition: '{{selectedProductId}} || {{selectedProductIndex}}', // 需要选择商品
    },
    {
      id: 'checkout',
      skillId: 'checkout',
      input: {},
      output: {
        order: 'order',
        orderId: 'orderId',
      },
    },
    {
      id: 'payment',
      skillId: 'payment',
      input: {
        orderId: '{{orderId}}',
        method: '{{paymentMethod}}',
      },
      output: {
        payment: 'payment',
        paymentId: 'paymentId',
      },
    },
  ],
};

