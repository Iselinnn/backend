import { Controller, Get, Param, Logger } from '@nestjs/common';
import { PriceService } from './price.service';
import { PrismaService } from '../prisma.service';

@Controller('analytics')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(
    private readonly priceService: PriceService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':itemName')
  async getItemAnalytics(@Param('itemName') itemName: string) {
    // Decode URL-encoded item name
    const decodedItemName = decodeURIComponent(itemName);
    this.logger.log(`Getting analytics for item: "${decodedItemName}" (original: "${itemName}")`);

    // 1. Get History
    const history = await this.priceService.getPriceHistory(decodedItemName);
    const prices = history.map((h: any) => h.price || 0);

    // 2. Get Forecast
    const forecast = await this.priceService.calculateForecast(prices);

    // 3. Get Current Market Prices
    const marketPrices = await this.priceService.getMarketPrices(decodedItemName);

    // 4. Get item image from database
    // Try multiple search strategies since itemName might not match marketHashName exactly
    let imageUrl = '';
    try {
      // First, try exact match with marketHashName
      let item = await this.prisma.item.findUnique({
        where: { marketHashName: decodedItemName },
        select: { imageUrl: true, marketHashName: true, name: true },
      });

      // If not found, try searching by name (SQLite doesn't support case-insensitive mode, so we'll search all and filter)
      if (!item) {
        this.logger.debug(`Item not found by marketHashName "${decodedItemName}", trying name search...`);
        const allItems = await this.prisma.item.findMany({
          select: { imageUrl: true, marketHashName: true, name: true },
        });
        // Filter case-insensitively in JavaScript
        const matchingItems = allItems.filter(i => 
          i.name.toLowerCase().includes(decodedItemName.toLowerCase()) ||
          decodedItemName.toLowerCase().includes(i.name.toLowerCase())
        );
        if (matchingItems.length > 0) {
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
        this.logger.log(`Found image URL for "${decodedItemName}": ${imageUrl}`);
      } else {
        this.logger.warn(`No image URL found for item: "${decodedItemName}"`);
      }
    } catch (error: any) {
      this.logger.error(`Error searching for item image: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);
    }

    return {
      itemName: decodedItemName,
      currentPrice: prices[prices.length - 1],
      history,
      marketPrices,
      forecast,
      imageUrl, // Add image URL to response
    };
  }
}

