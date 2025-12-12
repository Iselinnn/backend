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
var AnalyticsController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsController = void 0;
const common_1 = require("@nestjs/common");
const price_service_1 = require("./price.service");
const prisma_service_1 = require("../prisma.service");
let AnalyticsController = AnalyticsController_1 = class AnalyticsController {
    priceService;
    prisma;
    logger = new common_1.Logger(AnalyticsController_1.name);
    constructor(priceService, prisma) {
        this.priceService = priceService;
        this.prisma = prisma;
    }
    async getItemAnalytics(itemName) {
        const decodedItemName = decodeURIComponent(itemName);
        this.logger.log(`Getting analytics for item: "${decodedItemName}" (original: "${itemName}")`);
        const history = await this.priceService.getPriceHistory(decodedItemName);
        const prices = history.map((h) => h.price || 0);
        const forecast = await this.priceService.calculateForecast(prices);
        const marketPrices = await this.priceService.getMarketPrices(decodedItemName);
        let imageUrl = '';
        try {
            let item = await this.prisma.item.findUnique({
                where: { marketHashName: decodedItemName },
                select: { imageUrl: true, marketHashName: true, name: true },
            });
            if (!item) {
                this.logger.debug(`Item not found by marketHashName "${decodedItemName}", trying name search...`);
                const allItems = await this.prisma.item.findMany({
                    select: { imageUrl: true, marketHashName: true, name: true },
                });
                const matchingItems = allItems.filter(i => i.name.toLowerCase().includes(decodedItemName.toLowerCase()) ||
                    decodedItemName.toLowerCase().includes(i.name.toLowerCase()));
                if (matchingItems.length > 0) {
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
                this.logger.log(`Found image URL for "${decodedItemName}": ${imageUrl}`);
            }
            else {
                this.logger.warn(`No image URL found for item: "${decodedItemName}"`);
            }
        }
        catch (error) {
            this.logger.error(`Error searching for item image: ${error.message}`);
            this.logger.error(`Stack: ${error.stack}`);
        }
        return {
            itemName: decodedItemName,
            currentPrice: prices[prices.length - 1],
            history,
            marketPrices,
            forecast,
            imageUrl,
        };
    }
};
exports.AnalyticsController = AnalyticsController;
__decorate([
    (0, common_1.Get)(':itemName'),
    __param(0, (0, common_1.Param)('itemName')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getItemAnalytics", null);
exports.AnalyticsController = AnalyticsController = AnalyticsController_1 = __decorate([
    (0, common_1.Controller)('analytics'),
    __metadata("design:paramtypes", [price_service_1.PriceService,
        prisma_service_1.PrismaService])
], AnalyticsController);
