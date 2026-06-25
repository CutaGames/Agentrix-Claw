/**
 * 集成服务配置
 * 用于配置各种外部服务的API密钥和端点
 */

export interface DEXConfig {
  jupiter: {
    apiUrl: string;
    apiKey?: string;
  };
  raydium: {
    apiUrl: string;
    apiKey?: string;
  };
  uniswap: {
    apiUrl: string;
    apiKey?: string;
  };
  '1inch': {
    apiUrl: string;
    apiKey?: string;
  };
  pancakeswap: {
    apiUrl: string;
    apiKey?: string;
  };
}

export interface LaunchpadConfig {
  pumpfun: {
    apiUrl: string;
    apiKey?: string;
  };
  raydium: {
    apiUrl: string;
    apiKey?: string;
  };
  tonMemepad: {
    apiUrl: string;
    apiKey?: string;
  };
}

export interface AIConfig {
  openai: {
    apiKey?: string;
    apiUrl?: string;
    model?: string;
  };
  anthropic: {
    apiKey?: string;
    apiUrl?: string;
    model?: string;
  };
  local: {
    apiUrl?: string;
    model?: string;
  };
}

export interface IntegrationsConfig {
  dex: DEXConfig;
  launchpad: LaunchpadConfig;
  ai: AIConfig;
}

/**
 * 从环境变量加载配置
 */
export function loadIntegrationsConfig(): IntegrationsConfig {
  return {
    dex: {
      jupiter: {
        apiUrl: process.env.JUPITER_API_URL || 'https://quote-api.jup.ag/v6',
        apiKey: process.env.JUPITER_API_KEY,
      },
      raydium: {
        apiUrl: process.env.RAYDIUM_API_URL || 'https://api.raydium.io',
        apiKey: process.env.RAYDIUM_API_KEY,
      },
      uniswap: {
        apiUrl: process.env.UNISWAP_API_URL || 'https://api.thegraph.com/subgraphs/name/uniswap',
        apiKey: process.env.UNISWAP_API_KEY,
      },
      '1inch': {
        apiUrl: process.env.ONEINCH_API_URL || 'https://api.1inch.io/v5.0',
        apiKey: process.env.ONEINCH_API_KEY,
      },
      pancakeswap: {
        apiUrl: process.env.PANCAKESWAP_API_URL || 'https://api.pancakeswap.info/api/v2',
        apiKey: process.env.PANCAKESWAP_API_KEY,
      },
    },
    launchpad: {
      pumpfun: {
        apiUrl: process.env.PUMPFUN_API_URL || 'https://pump.fun/api',
        apiKey: process.env.PUMPFUN_API_KEY,
      },
      raydium: {
        apiUrl: process.env.RAYDIUM_ACCELERAYTOR_API_URL || 'https://acceleraytor.raydium.io/api',
        apiKey: process.env.RAYDIUM_ACCELERAYTOR_API_KEY,
      },
      tonMemepad: {
        apiUrl: process.env.TON_MEMEPAD_API_URL || 'https://ton-memepad.api',
        apiKey: process.env.TON_MEMEPAD_API_KEY,
      },
    },
    ai: {
      openai: {
        apiKey: process.env.OPENAI_API_KEY,
        apiUrl: process.env.OPENAI_API_URL || 'https://api.openai.com/v1',
        model: process.env.OPENAI_MODEL || 'gpt-4',
      },
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY,
        apiUrl: process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1',
        model: process.env.ANTHROPIC_MODEL || 'claude-3-opus',
      },
      local: {
        apiUrl: process.env.LOCAL_AI_API_URL || 'http://localhost:8000',
        model: process.env.LOCAL_AI_MODEL || 'local',
      },
    },
  };
}

