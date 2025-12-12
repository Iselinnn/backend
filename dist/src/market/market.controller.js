"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var MarketController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketController = void 0;
const common_1 = require("@nestjs/common");
const market_service_1 = require("./market.service");
const price_service_1 = require("../analytics/price.service");
const prisma_service_1 = require("../prisma.service");
let MarketController = MarketController_1 = class MarketController {
    marketService;
    priceService;
    prisma;
    logger = new common_1.Logger(MarketController_1.name);
    constructor(marketService, priceService, prisma) {
        this.marketService = marketService;
        this.priceService = priceService;
        this.prisma = prisma;
    }
    async getMarketData(itemName) {
        const decodedItemName = decodeURIComponent(itemName);
        this.logger.log(`Getting market data for item: "${decodedItemName}" (original: "${itemName}")`);
        const steamData = await this.marketService.getSteamMarketData(decodedItemName);
        const marketPrices = await this.marketService.getMarketplacePrices(decodedItemName);
        const prediction = await this.priceService.calculateAdvancedForecast(steamData.history, steamData.histogram);
        const currentPrice = marketPrices.length > 0
            ? Math.min(...marketPrices.map((p) => p.price))
            : 0;
        let imageUrl = '';
        try {
            const normalizedName = decodedItemName.trim().toLowerCase();
            let item = await this.prisma.item.findUnique({
                where: { marketHashName: decodedItemName },
                select: { imageUrl: true, marketHashName: true, name: true },
            });
            if (!item) {
                this.logger.debug(`Item not found by marketHashName "${decodedItemName}", trying name search...`);
                const allItems = await this.prisma.item.findMany({
                    select: { imageUrl: true, marketHashName: true, name: true },
                });
                let matchingItems = allItems.filter(i => {
                    const itemNameLower = i.name.toLowerCase().trim();
                    const marketHashLower = i.marketHashName.toLowerCase().trim();
                    if (itemNameLower === normalizedName || marketHashLower === normalizedName) {
                        return true;
                    }
                    if (itemNameLower.includes(normalizedName) || normalizedName.includes(itemNameLower)) {
                        return true;
                    }
                    const normalize = (str) => str.replace(/[^\w]/g, '').toLowerCase();
                    if (normalize(itemNameLower) === normalize(normalizedName) ||
                        normalize(marketHashLower) === normalize(normalizedName)) {
                        return true;
                    }
                    return false;
                });
                if (matchingItems.length > 0) {
                    matchingItems.sort((a, b) => {
                        const aExact = a.name.toLowerCase() === normalizedName || a.marketHashName.toLowerCase() === normalizedName;
                        const bExact = b.name.toLowerCase() === normalizedName || b.marketHashName.toLowerCase() === normalizedName;
                        if (aExact && !bExact)
                            return -1;
                        if (!aExact && bExact)
                            return 1;
                        return b.name.length - a.name.length;
                    });
                    item = matchingItems[0];
                    this.logger.log(`Found item by name search: "${item.name}" (marketHashName: "${item.marketHashName}")`);
                }
            }
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
            }
            else {
                this.logger.warn(`No image URL found for item: "${decodedItemName}"`);
                const sampleItems = await this.prisma.item.findMany({
                    select: { name: true, marketHashName: true },
                    take: 5,
                });
                this.logger.debug(`Sample items in DB: ${JSON.stringify(sampleItems)}`);
            }
        }
        catch (error) {
            this.logger.error(`Error searching for item image: ${error.message}`);
            this.logger.error(`Stack: ${error.stack}`);
        }
        return {
            itemName: decodedItemName,
            currentPrice,
            steam_data: steamData,
            market_prices: marketPrices,
            prediction,
            imageUrl,
        };
    }
};
exports.MarketController = MarketController;
__decorate([
    (0, common_1.Get)('data/:itemName'),
    __param(0, (0, common_1.Param)('itemName')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MarketController.prototype, "getMarketData", null);
exports.MarketController = MarketController = MarketController_1 = __decorate([
    (0, common_1.Controller)('market'),
    __metadata("design:paramtypes", [market_service_1.MarketService,
        price_service_1.PriceService,
        prisma_service_1.PrismaService])
], MarketController);
