import { fetch } from 'undici';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssetSource, AssetSourceStatus } from '../../../entities/asset-source.entity';
import { MarketplaceAssetType } from '../../../entities/marketplace-asset.entity';
import { AssetSourceConfig, NormalizedAsset } from '../interfaces';
import { AssetNormalizerService } from './asset-normalizer.service';

const DEFAULT_SOURCES: AssetSourceConfig[] = [
  // Token Lists
  {
    code: 'solana-token-list',
    name: 'Solana Token List',
    type: 'token_list',
    url: 'https://cdn.jsdelivr.net/gh/solana-labs/token-list@master/src/tokens/solana.tokenlist.json',
    chains: ['solana'],
  },
  {
    code: 'ethereum-uniswap-token-list',
    name: 'Ethereum Token List',
    type: 'token_list',
    url: 'https://gateway.ipfs.io/ipns/tokens.uniswap.org',
    chains: ['ethereum'],
  },
  {
    code: 'coingecko-trending',
    name: 'CoinGecko Trending Tokens',
    type: 'token_list',
    url: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1',
    chains: ['ethereum', 'bsc', 'polygon'],
  },
  // NFT Collections
  {
    code: 'magic-eden-top',
    name: 'Magic Eden Trending Collections',
    type: 'nft_collections',
    url: 'https://api-mainnet.magiceden.dev/v2/collections?offset=0&limit=50&edge_cache=true',
  },
  {
    code: 'opensea-collections',
    name: 'OpenSea Collections',
    type: 'nft_collections',
    url: 'https://api.opensea.io/api/v2/collections?limit=50',
    chains: ['ethereum'],
  },
  // DEX Pairs
  {
    code: 'jupiter-tokens',
    name: 'Jupiter Token List',
    type: 'dex_pairs',
    url: 'https://quote-api.jup.ag/v6/tokens',
    chains: ['solana'],
  },
  // Launchpad
  {
    code: 'pump-fun-trending',
    name: 'Pump.fun Trending',
    type: 'launchpad',
    url: 'https://frontend-api.pump.fun/coins?limit=50',
    chains: ['solana'],
  },
];

@Injectable()
export class AssetIngestorService {
  private readonly logger = new Logger(AssetIngestorService.name);

  constructor(
    private readonly assetNormalizerService: AssetNormalizerService,
    @InjectRepository(AssetSource)
    private readonly assetSourceRepository: Repository<AssetSource>,
  ) {}

  async refreshSources(sourceCodes?: string[]) {
    const sources = DEFAULT_SOURCES.filter((source) =>
      sourceCodes?.length ? sourceCodes.includes(source.code) : true,
    );

    const results = [];
    for (const source of sources) {
      try {
        const normalized = await this.fetchAndNormalize(source);
        const { created, updated } = await this.assetNormalizerService.upsertAssets(
          normalized,
          source.code,
        );
        await this.assetSourceRepository.save(
          this.assetSourceRepository.create({
            code: source.code,
            name: source.name,
            url: source.url,
            status: AssetSourceStatus.ACTIVE,
            lastRunAt: new Date(),
            lastSuccessAt: new Date(),
            metadata: { created, updated },
          }),
        );
        results.push({ source: source.code, created, updated });
      } catch (error) {
        this.logger.error(`Failed to ingest ${source.code}`, error?.stack || error);
        await this.assetSourceRepository.save(
          this.assetSourceRepository.create({
            code: source.code,
            name: source.name,
            url: source.url,
            status: AssetSourceStatus.ACTIVE,
            lastRunAt: new Date(),
            lastError: error?.message || 'Unknown error',
          }),
        );
        results.push({ source: source.code, error: error?.message });
      }
    }

    return results;
  }

  private async fetchAndNormalize(source: AssetSourceConfig): Promise<NormalizedAsset[]> {
    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${source.url}: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    switch (source.code) {
      case 'solana-token-list':
        return this.normalizeSolanaTokenList(data);
      case 'ethereum-uniswap-token-list':
        return this.normalizeUniswapTokenList(data);
      case 'coingecko-trending':
        return this.normalizeCoinGeckoTokens(Array.isArray(data) ? data : [], source.chains || []);
      case 'magic-eden-top':
        return this.normalizeMagicEdenCollections(data);
      case 'opensea-collections':
        return this.normalizeOpenSeaCollections(data);
      case 'jupiter-tokens':
        return this.normalizeJupiterTokens(data);
      case 'pump-fun-trending':
        return this.normalizePumpFunProjects(data);
      default:
        return [];
    }
  }

