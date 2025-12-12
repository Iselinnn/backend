import { Controller, Get, Param, UseGuards, Req, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

declare module 'express-session' {
  interface SessionData {
    user?: any;
  }
}

@Controller('inventory')
export class InventoryController {
  private readonly logger = new Logger(InventoryController.name);

  constructor(private readonly inventoryService: InventoryService) {}

  // IMPORTANT: 'me' route must come BEFORE ':steamId' route
  // Otherwise 'me' will be treated as a steamId parameter
  // 
  // NOTE FOR FLUTTER: This endpoint tries to use cookie-based authentication (express-session),
  // but if session is not available, it will try to get steamId from query parameter as fallback.
  // This allows testing without cookie setup.
  @Get('me')
  async getMyInventory(
    @Req() req: Request & { user?: any },
    @Param('steamId') steamIdParam?: string
  ) {
    try {
      // Step 1: Try to get steamId from session first (for authenticated users with cookies)
      let steamId = req.session?.user?.steamId || req.user?.steamId;
      
      this.logger.log(`Session data: ${JSON.stringify(req.session?.user)}`);
      this.logger.log(`Request user: ${JSON.stringify(req.user)}`);
      
      // Step 2: If no session, try query parameter as fallback (for testing without cookies)
      if (!steamId) {
        const querySteamId = (req.query as any)?.steamId;
        if (querySteamId) {
          this.logger.log(`No steamId in session, using query parameter: ${querySteamId}`);
          steamId = querySteamId;
        }
      }
      
      // Step 3: Only throw error if both are missing
      if (!steamId || steamId.trim() === '') {
        this.logger.warn('No steamId found in session or query parameter');
        throw new HttpException(
          'Steam ID is required. Provide it either through authentication, or as query parameter: /inventory/me?steamId=YOUR_STEAM_ID',
          HttpStatus.BAD_REQUEST
        );
      }
      
      this.logger.log(`Fetching inventory for steamId: ${steamId}`);
      
      // Check if force refresh is requested (query parameter ?force=true)
      const forceRefresh = (req.query as any)?.force === 'true' || (req.query as any)?.force === true;
      
      // Uses caching (15 minutes) unless force=true is specified
      const inventory = await this.inventoryService.fetchAndSyncInventory(steamId, forceRefresh);
      
      return inventory;
    } catch (error: any) {
      this.logger.error(`Error in getMyInventory: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);
      
      // If it's already an HttpException, rethrow it
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        `Failed to fetch inventory: ${error.message || 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get inventory by Steam ID
   * 
   * Logic:
   * 1. First try to get steamId from session (req.user?.steamId) - for authenticated users
   * 2. If no session, use steamId from URL parameter (@Param('steamId'))
   * 3. Only throw error if both are missing
   * 
   * This allows testing by passing Steam ID directly in URL without cookie setup.
   */
  @Get(':steamId')
  async getInventory(
    @Param('steamId') steamIdParam: string,
    @Req() req: Request & { user?: any }
  ) {
    try {
      // Step 1: Try to get steamId from session first (for authenticated users)
      let steamId = req.session?.user?.steamId || req.user?.steamId;
      
      this.logger.log(`Session data: ${JSON.stringify(req.session?.user)}`);
      this.logger.log(`Request user: ${JSON.stringify(req.user)}`);
      this.logger.log(`URL parameter steamId: ${steamIdParam}`);
      
      // Step 2: If no session, use steamId from URL parameter
      if (!steamId) {
        this.logger.log('No steamId in session, using URL parameter');
        steamId = steamIdParam;
      } else {
        this.logger.log(`Using steamId from session: ${steamId}`);
      }
      
      // Step 3: Only throw error if both are missing
      if (!steamId || steamId.trim() === '') {
        this.logger.error('No steamId found in session or URL parameter');
        throw new HttpException(
          'Steam ID is required. Provide it either through authentication or as URL parameter.',
          HttpStatus.BAD_REQUEST
        );
      }
      
      this.logger.log(`Fetching and syncing inventory for steamId: ${steamId}`);
      
      // Check if force refresh is requested (query parameter ?force=true)
      const forceRefresh = (req.query as any)?.force === 'true' || (req.query as any)?.force === true;
      
      // This method fetches inventory from Steam, automatically creates Item records
      // for new items in the database, and returns items with full image URLs
      // Uses caching (15 minutes) unless force=true is specified
      const inventory = await this.inventoryService.fetchAndSyncInventory(steamId, forceRefresh);
      
      this.logger.log(`Successfully fetched ${inventory.length} items for steamId: ${steamId}`);
      
      // Log first few image URLs for debugging
      if (inventory.length > 0) {
        const firstItem = inventory[0];
        this.logger.log(`Sample item - Name: ${firstItem.name}, ImageURL: ${firstItem.imageUrl}`);
      }
      
      return inventory;
    } catch (error: any) {
      this.logger.error(`Error in getInventory: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);
      
      // If it's already an HttpException, rethrow it
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        `Failed to fetch inventory: ${error.message || 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
