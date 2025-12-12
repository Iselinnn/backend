import { Controller, Get, Query, Param, Post, Logger } from '@nestjs/common';
import { ItemsService } from './items.service';

@Controller('items')
export class ItemsController {
  private readonly logger = new Logger(ItemsController.name);

  constructor(private readonly itemsService: ItemsService) {}

  /**
   * Get all items from database (paginated)
   * Use this instead of getAllCS2Items() to get items from database
   * 
   * IMPORTANT: This endpoint should return ALL CS2 items from Steam Market, not just inventory items.
   * If database has less than 1000 items, it means sync hasn't been run yet, so we fetch from Steam Market API.
   */
  @Get('all')
  async getAllItems(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('forceSteam') forceSteam?: string, // Force fetch from Steam Market API
  ) {
    const limitNum = limit ? parseInt(limit, 10) : undefined;
    const offsetNum = offset ? parseInt(offset, 10) : undefined;
    const forceSteamApi = forceSteam === 'true';
    
    // If forceSteam is true, always use Steam Market API
    if (forceSteamApi) {
      this.logger.log('[GET /items/all] Force fetching from Steam Market API (ignoring database)...');
      // Use fewer retries for regular requests (2 retries, 30 seconds between) to avoid long waits
      const steamItems = await this.itemsService.getAllCS2Items(2, 30000);
      this.logger.log(`[GET /items/all] Steam Market API returned ${steamItems.length} items`);
      
      // If Steam API returned items, return them
      if (steamItems.length > 0) {
        return steamItems;
      }
      
      // If Steam API returned empty, don't fallback to database (which has inventory items)
      // Instead, return empty array so frontend can show appropriate message
      this.logger.warn('[GET /items/all] Steam Market API returned empty array. Not using database fallback to avoid showing inventory items.');
      return [];
    }
    
    // Check database count first
    const dbCount = await this.itemsService.getItemsCount();
    this.logger.log(`[GET /items/all] Database has ${dbCount} items`);
    
    // If database has less than 1000 items, it's likely not synced yet
    // So we fetch from Steam Market API to get all CS2 items
    if (dbCount < 1000) {
      this.logger.log(`[GET /items/all] Database has only ${dbCount} items (likely inventory items, not synced), fetching from Steam Market API...`);
      // Use fewer retries for regular requests (2 retries, 30 seconds between) to avoid long waits
      const steamItems = await this.itemsService.getAllCS2Items(2, 30000);
      this.logger.log(`[GET /items/all] Steam Market API returned ${steamItems.length} items`);
      
      // If Steam API returned items, return them
      if (steamItems.length > 0) {
        return steamItems;
      }
      
      // If Steam API returned empty (rate limited), don't return database items (they're from inventory)
      this.logger.warn(`[GET /items/all] Steam Market API returned empty. Not returning ${dbCount} database items to avoid showing inventory items.`);
      return [];
    }
    
    // Database has enough items, use it
    const dbItems = await this.itemsService.getAllItemsFromDatabase(limitNum, offsetNum);
    
    if (dbItems.length > 0) {
      this.logger.log(`[GET /items/all] Returning ${dbItems.length} items from database`);
      return dbItems;
    }
    
    // Fallback to Steam Market API if database query returned empty
    this.logger.warn('[GET /items/all] Database query returned empty, fetching from Steam Market API...');
    // Use fewer retries for regular requests (2 retries, 30 seconds between) to avoid long waits
    const steamItems = await this.itemsService.getAllCS2Items(2, 30000);
    this.logger.log(`[GET /items/all] Steam Market API returned ${steamItems.length} items`);
    return steamItems;
  }

  /**
   * Get items count from database
   */
  @Get('count')
  async getItemsCount() {
    return { count: await this.itemsService.getItemsCount() };
  }

