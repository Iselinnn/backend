import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ItemsService {
  private readonly logger = new Logger(ItemsService.name);
  private readonly APP_ID = 730; // CS2
  private readonly BASE_URL = process.env.APP_URL || 'http://localhost:3000';

  // Cache for all items
  private allItemsCache: any[] | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all CS2 items from Steam Market Search API with automatic retry on rate limit
   * This uses the real Steam Market search endpoint
   */
  async getAllCS2Items(maxRetries: number = 3, retryDelay: number = 60000): Promise<any[]> {
    // Return cached data if available and fresh
    const now = Date.now();
    if (this.allItemsCache && (now - this.cacheTimestamp) < this.CACHE_DURATION) {
      this.logger.log(`Returning ${this.allItemsCache.length} cached items`);
      return this.allItemsCache;
    }

    // Try to fetch with retries
    for (let retry = 0; retry <= maxRetries; retry++) {
      try {
        if (retry > 0) {
          const delay = retryDelay * retry; // Exponential backoff: 1min, 2min, 3min
          this.logger.log(`Retry ${retry}/${maxRetries}: Waiting ${delay / 1000} seconds before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const items = await this._fetchItemsFromSteam();
        
        if (items.length > 0) {
          // Success! Update cache and return
          this.allItemsCache = items;
          this.cacheTimestamp = Date.now();
          this.logger.log(`Successfully fetched ${items.length} items from Steam Market`);
          return items;
        } else if (retry < maxRetries) {
          this.logger.warn(`Got 0 items on attempt ${retry + 1}, will retry...`);
          continue;
        } else {
          // Last retry failed, try cache or database
          this.logger.error(`All ${maxRetries + 1} attempts failed. Trying cache...`);
          if (this.allItemsCache && this.allItemsCache.length > 100) {
            this.logger.log(`Returning ${this.allItemsCache.length} cached items as fallback`);
            return this.allItemsCache;
          }
          return [];
        }
      } catch (error: any) {
        if (retry < maxRetries) {
          this.logger.warn(`Error on attempt ${retry + 1}: ${error.message}. Will retry...`);
          continue;
        } else {
          this.logger.error(`All ${maxRetries + 1} attempts failed with error: ${error.message}`);
          // Try cache as last resort
          if (this.allItemsCache && this.allItemsCache.length > 100) {
            this.logger.log(`Returning ${this.allItemsCache.length} cached items as fallback`);
            return this.allItemsCache;
          }
          return [];
        }
      }
    }

    return [];
  }

  /**
   * Internal method to fetch items from Steam Market API (single attempt)
   */
  private async _fetchItemsFromSteam(): Promise<any[]> {
    this.logger.log('Fetching all CS2 items from Steam Market Search API...');
    
    // Add initial delay to avoid immediate rate limit
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const allItems: any[] = [];
    let start = 0;
    const count = 100; // Steam returns max 100 items per request
    let hasMore = true;
    let attempts = 0;
    const maxAttempts = 50; // Reduce to avoid rate limit (start with 5000 items)
    let rateLimited = false;

    while (hasMore && attempts < maxAttempts && !rateLimited) {
        try {
          // Steam Market Search API
          const url = `https://steamcommunity.com/market/search/render/?query=&start=${start}&count=${count}&search_descriptions=0&sort_column=popular&sort_dir=desc&appid=${this.APP_ID}&norender=1`;
          
          this.logger.log(`Fetching items ${start} to ${start + count}...`);
          
          const response = await axios.get(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/javascript, */*; q=0.01',
              'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
              'Accept-Encoding': 'gzip, deflate, br',
              'Referer': 'https://steamcommunity.com/market/',
              'Origin': 'https://steamcommunity.com',
              'Connection': 'keep-alive',
              'Sec-Fetch-Dest': 'empty',
              'Sec-Fetch-Mode': 'cors',
              'Sec-Fetch-Site': 'same-origin',
            },
            timeout: 20000,
            validateStatus: (status) => status < 500, // Don't throw on 4xx
          });

          if (response.status === 200 && response.data) {
            // Check if response has success field
            if (response.data.success === false) {
              this.logger.warn(`Steam Market API returned success: false. Message: ${response.data.message || 'Unknown'}`);
              this.logger.warn(`Response data: ${JSON.stringify(response.data).substring(0, 500)}`);
              hasMore = false;
              break;
            }
            
            const results = response.data.results || [];
            this.logger.log(`Page ${attempts + 1}: Got ${results.length} items from Steam Market API`);
            
            if (results.length === 0) {
              this.logger.warn(`No results in page ${attempts + 1}, stopping`);
              hasMore = false;
              break;
            }
            
            for (const item of results) {
              allItems.push({
                name: item.name || item.hash_name || 'Unknown',
                icon_url: item.asset_description?.icon_url || item.asset_description?.icon_url_large || '',
                market_hash_name: item.hash_name || item.name,
                type: this.getItemType(item.name || item.hash_name || ''),
                quality: this.extractQuality(item.name || item.hash_name || ''),
                marketable: item.asset_description?.marketable || 0,
                tradable: item.asset_description?.tradable || 0,
              });
            }

            hasMore = response.data.has_more_results === true;
            this.logger.log(`Has more results: ${hasMore}, total items so far: ${allItems.length}`);
            start += count;
            attempts++;

            // Add delay to avoid rate limiting (increase delay to avoid 429)
            // Use longer delay if we're getting close to rate limit
            if (hasMore && attempts < maxAttempts) {
              const delay = attempts < 10 ? 3000 : 5000; // 3 seconds for first 10 pages, 5 seconds after
              this.logger.log(`Waiting ${delay}ms before next request to avoid rate limit...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          } else if (response.status === 429) {
            this.logger.warn(`Steam Market API returned 429 (Rate Limited) at page ${attempts + 1}`);
            this.logger.warn(`Got ${allItems.length} items before rate limit. Will retry...`);
            rateLimited = true;
            // Throw error to trigger retry mechanism in getAllCS2Items
            throw new Error('Steam API rate limited');
          } else {
            this.logger.warn(`Steam Market API returned unexpected response: ${response.status}`);
            this.logger.warn(`Response data: ${JSON.stringify(response.data).substring(0, 1000)}`);
            hasMore = false;
          }
        } catch (error: any) {
          if (axios.isAxiosError(error)) {
            if (error.response?.status === 429) {
              this.logger.warn(`Rate limited at page ${attempts + 1}. Got ${allItems.length} items so far.`);
              rateLimited = true;
              // Throw error to trigger retry mechanism
              throw new Error('Steam API rate limited');
            } else {
              this.logger.error(`Error fetching items batch: ${error.message}`);
              hasMore = false;
            }
          } else {
            this.logger.error(`Error: ${error.message}`);
            hasMore = false;
          }
        }
      }

      // Remove duplicates based on name
      const uniqueItems = Array.from(
        new Map(allItems.map(item => [item.name, item])).values()
      );

      this.logger.log(`Fetched ${uniqueItems.length} unique CS2 items from Steam Market`);
      return uniqueItems;
  }

  /**
   * Extract item type from name
   */
  private getItemType(name: string): string {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('knife') || lowerName.includes('karambit') || lowerName.includes('bayonet') || lowerName.includes('butterfly')) {
      return 'knife';
    }
    if (lowerName.includes('glove') || lowerName.includes('hand wrap')) {
      return 'glove';
    }
    if (lowerName.includes('case') || lowerName.includes('key') || lowerName.includes('package') || lowerName.includes('collection')) {
      return 'case';
    }
    if (lowerName.includes('sticker') || lowerName.includes('patch')) {
      return 'sticker';
    }
    return 'weapon';
  }

  /**
   * Extract quality from name
   */
  private extractQuality(name: string): string {
    if (name.includes('Factory New')) return 'Factory New';
    if (name.includes('Minimal Wear')) return 'Minimal Wear';
    if (name.includes('Field-Tested')) return 'Field-Tested';
    if (name.includes('Well-Worn')) return 'Well-Worn';
    if (name.includes('Battle-Scarred')) return 'Battle-Scarred';
    return '';
  }

  /**
   * Search items by name
   */
  async searchItems(query: string): Promise<any[]> {
    const allItems = await this.getAllCS2Items();
    const lowerQuery = query.toLowerCase();
    
    return allItems.filter(item => 
      item.name.toLowerCase().includes(lowerQuery) ||
      item.market_hash_name?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get items by type
   */
  async getItemsByType(type: string): Promise<any[]> {
    const allItems = await this.getAllCS2Items();
    return allItems.filter(item => item.type === type);
  }

  /**
   * Sync all items from Steam Market to database
   * This method fetches all items and saves them to the Item table
   */
  async syncAllItemsToDatabase(force: boolean = false): Promise<{ synced: number; errors: number }> {
    this.logger.log('Starting sync of all CS2 items to database...');
    
    try {
      // Clear cache if force is true to force fresh fetch
      if (force) {
        this.logger.log('Force mode: clearing cache to force fresh fetch from Steam Market...');
        this.allItemsCache = null;
        this.cacheTimestamp = 0;
      }
      
      // Get all items from Steam Market with automatic retries
      // Use more retries for sync (5 retries with 2 minute delays = up to 10 minutes wait)
      this.logger.log('Fetching items from Steam Market with automatic retries (up to 5 attempts, 2 minutes between)...');
      const items = await this.getAllCS2Items(5, 120000); // 5 retries, 2 minutes between retries
      this.logger.log(`Fetched ${items.length} items from Steam Market, starting database sync...`);
      
      if (items.length === 0) {
        this.logger.error('No items fetched from Steam Market API. Likely rate-limited. Please wait 10-15 minutes and try again.');
        return { synced: 0, errors: 0 };
      }

      let synced = 0;
      let errors = 0;

      // Process items in batches to avoid overwhelming the database
      const batchSize = 50;
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        
        for (const item of batch) {
          try {
            const marketHashName = item.market_hash_name || item.name;
            if (!marketHashName) {
              this.logger.warn(`Skipping item without market_hash_name: ${JSON.stringify(item)}`);
              errors++;
              continue;
            }

            // Build image URL using proxy endpoint
            const iconUrl = item.icon_url || '';
            let imageUrl = '';
            if (iconUrl) {
              // If iconUrl already contains http:// or https://, extract the path
              let imagePath = iconUrl;
              if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
                const urlMatch = imagePath.match(/\/economy\/image\/(.+)$/);
                if (urlMatch) {
                  imagePath = urlMatch[1];
                } else {
                  imageUrl = imagePath; // Use as is if not economy/image
                }
              }
              
              if (!imageUrl) {
                // Remove any leading slashes
                const cleanPath = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;
                // Use proxy endpoint to bypass CORS
                imageUrl = `${this.BASE_URL}/image-proxy/${encodeURIComponent(cleanPath)}`;
              }
            }

            // Extract rarity from item (if available in Steam response)
            // For now, we'll try to extract from name or leave null
            const rarity = this.extractRarity(item.name || marketHashName);

            // Upsert item in database
            await this.prisma.item.upsert({
              where: { marketHashName },
              update: {
                name: item.name || marketHashName,
                imageUrl: imageUrl,
                iconUrl: iconUrl,
                type: item.type || null,
                rarity: rarity,
                marketable: item.marketable || 0,
                tradable: item.tradable || 0,
                updatedAt: new Date(),
              },
              create: {
                marketHashName,
                name: item.name || marketHashName,
                imageUrl: imageUrl,
                iconUrl: iconUrl,
                type: item.type || null,
                rarity: rarity,
                marketable: item.marketable || 0,
                tradable: item.tradable || 0,
              },
            });

            synced++;
            
            if (synced % 100 === 0) {
              this.logger.log(`Synced ${synced}/${items.length} items...`);
            }
          } catch (error: any) {
            this.logger.error(`Error syncing item ${item.name || 'Unknown'}: ${error.message}`);
            errors++;
          }
        }

        // Small delay between batches
        if (i + batchSize < items.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      this.logger.log(`Database sync complete: ${synced} synced, ${errors} errors`);
      return { synced, errors };
    } catch (error: any) {
      this.logger.error(`Error in syncAllItemsToDatabase: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract rarity from item name
   */
  private extractRarity(name: string): string | null {
    const lowerName = name.toLowerCase();
    
    // Check for rarity indicators in name
    if (lowerName.includes('consumer grade') || lowerName.includes('consumer')) {
      return 'Consumer Grade';
    }
    if (lowerName.includes('industrial grade') || lowerName.includes('industrial')) {
      return 'Industrial Grade';
    }
    if (lowerName.includes('mil-spec') || lowerName.includes('milspec')) {
      return 'Mil-Spec Grade';
    }
    if (lowerName.includes('restricted')) {
      return 'Restricted';
    }
    if (lowerName.includes('classified')) {
      return 'Classified';
    }
    if (lowerName.includes('covert')) {
      return 'Covert';
    }
    if (lowerName.includes('contraband')) {
      return 'Contraband';
    }
    if (lowerName.includes('exceedingly rare')) {
      return 'Exceedingly Rare';
    }
    
    return null;
  }

  /**
   * Get all items from database
   */
  async getAllItemsFromDatabase(limit?: number, offset?: number): Promise<any[]> {
    try {
      const items = await this.prisma.item.findMany({
        take: limit,
        skip: offset,
        orderBy: { name: 'asc' },
      });
      
      return items.map(item => ({
        id: item.id,
        name: item.name,
        market_hash_name: item.marketHashName,
        icon_url: item.iconUrl,
        imageUrl: item.imageUrl,
        type: item.type,
        rarity: item.rarity,
        marketable: item.marketable,
        tradable: item.tradable,
      }));
    } catch (error: any) {
      this.logger.error(`Error getting items from database: ${error.message}`);
      return [];
    }
  }

  /**
   * Get total count of items in database
   */
  async getItemsCount(): Promise<number> {
    try {
      return await this.prisma.item.count();
    } catch (error: any) {
      this.logger.error(`Error getting items count: ${error.message}`);
      return 0;
    }
  }
}
