/**
 * UCP MCP Tools
 * 
 * MCP Binding for Universal Commerce Protocol
 * Allows AI Agents to interact with UCP checkout sessions via MCP protocol
 */

export const UCP_MCP_TOOLS = [
  // ============ UCP Shopping Tools ============
  {
    name: 'ucp_create_checkout',
    description: 'Create a UCP checkout session for purchasing items. Supports Google Pay, PayPal, Stripe, and X402 payments.',
    inputSchema: {
      type: 'object',
      properties: {
        currency: {
          type: 'string',
          description: 'Currency code (USD, EUR, etc.)',
          default: 'USD'
        },
        line_items: {
          type: 'array',
          description: 'Items to purchase',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Item name' },
              description: { type: 'string', description: 'Item description' },
              quantity: { type: 'number', description: 'Quantity', default: 1 },
              unit_price: { type: 'number', description: 'Price per unit' },
              product_id: { type: 'string', description: 'Optional product ID' }
            },
            required: ['name', 'unit_price']
          }
        },
        buyer: {
          type: 'object',
          description: 'Buyer information',
          properties: {
            email: { type: 'string' },
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            phone: { type: 'string' }
          }
        },
        shipping_address: {
          type: 'object',
          description: 'Shipping address for physical items',
          properties: {
            line1: { type: 'string' },
            line2: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            postal_code: { type: 'string' },
            country: { type: 'string' }
          }
        },
        preferred_payment_handler: {
          type: 'string',
          enum: ['gpay', 'paypal', 'stripe', 'x402'],
          description: 'Preferred payment method'
        }
      },
      required: ['line_items']
    }
  },
  {
    name: 'ucp_get_checkout',
    description: 'Get the status and details of a UCP checkout session',
    inputSchema: {
      type: 'object',
      properties: {
        checkout_id: {
          type: 'string',
          description: 'UCP Checkout Session ID'
        }
      },
      required: ['checkout_id']
    }
  },
  {
    name: 'ucp_update_checkout',
    description: 'Update a UCP checkout session (add items, update buyer info, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        checkout_id: {
          type: 'string',
          description: 'UCP Checkout Session ID'
        },
        buyer: {
          type: 'object',
          description: 'Updated buyer information',
          properties: {
            email: { type: 'string' },
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            phone: { type: 'string' }
          }
        },
        shipping_address: {
          type: 'object',
          description: 'Updated shipping address',
          properties: {
            line1: { type: 'string' },
            line2: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            postal_code: { type: 'string' },
            country: { type: 'string' }
          }
        },
        add_line_items: {
          type: 'array',
          description: 'Additional items to add',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              quantity: { type: 'number' },
              unit_price: { type: 'number' }
            }
          }
        }
      },
      required: ['checkout_id']
    }
  },
  {
    name: 'ucp_complete_checkout',
    description: 'Complete a UCP checkout session with payment. Finalizes the order.',
    inputSchema: {
      type: 'object',
      properties: {
        checkout_id: {
          type: 'string',
          description: 'UCP Checkout Session ID'
        },
        payment_handler: {
          type: 'string',
          enum: ['gpay', 'paypal', 'stripe', 'x402'],
          description: 'Payment handler to use'
        },
        payment_data: {
          type: 'object',
          description: 'Payment-specific data',
          properties: {
            // Google Pay
            google_pay_token: { type: 'string' },
            // PayPal
            paypal_order_id: { type: 'string' },
            // Stripe
            stripe_payment_method_id: { type: 'string' },
            // X402
            x402_tx_hash: { type: 'string' },
            wallet_address: { type: 'string' }
          }
        }
      },
      required: ['checkout_id', 'payment_handler']
    }
  },
  {
    name: 'ucp_cancel_checkout',
    description: 'Cancel a UCP checkout session',
    inputSchema: {
      type: 'object',
      properties: {
        checkout_id: {
          type: 'string',
          description: 'UCP Checkout Session ID'
        },
        reason: {
          type: 'string',
          description: 'Reason for cancellation'
        }
      },
      required: ['checkout_id']
    }
  },
  {
    name: 'ucp_discover_business',
    description: 'Discover a UCP-compatible business by fetching their business profile from /.well-known/ucp',
    inputSchema: {
      type: 'object',
      properties: {
        business_url: {
          type: 'string',
          description: 'Base URL of the business (e.g., https://example.com)'
        }
      },
      required: ['business_url']
    }
  },
  {
    name: 'ucp_get_payment_handlers',
    description: 'Get available payment handlers for the current business',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  // ============ UCP Order Management Tools ============
  {
    name: 'ucp_get_order',
    description: 'Get order details after checkout completion',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: {
          type: 'string',
          description: 'Order ID from completed checkout'
        }
      },
      required: ['order_id']
    }
  },
  {
    name: 'ucp_list_orders',
    description: 'List all orders for the current user/agent',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
          description: 'Filter by order status'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of orders to return',
          default: 10
        }
      },
      required: []
    }
  },
  // ============ AP2 Mandate Tools ============
  {
    name: 'ucp_create_mandate',
    description: 'Create an AP2 mandate for autonomous agent payments. Allows agent to make purchases within specified limits.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'Agent ID to authorize'
        },
        max_amount: {
          type: 'number',
          description: 'Maximum amount per transaction'
        },
        currency: {
          type: 'string',
          description: 'Currency code',
          default: 'USD'
        },
        valid_until: {
          type: 'string',
          description: 'ISO date when mandate expires'
        },
        allowed_merchants: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of allowed merchant IDs (empty for all)'
        },
        allowed_categories: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of allowed product categories'
        }
      },
      required: ['agent_id', 'max_amount']
    }
  },
  {
    name: 'ucp_verify_mandate',
    description: 'Verify an AP2 mandate signature and validity',
    inputSchema: {
      type: 'object',
      properties: {
        mandate_id: {
          type: 'string',
          description: 'Mandate ID to verify'
        },
        signature: {
          type: 'string',
          description: 'Cryptographic signature'
        }
      },
      required: ['mandate_id']
    }
  },
  {
    name: 'ucp_revoke_mandate',
    description: 'Revoke an AP2 mandate',
    inputSchema: {
      type: 'object',
      properties: {
        mandate_id: {
          type: 'string',
          description: 'Mandate ID to revoke'
        }
      },
      required: ['mandate_id']
    }
  },
  // ============ Platform Capability Tools (Phase 3) ============
  {
    name: 'ucp_platform_discover',
    description: 'Discover an external UCP-compatible merchant by URL. Returns their capabilities, payment handlers, and services.',
    inputSchema: {
      type: 'object',
      properties: {
        merchant_url: {
          type: 'string',
          description: 'Base URL of the merchant (e.g., https://shop.example.com)'
        }
      },
      required: ['merchant_url']
    }
  },
  {
    name: 'ucp_platform_create_checkout',
    description: 'Create a checkout session on an external UCP merchant as a platform. Use this to enable cross-merchant purchases.',
    inputSchema: {
      type: 'object',
      properties: {
        merchant_url: {
          type: 'string',
          description: 'URL of the external UCP merchant'
        },
        currency: {
          type: 'string',
          description: 'Currency code',
          default: 'USD'
        },
        line_items: {
          type: 'array',
          description: 'Items to purchase from the external merchant',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              quantity: { type: 'number' },
              unit_price: { type: 'number' }
            },
            required: ['name', 'unit_price']
          }
        },
        buyer: {
          type: 'object',
          description: 'Buyer information',
          properties: {
            email: { type: 'string' },
            first_name: { type: 'string' },
            last_name: { type: 'string' }
          }
        }
      },
      required: ['merchant_url', 'line_items']
    }
  },
  {
    name: 'ucp_platform_get_checkout',
    description: 'Get checkout session status from an external UCP merchant',
    inputSchema: {
      type: 'object',
      properties: {
        merchant_url: {
          type: 'string',
          description: 'URL of the external UCP merchant'
        },
        checkout_id: {
          type: 'string',
          description: 'Checkout session ID'
        }
      },
      required: ['merchant_url', 'checkout_id']
    }
  },
  {
    name: 'ucp_platform_complete_checkout',
    description: 'Complete checkout on an external UCP merchant with payment',
    inputSchema: {
      type: 'object',
      properties: {
        merchant_url: {
          type: 'string',
          description: 'URL of the external UCP merchant'
        },
        checkout_id: {
          type: 'string',
          description: 'Checkout session ID'
        },
        payment_handler: {
          type: 'string',
          description: 'Payment handler to use'
        },
        payment_data: {
          type: 'object',
          description: 'Payment-specific data'
        }
      },
      required: ['merchant_url', 'checkout_id', 'payment_handler']
    }
  },
  {
    name: 'ucp_platform_list_merchants',
    description: 'List all discovered UCP-compatible merchants',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  // ============ Identity Linking Tools ============
  {
    name: 'ucp_link_identity',
    description: 'Link a UCP buyer identity (email) to an Agentrix user account',
    inputSchema: {
      type: 'object',
      properties: {
        ucp_buyer_email: {
          type: 'string',
          description: 'UCP buyer email address'
        },
        agentrix_user_id: {
          type: 'string',
          description: 'Agentrix user ID to link to'
        },
        verification_method: {
          type: 'string',
          enum: ['email', 'oauth', 'manual'],
          description: 'Method to verify the identity link'
        }
      },
      required: ['ucp_buyer_email', 'agentrix_user_id']
    }
  },
  {
    name: 'ucp_find_linked_user',
    description: 'Find the Agentrix user linked to a UCP buyer email',
    inputSchema: {
      type: 'object',
      properties: {
        ucp_buyer_email: {
          type: 'string',
          description: 'UCP buyer email to look up'
        }
      },
      required: ['ucp_buyer_email']
    }
  }
];

/**
 * Get UCP MCP tool definitions
 */
export function getUCPMCPTools() {
  return UCP_MCP_TOOLS;
}