  /**
   * Sync all items from Steam Market to database
   * This is a long-running operation (can take up to 10 minutes with retries)
   * Returns immediately and syncs in background
   */
  @Post('sync')
  async syncItems(@Query('force') force?: string) {
    const forceSync = force === 'true';
    this.logger.log(`Starting items sync (force: ${forceSync})...`);
    
    // Start sync in background (don't await - return immediately)
    this.itemsService.syncAllItemsToDatabase(forceSync).then((result) => {
      this.logger.log(`Background sync completed: ${result.synced} synced, ${result.errors} errors`);
    }).catch((error: any) => {
      this.logger.error(`Background sync failed: ${error.message}`);
    });
    
    // Return immediately with status
    return {
      success: true,
      message: 'Синхронизация запущена в фоновом режиме. Это может занять до 10 минут. Проверьте логи backend для статуса.',
      syncing: true,
    };
  }

  @Get('search')
  async searchItems(@Query('q') query: string, @Query('forceSteam') forceSteam?: string) {
    const forceSteamApi = forceSteam === 'true';
    
    // If no query, return all items (same logic as /all)
    if (!query) {
      if (forceSteamApi) {
        return await this.itemsService.getAllCS2Items();
      }
      
      const dbCount = await this.itemsService.getItemsCount();
      if (dbCount < 1000) {
        this.logger.log(`Database has only ${dbCount} items, using Steam Market API for search`);
        return await this.itemsService.getAllCS2Items();
      }
      
      const dbItems = await this.itemsService.getAllItemsFromDatabase();
      if (dbItems.length > 0) {
        return dbItems;
      }
      return await this.itemsService.getAllCS2Items();
    }
    
    // If forceSteam is true, always use Steam Market API
    if (forceSteamApi) {
      this.logger.log(`Searching in Steam Market API for: ${query}`);
      return await this.itemsService.searchItems(query);
    }
    
    // Check database count first
    const dbCount = await this.itemsService.getItemsCount();
    
    // If database has less than 1000 items, use Steam Market API for search
    if (dbCount < 1000) {
      this.logger.log(`Database has only ${dbCount} items, using Steam Market API for search: ${query}`);
      return await this.itemsService.searchItems(query);
    }
    
    // Search in database first
    try {
      const allDbItems = await this.itemsService.getAllItemsFromDatabase();
      const lowerQuery = query.toLowerCase();
      const filtered = allDbItems.filter(item => 
        item.name?.toLowerCase().includes(lowerQuery) ||
        item.market_hash_name?.toLowerCase().includes(lowerQuery)
      );
      
      if (filtered.length > 0) {
        this.logger.log(`Found ${filtered.length} items in database for query: ${query}`);
        return filtered;
      }
    } catch (error) {
      this.logger.debug('Database search failed, falling back to Steam API');
    }
    
    // Fallback to Steam Market API
    this.logger.log(`No results in database, searching Steam Market API for: ${query}`);
    return await this.itemsService.searchItems(query);
  }

  @Get('type/:type')
  async getItemsByType(@Param('type') type: string) {
    // Check database count first
    const dbCount = await this.itemsService.getItemsCount();
    
    // If database has less than 1000 items, use Steam Market API
    if (dbCount < 1000) {
      this.logger.log(`Database has only ${dbCount} items, using Steam Market API for type: ${type}`);
      return await this.itemsService.getItemsByType(type);
    }
    
    // Try database first
    try {
      const allDbItems = await this.itemsService.getAllItemsFromDatabase();
      const filtered = allDbItems.filter(item => item.type === type);
      
      if (filtered.length > 0) {
        this.logger.log(`Found ${filtered.length} items in database for type: ${type}`);
        return filtered;
      }
    } catch (error) {
      this.logger.debug('Database filter failed, falling back to Steam API');
    }
    
    // Fallback to Steam Market API
    this.logger.log(`No results in database, using Steam Market API for type: ${type}`);
    return await this.itemsService.getItemsByType(type);
  }
}

