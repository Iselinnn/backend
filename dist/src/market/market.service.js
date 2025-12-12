"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var MarketService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const prisma_service_1 = require("../prisma.service");
let MarketService = MarketService_1 = class MarketService {
    prisma;
    logger = new common_1.Logger(MarketService_1.name);
    APP_ID = 730;
    STEAM_API_KEY = process.env.STEAM_API_KEY;
    itemNameIdCache = new Map();
    nameTranslations = new Map([
        ['перчаточный кейс', 'Glove Case'],
        ['оружейный кейс', 'Weapon Case'],
        ['кейс', 'Case'],
        ['нож', 'Knife'],
        ['перчатки', 'Gloves'],
        ['стикер', 'Sticker'],
        ['патч', 'Patch'],
        ['граффити', 'Graffiti'],
    ]);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getSteamMarketData(itemName) {
        try {
            const itemNameId = await this.getItemNameId(itemName);
            if (!itemNameId) {
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
        }
        catch (error) {
            this.logger.error(`Steam API error, falling back to mock data: ${error}`);
            return this.getMockSteamData(itemName);
        }
    }
    async getSteamPrice(itemName) {
        try {
            const url = `https://steamcommunity.com/market/priceoverview/?appid=${this.APP_ID}&currency=1&market_hash_name=${encodeURIComponent(itemName)}`;
            const response = await axios_1.default.get(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            if (response.data && response.data.lowest_price) {
                const priceStr = response.data.lowest_price.replace(/[^0-9.]/g, '');
                return parseFloat(priceStr);
            }
        }
        catch (error) {
            this.logger.error(`Failed to get Steam price: ${error}`);
        }
        return this.getEstimatedPrice(itemName);
    }
    getMockSteamData(itemName) {
        const basePrice = this.getEstimatedPrice(itemName);
        const now = new Date();
        const history = [];
        let price = basePrice;
        for (let i = 30; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            price += (Math.random() - 0.5) * (basePrice * 0.05);
            if (price < 1)
                price = 1;
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
    getEstimatedPrice(itemName) {
        const lowerName = itemName.toLowerCase();
        if (lowerName.includes('karambit') || lowerName.includes('butterfly'))
            return 800;
        if (lowerName.includes('knife') || lowerName.includes('bayonet'))
            return 300;
        if (lowerName.includes('howl'))
            return 4000;
        if (lowerName.includes('dragon lore'))
            return 5000;
        if (lowerName.includes('dragonfire'))
            return 690;
        if (lowerName.includes('asiimov'))
            return 85;
        if (lowerName.includes('redline'))
            return 15;
        if (lowerName.includes('case'))
            return 0.5;
        return 50;
    }
    async getItemNameId(itemName) {
        if (this.itemNameIdCache.has(itemName)) {
            return this.itemNameIdCache.get(itemName);
        }
        try {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const url = `https://steamcommunity.com/market/listings/${this.APP_ID}/${encodeURIComponent(itemName)}`;
            const response = await axios_1.default.get(url, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Connection': 'keep-alive',
                    'Referer': 'https://steamcommunity.com/',
                },
                validateStatus: (status) => status < 500,
            });
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
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error) && error.response?.status === 429) {
                this.logger.debug(`Steam rate limit (429) for ${itemName}, skipping item ID fetch`);
            }
            else {
                this.logger.debug(`Failed to scrape item ID for ${itemName}: ${error.message || error}`);
            }
            return null;
        }
    }
    async getItemOrdersHistogram(itemNameId) {
        try {
            const url = `https://steamcommunity.com/market/itemordershistogram?country=US&language=english&currency=1&item_nameid=${itemNameId}`;
            const response = await axios_1.default.get(url, { timeout: 10000 });
            return response.data;
        }
        catch (error) {
            this.logger.error(`Failed to get histogram: ${error}`);
            return { buy_order_graph: [], sell_order_graph: [] };
        }
    }
    async getPriceHistory(itemName) {
        try {
            const url = `https://steamcommunity.com/market/listings/${this.APP_ID}/${encodeURIComponent(itemName)}`;
            const response = await axios_1.default.get(url, {
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
        }
        catch (error) {
            this.logger.error(`Failed to get price history: ${error}`);
            return [];
        }
    }
    async getMarketHashName(itemName) {
        try {
            this.logger.debug(`Looking for market_hash_name for: "${itemName}"`);
            const normalizedName = itemName.trim().toLowerCase();
            for (const [russian, english] of this.nameTranslations.entries()) {
                if (normalizedName.includes(russian)) {
                    const translatedName = itemName.replace(new RegExp(russian, 'gi'), english);
                    const allItems = await this.prisma.item.findMany({
                        select: { marketHashName: true, name: true },
                        take: 1000,
                    });
                    const item = allItems.find(i => i.marketHashName.toLowerCase().includes(english.toLowerCase()) ||
                        i.name.toLowerCase().includes(english.toLowerCase()));
                    if (item) {
                        this.logger.log(`Found item using translation: "${item.name}" -> market_hash_name: "${item.marketHashName}"`);
                        return item.marketHashName;
                    }
                }
            }
            let item = await this.prisma.item.findUnique({
                where: { marketHashName: itemName },
                select: { marketHashName: true, name: true },
            });
            if (!item) {
                this.logger.debug(`Item not found by marketHashName, searching by name...`);
                const allItems = await this.prisma.item.findMany({
                    select: { marketHashName: true, name: true },
                    take: 5000,
                });
                this.logger.debug(`Searching in ${allItems.length} items`);
                const matchingItems = allItems.filter(i => {
                    const itemNameLower = i.name.toLowerCase().trim();
                    const marketHashLower = i.marketHashName.toLowerCase().trim();
                    if (itemNameLower === normalizedName || marketHashLower === normalizedName) {
                        return true;
                    }
                    if (itemNameLower.includes(normalizedName) || normalizedName.includes(itemNameLower)) {
                        return true;
                    }
                    const normalize = (str) => str.replace(/[^\w\s]/g, '').toLowerCase().trim();
                    const normalizedItem = normalize(itemNameLower);
                    const normalizedMarket = normalize(marketHashLower);
                    const normalizedInput = normalize(normalizedName);
                    if (normalizedItem === normalizedInput || normalizedMarket === normalizedInput) {
                        return true;
                    }
                    const keyWords = normalizedName.split(/\s+/).filter(w => w.length > 2);
                    if (keyWords.length > 0) {
                        const itemKeyWords = itemNameLower.split(/\s+/).filter(w => w.length > 2);
                        const marketKeyWords = marketHashLower.split(/\s+/).filter(w => w.length > 2);
                        const matchCount = keyWords.filter(kw => itemKeyWords.some(iw => iw.includes(kw) || kw.includes(iw)) ||
                            marketKeyWords.some(mw => mw.includes(kw) || kw.includes(mw))).length;
                        if (matchCount >= Math.min(2, keyWords.length)) {
                            return true;
                        }
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
                    this.logger.log(`Found matching item: "${item.name}" -> market_hash_name: "${item.marketHashName}"`);
                }
                else {
                    this.logger.warn(`No matching item found for: "${itemName}"`);
                }
            }
            else {
                this.logger.log(`Found item by marketHashName: "${item.marketHashName}"`);
            }
            if (item?.marketHashName) {
                return item.marketHashName;
            }
            let translatedName = itemName;
            for (const [russian, english] of this.nameTranslations.entries()) {
                translatedName = translatedName.replace(new RegExp(russian, 'gi'), english);
            }
            this.logger.debug(`Using translated/fallback name: "${translatedName}" for item: "${itemName}"`);
            return translatedName;
        }
        catch (error) {
            this.logger.error(`Error getting market_hash_name: ${error}`);
            return itemName;
        }
    }
    async getMarketplacePrices(itemName) {
        const steamPrice = await this.getSteamPrice(itemName);
        const steamData = await this.getSteamMarketData(itemName);
        let basePrice = steamPrice;
        if (basePrice === 0 || isNaN(basePrice)) {
            if (steamData.histogram?.sell_order_graph?.length > 0) {
                basePrice = steamData.histogram.sell_order_graph[0][0];
            }
            else if (steamData.history?.length > 0) {
                basePrice = steamData.history[steamData.history.length - 1][1];
            }
            else {
                basePrice = this.getEstimatedPrice(itemName);
            }
        }
        const marketHashName = await this.getMarketHashName(itemName);
        this.logger.log(`Using market_hash_name "${marketHashName}" for item "${itemName}"`);
        const encodedName = encodeURIComponent(itemName);
        const encodedEnglishName = encodeURIComponent(marketHashName);
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
        this.logger.debug(`Marketplace URLs for "${itemName}":`);
        marketplaces.forEach(m => {
            this.logger.debug(`  ${m.source}: ${m.url}`);
        });
        return marketplaces;
    }
};
exports.MarketService = MarketService;
exports.MarketService = MarketService = MarketService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], MarketService);
