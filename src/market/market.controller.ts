import { Controller, Get, Param, Logger } from '@nestjs/common';
import { MarketService } from './market.service';
import { PriceService } from '../analytics/price.service';
import { PrismaService } from '../prisma.service';

@Controller('market')
export class MarketController {
  private readonly logger = new Logger(MarketController.name);

  constructor(
      private readonly marketService: MarketService,
      private readonly priceService: PriceService,
      private readonly prisma: PrismaService,
  ) {}

  @Get('data/:itemName')
  async getMarketData(@Param('itemName') itemName: string) {
    // Decode URL-encoded item name
    const decodedItemName = decodeURIComponent(itemName);
    this.logger.log(`Getting market data for item: "${decodedItemName}" (original: "${itemName}")`);

    const steamData = await this.marketService.getSteamMarketData(decodedItemName);
    const marketPrices = await this.marketService.getMarketplacePrices(decodedItemName);
    
    // Calculate Advanced Prediction using Steam Data
    const prediction = await this.priceService.calculateAdvancedForecast(steamData.history, steamData.histogram);

    // Get current price from market prices (lowest price)
    const currentPrice = marketPrices.length > 0 
      ? Math.min(...marketPrices.map((p: any) => p.price))
      : 0;

    // Get item image from database
    let imageUrl = '';
    try {
      // Normalize the item name for better matching (remove extra spaces, normalize case)
      const normalizedName = decodedItemName.trim().toLowerCase();
      
      // First, try exact match with marketHashName
      let item = await this.prisma.item.findUnique({
        where: { marketHashName: decodedItemName },
        select: { imageUrl: true, marketHashName: true, name: true },
      });

      // If not found, try searching by name with partial matching
      if (!item) {
        this.logger.debug(`Item not found by marketHashName "${decodedItemName}", trying name search...`);
        const allItems = await this.prisma.item.findMany({
          select: { imageUrl: true, marketHashName: true, name: true },
        });
        
        // Try multiple matching strategies
        let matchingItems = allItems.filter(i => {
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
          const normalize = (str: string) => str.replace(/[^\w]/g, '').toLowerCase();
          if (normalize(itemNameLower) === normalize(normalizedName) || 
              normalize(marketHashLower) === normalize(normalizedName)) {
            return true;
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
            return b.name.length - a.name.length; // Prefer longer matches
          });
          
          item = matchingItems[0];
          this.logger.log(`Found item by name search: "${item.name}" (marketHashName: "${item.marketHashName}")`);
        }
      }

      // If still not found, try exact match with name
      if (!item) {
        this.logger.debug(`Item not found by name search, trying exact name match...`);
        const items = await this.prisma.item.findMany({
          where: {
            name: decodedItemName,
          },
          select: { imageUrl: true, marketHashName: true, name: true },
          take: 1,
        });
        if (items.length > 0) {
          item = items[0];
          this.logger.log(`Found item by exact name match: "${item.name}"`);
        }
      }

      if (item && item.imageUrl) {
        imageUrl = item.imageUrl;
        this.logger.log(`Found image URL for "${decodedItemName}": ${imageUrl.substring(0, 100)}...`);
      } else {
        this.logger.warn(`No image URL found for item: "${decodedItemName}"`);
        // Log available items for debugging (first 5 items)
        const sampleItems = await this.prisma.item.findMany({
          select: { name: true, marketHashName: true },
          take: 5,
        });
        this.logger.debug(`Sample items in DB: ${JSON.stringify(sampleItems)}`);
      }
    } catch (error: any) {
      this.logger.error(`Error searching for item image: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);
    }

    return {
        itemName: decodedItemName,
        currentPrice,
        steam_data: steamData,
        market_prices: marketPrices,
        prediction,
        imageUrl, // Add image URL to response
    };
  }
}

