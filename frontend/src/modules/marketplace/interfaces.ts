import { MarketplaceAssetType } from '../../entities/marketplace-asset.entity';

export interface NormalizedAsset {
  externalId: string;
  type: MarketplaceAssetType;
  chain?: string;
  name: string;
  symbol?: string;
  address?: string;
  pair?: string;
  imageUrl?: string;
  priceUsd?: number;
  liquidityUsd?: number;
  volume24hUsd?: number;
  change24hPercent?: number;
  metadata?: Record<string, any>;
}

export interface AssetSourceConfig {
  code: string;
  name: string;
  type: 'token_list' | 'dex_pairs' | 'nft_collections' | 'rwa' | 'launchpad';
  url: string;
  chains?: string[];
}

