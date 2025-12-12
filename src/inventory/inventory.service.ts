import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import axios from 'axios';

interface SteamAsset {
  assetid: string;
  classid: string;
  instanceid: string;
  amount: string;
}

interface SteamDescription {
  classid: string;
  instanceid: string;
  market_hash_name: string;
  market_name: string;
  name: string;
  icon_url: string;
  icon_url_large?: string;
  type?: string;
  tradable?: number;
  marketable?: number;
  tags?: Array<{
    category: string;
    internal_name: string;
    localized_category_name?: string;
    localized_tag_name?: string;
    name?: string;
  }>;
}

interface SteamInventoryResponse {
  success: boolean;
  assets: SteamAsset[];
  descriptions: SteamDescription[];
  more_items?: number;
  last_assetid?: string;
  total_inventory_count?: number;
  message?: string; // Add message property
}

// Export InventoryItem so it can be used in controller
export interface InventoryItem {
  assetId: string;
  name: string;
  imageUrl: string;
  rarity: string; // Make it required (empty string if not available)
  type: string; // Make it required (empty string if not available)
  marketable: number;
  tradable: number;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);
  private readonly APP_ID = 730; // CS2
  private readonly CONTEXT_ID = 2;
  private readonly STEAM_API_KEY = process.env.STEAM_API_KEY;
  // Use fastly CDN - it's more reliable and has better CORS support
  // Flutter Web has CORS issues with cloudflare CDN
  private readonly STEAM_IMAGE_BASE_URL = 'https://community.fastly.steamstatic.com/economy/image/';

  // Mutex map to prevent parallel requests for the same steamId
  private readonly activeRequests = new Map<string, Promise<InventoryItem[]>>();

  constructor(private prisma: PrismaService) {}

  /**
   * Main method: Fetch inventory and automatically sync items to database
   * This method fetches inventory from Steam and automatically creates Item records
   * for any new items found, so the database is automatically populated.
   * 
   * @param steamId - Steam ID of the user
   * @param force - If true, bypasses cache and forces fresh data from Steam (default: false)
   */
  async fetchAndSyncInventory(steamId: string, force: boolean = false): Promise<InventoryItem[]> {
    // MUTEX: Check if there's already an active request for this steamId
    if (this.activeRequests.has(steamId)) {
      this.logger.log(`Request already in progress for ${steamId}, waiting for it to complete...`);
      try {
        return await this.activeRequests.get(steamId)!;
      } catch (error) {
        // If the active request failed, continue with new request
        this.logger.warn(`Active request failed, starting new request`);
      }
    }

    // Create promise for this request
    const requestPromise = this._fetchAndSyncInventoryInternal(steamId, force);
    this.activeRequests.set(steamId, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Remove from active requests when done
      this.activeRequests.delete(steamId);
    }
  }

  /**
   * Internal method that does the actual work
   */
  private async _fetchAndSyncInventoryInternal(steamId: string, force: boolean = false): Promise<InventoryItem[]> {
    try {
      this.logger.log(`Starting inventory fetch and sync for Steam ID: ${steamId}, force: ${force}`);
      
      // CACHING: Check if we have recent data in database (less than 15 minutes old)
      if (!force) {
        const cachedInventory = await this.getCachedInventoryIfRecent(steamId, 15); // 15 minutes
        if (cachedInventory !== null) {
          this.logger.log(`Returning cached inventory (updated less than 15 minutes ago). Items: ${cachedInventory.length}`);
          return cachedInventory;
        }
      } else {
        this.logger.log('Force refresh requested, bypassing cache');
      }
      
      const allItems: InventoryItem[] = [];
      let startAssetId: string | undefined = undefined;
      let hasMore = true;
      let pageCount = 0;
      const maxPages = 50; // Safety limit

      // Collect all descriptions for syncing to database
      const allDescriptions: SteamDescription[] = [];

      while (hasMore && pageCount < maxPages) {
        try {
          const inventoryData = await this.fetchInventoryPage(steamId, startAssetId);
          
          if (!inventoryData || !inventoryData.success) {
            this.logger.warn(`Steam returned success: false. Message: ${inventoryData?.message || 'Unknown'}`);
            break;
          }

          // Collect descriptions for database sync
          allDescriptions.push(...inventoryData.descriptions);

          const items = this.mapAssetsToItems(inventoryData.assets, inventoryData.descriptions);
          allItems.push(...items);

          this.logger.log(`Page ${pageCount + 1}: Fetched ${items.length} items. Total so far: ${allItems.length}`);

          // Check if there are more items
          hasMore = inventoryData.more_items === 1 && inventoryData.last_assetid != null;
          startAssetId = inventoryData.last_assetid;

          if (hasMore) {
            // Increased delay to avoid rate limiting (4 seconds between pages)
            this.logger.log(`Waiting 4 seconds before fetching next page to avoid rate limits...`);
            await new Promise(resolve => setTimeout(resolve, 4000));
          }

          pageCount++;
        } catch (error: any) {
          // SMART FALLBACK: Check database before throwing error
          if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            
            if (status === 429 || status === 400 || status === 403) {
              // Steam blocked us - try to return cached data
              this.logger.warn(`Steam blocked request (${status}). Checking database for cached data...`);
              const cached = await this.getUserInventory(steamId);
              
              if (cached.length > 0) {
                // We have cached data - return it instead of throwing error
                this.logger.log(`Steam blocked (${status}), but returning ${cached.length} cached items from database`);
                return cached;
              } else {
                // No cached data - only then throw error
                if (status === 400) {
                  this.logger.error(`Steam returned 400 and no cached data available`);
                  throw new HttpException(
                    'Инвентарь недоступен. Убедитесь, что инвентарь Steam установлен как публичный в настройках приватности.',
                    HttpStatus.BAD_REQUEST
                  );
                } else if (status === 403) {
                  this.logger.error(`Steam returned 403 and no cached data available`);
                  throw new HttpException(
                    'Инвентарь недоступен. Инвентарь должен быть публичным в настройках приватности Steam.',
                    HttpStatus.FORBIDDEN
                  );
                } else if (status === 429) {
                  this.logger.error(`Steam Rate Limit (429) and no cached data available`);
                  throw new HttpException(
                    'Превышен лимит запросов к Steam. Попробуйте позже. Steam временно заблокировал запросы.',
                    HttpStatus.TOO_MANY_REQUESTS
                  );
                }
              }
            }
          }
          
          // For other errors, also try to return cached data
          this.logger.error(`Error fetching inventory page: ${error.message}. Checking for cached data...`);
          const cached = await this.getUserInventory(steamId);
          if (cached.length > 0) {
            this.logger.log(`Returning ${cached.length} cached items due to error`);
            return cached;
          }
          
          // Only throw if no cached data available
          throw error;
        }
      }

      // Filter only marketable items
      const marketableItems = allItems.filter(item => item.marketable === 1);

      this.logger.log(`Total items fetched: ${allItems.length}, Marketable: ${marketableItems.length}`);

      if (marketableItems.length === 0 && allItems.length > 0) {
        this.logger.warn('No marketable items found. All items in inventory are non-marketable.');
      }

      // AUTOMATIC DATABASE SYNC: Create/update Item records for all unique items
      if (allDescriptions.length > 0) {
        await this.syncItemsToDatabase(allDescriptions);
      }

      // Save user inventory to database
      if (marketableItems.length > 0) {
        try {
          await this.saveInventory(steamId, marketableItems);
        } catch (dbError: any) {
          this.logger.warn(`Failed to save inventory to DB: ${dbError.message}`);
          // Continue anyway
        }
      }

      return marketableItems;
    } catch (error: any) {
      // SMART FALLBACK: Always check database before throwing error
      this.logger.warn(`Error in fetchAndSyncInventory: ${error.message}. Checking database for cached data...`);
      
      const cached = await this.getUserInventory(steamId);
      if (cached.length > 0) {
        // We have cached data - return it instead of throwing error
        this.logger.log(`Steam unavailable, but returning ${cached.length} cached items from database`);
        return cached;
      }

      // Only throw error if no cached data available
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(`Failed to fetch inventory and no cached data available: ${error.message}`);
      throw new HttpException(
        `Не удалось загрузить инвентарь: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Sync items from Steam descriptions to database
   * Automatically creates Item records for new items
   */
  private async syncItemsToDatabase(descriptions: SteamDescription[]): Promise<void> {
    this.logger.log(`Syncing ${descriptions.length} item descriptions to database...`);

    // Get unique descriptions by market_hash_name
    const uniqueDescriptions = new Map<string, SteamDescription>();
    for (const desc of descriptions) {
      const marketHashName = desc.market_hash_name || desc.market_name || desc.name;
      if (marketHashName && !uniqueDescriptions.has(marketHashName)) {
        uniqueDescriptions.set(marketHashName, desc);
      }
    }

    this.logger.log(`Found ${uniqueDescriptions.size} unique items to sync`);

    let created = 0;
    let updated = 0;

    for (const [marketHashName, desc] of uniqueDescriptions) {
      try {
        // Build image URL - use proxy endpoint to bypass CORS
        const iconUrl = desc.icon_url || desc.icon_url_large || '';
        let imageUrl = '';
        if (iconUrl) {
          // Extract just the image path
          let imagePath = iconUrl;
          if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
            const urlMatch = imagePath.match(/\/economy\/image\/(.+)$/);
            if (urlMatch) {
              imagePath = urlMatch[1];
            } else {
              imageUrl = imagePath;
            }
          }
          
          if (!imageUrl) {
            const cleanPath = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;
            const baseUrl = process.env.APP_URL || 'http://localhost:3000';
            imageUrl = `${baseUrl}/image-proxy/${encodeURIComponent(cleanPath)}`;
          }
          
          this.logger.debug(`Syncing item ${marketHashName} with imageUrl: ${imageUrl}`);
        } else {
          this.logger.warn(`No icon_url for item: ${marketHashName}`);
        }

        // Extract rarity from tags
        const rarityTag = desc.tags?.find(tag => tag.category === 'Rarity');
        const rarity = rarityTag?.localized_tag_name || rarityTag?.name || null;

        // Upsert item in database
        const item = await this.prisma.item.upsert({
          where: { marketHashName },
          update: {
            name: desc.market_hash_name || desc.market_name || desc.name,
            imageUrl: imageUrl,
            iconUrl: iconUrl,
            type: desc.type || null,
            rarity: rarity,
            marketable: desc.marketable || 0,
            tradable: desc.tradable || 0,
            updatedAt: new Date(),
          },
          create: {
            marketHashName,
            name: desc.market_hash_name || desc.market_name || desc.name,
            imageUrl: imageUrl,
            iconUrl: iconUrl,
            type: desc.type || null,
            rarity: rarity,
            marketable: desc.marketable || 0,
            tradable: desc.tradable || 0,
          },
        });

        if (item.createdAt.getTime() === item.updatedAt.getTime()) {
          created++;
        } else {
          updated++;
        }
      } catch (error: any) {
        this.logger.error(`Error syncing item ${marketHashName}: ${error.message}`);
        // Continue with other items
      }
    }

    this.logger.log(`Database sync complete: ${created} created, ${updated} updated`);
  }

  /**
   * Alias for fetchAndSyncInventory for backward compatibility
   */
  async fetchUserInventory(steamId: string): Promise<InventoryItem[]> {
    return this.fetchAndSyncInventory(steamId);
  }

  /**
   * Fetch a single page of inventory from Steam
   */
  private async fetchInventoryPage(steamId: string, startAssetId?: string): Promise<SteamInventoryResponse> {
    const baseUrl = `https://steamcommunity.com/inventory/${steamId}/${this.APP_ID}/${this.CONTEXT_ID}`;
    
    // Build query parameters
    const params = new URLSearchParams({
      l: 'russian',
      count: '1000', // Use 1000 instead of 5000 to avoid 400 errors
    });

    if (startAssetId) {
      params.append('start_assetid', startAssetId);
    }

    const url = `${baseUrl}?${params.toString()}`;

    this.logger.log(`Fetching inventory page from: ${url}`);

    // Critical: Steam requires proper headers to avoid 400 errors
    // Use randomized User-Agent to appear more human-like
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    ];
    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

    const config = {
      headers: {
        'User-Agent': randomUserAgent,
        'Referer': `https://steamcommunity.com/profiles/${steamId}/inventory`,
        'Accept': 'application/json',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      },
      timeout: 20000,
      validateStatus: (status: number) => status < 500, // Don't throw on 4xx
    };

    const response = await axios.get<SteamInventoryResponse>(url, config);

    if (response.status !== 200) {
      this.logger.error(`Steam API returned status ${response.status}`);
      throw new Error(`Steam API returned status ${response.status}`);
    }

    if (!response.data) {
      throw new Error('Empty response from Steam API');
    }

    return response.data;
  }

  /**
   * Map Steam assets to inventory items
   */
  private mapAssetsToItems(assets: SteamAsset[], descriptions: SteamDescription[]): InventoryItem[] {
    const items: InventoryItem[] = [];
    
    for (const asset of assets) {
      // Find corresponding description
      const description = descriptions.find(
        desc => desc.classid === asset.classid && 
                (desc.instanceid === asset.instanceid || 
                 (desc.instanceid === '0' && asset.instanceid === '0'))
      );

      if (!description) {
        this.logger.debug(`No description found for asset: classid=${asset.classid}, instanceid=${asset.instanceid}`);
        continue; // Skip this asset
      }

      // Build image URL - use proxy endpoint to bypass CORS issues in Flutter Web
      // Steam returns icon_url as relative path (e.g., "i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSROWqmu7LAocGIGz3UqIXOLrxM-vM")
      const iconUrl = description.icon_url || description.icon_url_large || '';
      let imageUrl = '';
      if (iconUrl) {
        // Extract just the image path (remove any full URLs)
        let imagePath = iconUrl;
        if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
          // Extract path from full URL
          const urlMatch = imagePath.match(/\/economy\/image\/(.+)$/);
          if (urlMatch) {
            imagePath = urlMatch[1];
          } else {
            // If it's a full URL but not economy/image, use it as is
            imageUrl = imagePath;
          }
        }
        
        if (!imageUrl) {
          // Remove any leading slashes
          const cleanPath = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;
          // Use proxy endpoint to bypass CORS
          const baseUrl = process.env.APP_URL || 'http://localhost:3000';
          imageUrl = `${baseUrl}/image-proxy/${encodeURIComponent(cleanPath)}`;
        }
        
        this.logger.debug(`Built image URL for ${description.market_hash_name}: ${imageUrl} (from icon_url: ${iconUrl})`);
      } else {
        this.logger.warn(`No icon_url found for item: ${description.market_hash_name || description.name || 'Unknown'}`);
      }

      // Extract rarity from tags
      const rarityTag = description.tags?.find(tag => tag.category === 'Rarity');
      const rarity = rarityTag?.localized_tag_name || rarityTag?.name || '';

      // Get item name (prefer market_hash_name, fallback to market_name or name)
      const name = description.market_hash_name || description.market_name || description.name || 'Unknown Item';

      items.push({
        assetId: asset.assetid,
        name: name,
        imageUrl: imageUrl,
        rarity: rarity, // Always string (empty if not available)
        type: description.type || '', // Always string (empty if not available)
        marketable: description.marketable || 0,
        tradable: description.tradable || 0,
      });
    }
    
    return items;
  }

  async saveInventory(steamId: string, items: InventoryItem[]) {
    try {
      return await this.prisma.userInventory.upsert({
        where: { userSteamId: steamId },
        update: { 
          items: items as any, 
          updatedAt: new Date() 
        },
        create: {
          userSteamId: steamId,
          items: items as any,
        },
      });
    } catch (error: any) {
      this.logger.error(`Error saving inventory to DB: ${error.message}`);
      throw error;
    }
  }

  async getUserInventory(steamId: string): Promise<InventoryItem[]> {
    try {
      const inventory = await this.prisma.userInventory.findUnique({
        where: { userSteamId: steamId }
      });
      
      if (!inventory || !inventory.items) {
        return [];
      }
      
      // items is stored as Json, need to parse it
      const items = inventory.items as any;
      return Array.isArray(items) ? items : [];
    } catch (error: any) {
      this.logger.error(`Error getting inventory from DB: ${error.message}`);
      return [];
    }
  }

  /**
   * Get cached inventory if it was updated recently (within specified minutes)
   * Returns null if cache is stale or doesn't exist
   */
  private async getCachedInventoryIfRecent(steamId: string, minutes: number): Promise<InventoryItem[] | null> {
    try {
      const inventory = await this.prisma.userInventory.findUnique({
        where: { userSteamId: steamId }
      });
      
      if (!inventory || !inventory.items) {
        this.logger.log('No cached inventory found in database');
        return null;
      }
      
      // Check if inventory was updated recently
      const now = new Date();
      const cacheAge = now.getTime() - inventory.updatedAt.getTime();
      const cacheAgeMinutes = cacheAge / (1000 * 60);
      
      if (cacheAgeMinutes < minutes) {
        // Cache is fresh, return it
        const items = inventory.items as any;
        const parsedItems = Array.isArray(items) ? items : [];
        this.logger.log(`Cache is fresh (${cacheAgeMinutes.toFixed(1)} minutes old, threshold: ${minutes} minutes)`);
        return parsedItems;
      } else {
        this.logger.log(`Cache is stale (${cacheAgeMinutes.toFixed(1)} minutes old, threshold: ${minutes} minutes)`);
        return null;
      }
    } catch (error: any) {
      this.logger.error(`Error checking cache: ${error.message}`);
      return null;
    }
  }
}