  private normalizeSolanaTokenList(data: any): NormalizedAsset[] {
    if (!data?.tokens?.length) return [];
    return data.tokens.slice(0, 2000).map((token) => ({
      externalId: token.address,
      type: MarketplaceAssetType.TOKEN,
      chain: 'solana',
      name: token.name,
      symbol: token.symbol,
      address: token.address,
      imageUrl: token.logoURI,
      metadata: {
        tags: token.tags,
        extensions: token.extensions,
      },
    }));
  }

  private normalizeUniswapTokenList(data: any): NormalizedAsset[] {
    if (!data?.tokens?.length) return [];
    return data.tokens.slice(0, 2000).map((token) => ({
      externalId: `${token.chainId}-${token.address}`,
      type: MarketplaceAssetType.TOKEN,
      chain: token.chainId === 1 ? 'ethereum' : `chain-${token.chainId}`,
      name: token.name,
      symbol: token.symbol,
      address: token.address,
      imageUrl: token.logoURI,
      metadata: {
        decimals: token.decimals,
        tags: token.tags,
      },
    }));
  }

  private normalizeMagicEdenCollections(data: any): NormalizedAsset[] {
    if (!Array.isArray(data)) return [];
    return data.slice(0, 200).map((collection) => ({
      externalId: collection.symbol,
      type: MarketplaceAssetType.NFT,
      chain: collection.chain || 'solana',
      name: collection.name,
      symbol: collection.symbol,
      imageUrl: collection.image,
      priceUsd: collection.stats?.floorPrice ? collection.stats.floorPrice / 1e9 : undefined,
      volume24hUsd: collection.stats?.volume24hr
        ? collection.stats.volume24hr / 1e9
        : undefined,
      metadata: {
        stats: collection.stats,
        categories: collection.categories,
      },
    }));
  }

  private normalizeCoinGeckoTokens(data: any[], chains: string[]): NormalizedAsset[] {
    if (!Array.isArray(data)) return [];
    return data.map((token) => {
      // 根据 token.platforms 确定链
      let chain = 'ethereum';
      if (token.platforms?.['binance-smart-chain']) chain = 'bsc';
      else if (token.platforms?.['polygon-pos']) chain = 'polygon';
      else if (chains.includes('ethereum')) chain = 'ethereum';
      else if (chains.includes('bsc')) chain = 'bsc';
      else if (chains.includes('polygon')) chain = 'polygon';

      return {
        externalId: token.id,
        type: MarketplaceAssetType.TOKEN,
        chain,
        name: token.name,
        symbol: token.symbol,
        imageUrl: token.image,
        priceUsd: token.current_price,
        liquidityUsd: token.total_volume,
        change24hPercent: token.price_change_percentage_24h,
        metadata: {
          marketCap: token.market_cap,
          marketCapRank: token.market_cap_rank,
          platforms: token.platforms,
        },
      };
    });
  }

  private normalizeOpenSeaCollections(data: any): NormalizedAsset[] {
    if (!data?.collections || !Array.isArray(data.collections)) return [];
    return data.collections.map((collection) => ({
      externalId: collection.slug || collection.name,
      type: MarketplaceAssetType.NFT,
      chain: 'ethereum',
      name: collection.name,
      symbol: collection.symbol,
      imageUrl: collection.image_url,
      priceUsd: collection.floor_price ? parseFloat(collection.floor_price) : undefined,
      volume24hUsd: collection.one_day_volume ? parseFloat(collection.one_day_volume) : undefined,
      metadata: {
        description: collection.description,
        stats: collection.stats,
      },
    }));
  }

  private normalizeJupiterTokens(data: any): NormalizedAsset[] {
    if (!data || typeof data !== 'object') return [];
    const tokens = Object.values(data) as any[];
    return tokens.slice(0, 100).map((token) => ({
      externalId: token.address,
      type: MarketplaceAssetType.TOKEN,
      chain: 'solana',
      name: token.name,
      symbol: token.symbol,
      address: token.address,
      imageUrl: token.logoURI,
      metadata: {
        decimals: token.decimals,
        tags: token.tags,
      },
    }));
  }

  private normalizePumpFunProjects(data: any): NormalizedAsset[] {
    if (!data?.coins || !Array.isArray(data.coins)) return [];
    return data.coins.map((coin) => ({
      externalId: coin.mint || coin.address,
      type: MarketplaceAssetType.LAUNCHPAD,
      chain: 'solana',
      name: coin.name || coin.symbol,
      symbol: coin.symbol,
      address: coin.mint || coin.address,
      imageUrl: coin.image_uri,
      priceUsd: coin.usd_market_cap ? coin.usd_market_cap / (coin.supply || 1) : undefined,
      liquidityUsd: coin.usd_market_cap,
      metadata: {
        description: coin.description,
        creator: coin.creator,
        supply: coin.supply,
        marketCap: coin.usd_market_cap,
      },
    }));
  }
}

