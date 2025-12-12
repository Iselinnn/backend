import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { PrismaService } from '../prisma.service';

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);
  private readonly APP_ID = 730;
  private readonly STEAM_API_KEY = process.env.STEAM_API_KEY;

  // Cache item name IDs to avoid scraping every time
  private itemNameIdCache = new Map<string, string>();

  // Known Russian to English translations for common items
  private readonly nameTranslations: Map<string, string> = new Map([
    ['перчаточный кейс', 'Glove Case'],
    ['оружейный кейс', 'Weapon Case'],
    ['кейс', 'Case'],
    ['нож', 'Knife'],
    ['перчатки', 'Gloves'],
    ['стикер', 'Sticker'],
    ['патч', 'Patch'],
    ['граффити', 'Graffiti'],
  ]);

  constructor(private readonly prisma: PrismaService) {}

  async getSteamMarketData(itemName: string) {
    try {
      // Try to get real data from Steam Market
      const itemNameId = await this.getItemNameId(itemName);
      if (!itemNameId) {
        // Use debug instead of warn - this is expected behavior when rate limited
        this.logger.debug(`Could not get item ID for ${itemName}, using mock data`);
        return this.getMockSteamData(itemName);
      }

      const [histogram, history] = await Promise.all([
          this.getItemOrdersHistogram(itemNameId),
          this.getPriceHistory(itemName),
      ]);

      return {
          item_nameid: itemNameId,
          histogram,
          history,
      };
    } catch (error) {
      this.logger.error(`Steam API error, falling back to mock data: ${error}`);
      return this.getMockSteamData(itemName);
    }
  }

  // Get real price from Steam Market using Market Price Overview API
  async getSteamPrice(itemName: string): Promise<number> {
    try {
      const url = `https://steamcommunity.com/market/priceoverview/?appid=${this.APP_ID}&currency=1&market_hash_name=${encodeURIComponent(itemName)}`;
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (response.data && response.data.lowest_price) {
        const priceStr = response.data.lowest_price.replace(/[^0-9.]/g, '');
        return parseFloat(priceStr);
      }
    } catch (error) {
      this.logger.error(`Failed to get Steam price: ${error}`);
    }
    return this.getEstimatedPrice(itemName);
  }

  // Mock data fallback when Steam is unavailable
  private getMockSteamData(itemName: string) {
    const basePrice = this.getEstimatedPrice(itemName);
    const now = new Date();
    
    // Generate realistic history for last 30 days
    const history: any[] = [];
    let price = basePrice;
    for (let i = 30; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      price += (Math.random() - 0.5) * (basePrice * 0.05);
      if (price < 1) price = 1;
      history.push([
        date.toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit' }),
        parseFloat(price.toFixed(2)),
        Math.floor(Math.random() * 1000).toString()
      ]);
    }

    return {
      item_nameid: 'mock',
      histogram: {
        buy_order_graph: [[basePrice * 0.95, 100], [basePrice * 0.9, 250], [basePrice * 0.85, 500]],
        sell_order_graph: [[basePrice, 50], [basePrice * 1.05, 150], [basePrice * 1.1, 300]],
        sell_order_summary: '1,234'
      },
      history,
    };
  }

  // Estimate price based on item name
  private getEstimatedPrice(itemName: string): number {
    const lowerName = itemName.toLowerCase();
    if (lowerName.includes('karambit') || lowerName.includes('butterfly')) return 800;
    if (lowerName.includes('knife') || lowerName.includes('bayonet')) return 300;
    if (lowerName.includes('howl')) return 4000;
    if (lowerName.includes('dragon lore')) return 5000;
    if (lowerName.includes('dragonfire')) return 690;
    if (lowerName.includes('asiimov')) return 85;
    if (lowerName.includes('redline')) return 15;
    if (lowerName.includes('case')) return 0.5;
    return 50; // Default
  }

  private async getItemNameId(itemName: string): Promise<string | null> {
    if (this.itemNameIdCache.has(itemName)) {
        return this.itemNameIdCache.get(itemName)!;
    }

    try {
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const url = `https://steamcommunity.com/market/listings/${this.APP_ID}/${encodeURIComponent(itemName)}`;
        const response = await axios.get(url, {
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
            'Connection': 'keep-alive',
            'Referer': 'https://steamcommunity.com/',
          },
          validateStatus: (status) => status < 500, // Don't throw on 4xx
        });
        
        // Check for rate limit - use debug instead of warn to reduce noise
        if (response.status === 429) {
          this.logger.debug(`Steam rate limit (429) for ${itemName}, skipping item ID fetch`);
          return null;
        }
        
        if (response.status !== 200) {
          this.logger.debug(`Steam returned ${response.status} for ${itemName}`);
          return null;
        }
        
        const $ = cheerio.load(response.data);
        
        const scriptContent = $('script').filter((i, el) => {
            return $(el).html()?.includes('Market_LoadOrderSpread') ?? false;
        }).html();

        if (scriptContent) {
            const match = scriptContent.match(/Market_LoadOrderSpread\(\s*(\d+)\s*\)/);
            if (match && match[1]) {
                this.itemNameIdCache.set(itemName, match[1]);
                return match[1];
            }
        }
        return null;
    } catch (error: any) {
        // Check if it's a 429 error - use debug to reduce noise
        if (axios.isAxiosError(error) && error.response?.status === 429) {
          this.logger.debug(`Steam rate limit (429) for ${itemName}, skipping item ID fetch`);
        } else {
          // Only log as error if it's not a rate limit
          this.logger.debug(`Failed to scrape item ID for ${itemName}: ${error.message || error}`);
        }
        return null;
    }
  }

  private async getItemOrdersHistogram(itemNameId: string) {
      try {
          const url = `https://steamcommunity.com/market/itemordershistogram?country=US&language=english&currency=1&item_nameid=${itemNameId}`;
          const response = await axios.get(url, { timeout: 10000 });
          return response.data;
      } catch (error) {
          this.logger.error(`Failed to get histogram: ${error}`);
          return { buy_order_graph: [], sell_order_graph: [] };
      }
  }

  private async getPriceHistory(itemName: string) {
      try {
        const url = `https://steamcommunity.com/market/listings/${this.APP_ID}/${encodeURIComponent(itemName)}`;
        const response = await axios.get(url, {
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        const $ = cheerio.load(response.data);
        
        const scriptContent = $('script').filter((i, el) => {
            return $(el).html()?.includes('var line1 =') ?? false;
        }).html();

        if (scriptContent) {
            const match = scriptContent.match(/var line1 = (\[.*?\]);/);
            if (match && match[1]) {
                return JSON.parse(match[1]);
            }
        }
        return [];
      } catch (error) {
          this.logger.error(`Failed to get price history: ${error}`);
          return [];
      }
  }

  /**
   * Get market_hash_name (English name) from database for marketplace URLs
   */
  private async getMarketHashName(itemName: string): Promise<string> {
    try {
      this.logger.debug(`Looking for market_hash_name for: "${itemName}"`);
      
      // First, try known translations
      const normalizedName = itemName.trim().toLowerCase();
      for (const [russian, english] of this.nameTranslations.entries()) {
        if (normalizedName.includes(russian)) {
          // Try to find exact match with English translation
          const translatedName = itemName.replace(
            new RegExp(russian, 'gi'),
            english
          );
          
          // SQLite doesn't support case-insensitive search directly, so we'll search manually
          const allItems = await this.prisma.item.findMany({
            select: { marketHashName: true, name: true },
            take: 1000,
          });
          
          const item = allItems.find(i => 
            i.marketHashName.toLowerCase().includes(english.toLowerCase()) ||
            i.name.toLowerCase().includes(english.toLowerCase())
          );
          
          if (item) {
            this.logger.log(`Found item using translation: "${item.name}" -> market_hash_name: "${item.marketHashName}"`);
            return item.marketHashName;
          }
        }
      }
      
      // Try to find item in database by exact marketHashName
      let item = await this.prisma.item.findUnique({
        where: { marketHashName: itemName },
        select: { marketHashName: true, name: true },
      });

      // If not found, try searching by name
      if (!item) {
        this.logger.debug(`Item not found by marketHashName, searching by name...`);
        const allItems = await this.prisma.item.findMany({
          select: { marketHashName: true, name: true },
          take: 5000, // Increased limit
        });
        
        this.logger.debug(`Searching in ${allItems.length} items`);
        
        const matchingItems = allItems.filter(i => {
          const itemNameLower = i.name.toLowerCase().trim();
          const marketHashLower = i.marketHashName.toLowerCase().trim();
          
          // Exact match
          if (itemNameLower === normalizedName || marketHashLower === normalizedName) {
            return true;
          }
          
          // Contains match (both directions)
          if (itemNameLower.includes(normalizedName) || normalizedName.includes(itemNameLower)) {
            return true;
          }
          
          // Match without special characters and spaces
          const normalize = (str: string) => str.replace(/[^\w\s]/g, '').toLowerCase().trim();
          const normalizedItem = normalize(itemNameLower);
          const normalizedMarket = normalize(marketHashLower);
          const normalizedInput = normalize(normalizedName);
          
          if (normalizedItem === normalizedInput || normalizedMarket === normalizedInput) {
            return true;
          }
          
          // Try matching key words (e.g., "Перчаточный кейс" -> "Glove Case")
          const keyWords = normalizedName.split(/\s+/).filter(w => w.length > 2);
          if (keyWords.length > 0) {
            const itemKeyWords = itemNameLower.split(/\s+/).filter(w => w.length > 2);
            const marketKeyWords = marketHashLower.split(/\s+/).filter(w => w.length > 2);
            const matchCount = keyWords.filter(kw => 
              itemKeyWords.some(iw => iw.includes(kw) || kw.includes(iw)) ||
              marketKeyWords.some(mw => mw.includes(kw) || kw.includes(mw))
            ).length;
            if (matchCount >= Math.min(2, keyWords.length)) {
              return true;
            }
          }
          
          return false;
        });
        
        if (matchingItems.length > 0) {
          // Prefer exact match, then longest match
          matchingItems.sort((a, b) => {
            const aExact = a.name.toLowerCase() === normalizedName || a.marketHashName.toLowerCase() === normalizedName;
            const bExact = b.name.toLowerCase() === normalizedName || b.marketHashName.toLowerCase() === normalizedName;
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            return b.name.length - a.name.length;
          });
          
          item = matchingItems[0];
          this.logger.log(`Found matching item: "${item.name}" -> market_hash_name: "${item.marketHashName}"`);
        } else {
          this.logger.warn(`No matching item found for: "${itemName}"`);
        }
      } else {
        this.logger.log(`Found item by marketHashName: "${item.marketHashName}"`);
      }

      // Return market_hash_name if found, otherwise try to construct English name
      if (item?.marketHashName) {
        return item.marketHashName;
      }
      
      // Last resort: try to translate common words
      let translatedName = itemName;
      for (const [russian, english] of this.nameTranslations.entries()) {
        translatedName = translatedName.replace(new RegExp(russian, 'gi'), english);
      }
      
      this.logger.debug(`Using translated/fallback name: "${translatedName}" for item: "${itemName}"`);
      return translatedName;
    } catch (error) {
      this.logger.error(`Error getting market_hash_name: ${error}`);
      return itemName; // Fallback to original name
    }
  }

  async getMarketplacePrices(itemName: string) {
      // Get real Steam price first
      const steamPrice = await this.getSteamPrice(itemName);
      
      const steamData = await this.getSteamMarketData(itemName);
      
      let basePrice = steamPrice;
      if (basePrice === 0 || isNaN(basePrice)) {
        // Fallback to histogram or history
        if (steamData.histogram?.sell_order_graph?.length > 0) {
            basePrice = steamData.histogram.sell_order_graph[0][0];
        } else if (steamData.history?.length > 0) {
            basePrice = steamData.history[steamData.history.length - 1][1];
        } else {
            basePrice = this.getEstimatedPrice(itemName);
        }
      }

      // Get market_hash_name (English name) for platforms that require it
      const marketHashName = await this.getMarketHashName(itemName);
      
      this.logger.log(`Using market_hash_name "${marketHashName}" for item "${itemName}"`);
      
      // Use market_hash_name for English platforms, original name for Russian platforms
      const encodedName = encodeURIComponent(itemName); // For Lis-skins (Russian)
      const encodedEnglishName = encodeURIComponent(marketHashName); // For English platforms

      const marketplaces = [
        {
            source: 'Steam',
            price: parseFloat(basePrice.toFixed(2)),
            stock: 1200,
            url: `https://steamcommunity.com/market/listings/730/${encodedEnglishName}`,
            is_cheaper: false
        },
        {
            source: 'CS.MONEY',
            price: parseFloat((basePrice * 0.92).toFixed(2)),
            stock: 245,
            url: `https://cs.money/market/buy/?search=${encodedEnglishName}`,
            is_cheaper: true
        },
        {
            source: 'Lis-skins',
            price: parseFloat((basePrice * 0.88).toFixed(2)),
            stock: 89,
            url: `https://lis-skins.ru/market/csgo/?query=${encodedName}`,
            is_cheaper: true
        },
        {
            source: 'Waxpeer',
            price: parseFloat((basePrice * 0.90).toFixed(2)),
            stock: 312,
            url: `https://waxpeer.com/?game=csgo&search=${encodedEnglishName}`,
            is_cheaper: true
        },
        {
            source: 'ShadowPay',
            price: parseFloat((basePrice * 0.89).toFixed(2)),
            stock: 156,
            url: `https://shadowpay.com/en/csgo-items?search=${encodedEnglishName}`,
            is_cheaper: true
        }
      ];

      // Log URLs for debugging
      this.logger.debug(`Marketplace URLs for "${itemName}":`);
      marketplaces.forEach(m => {
        this.logger.debug(`  ${m.source}: ${m.url}`);
      });

      return marketplaces;
  }
}
