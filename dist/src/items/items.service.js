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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var ItemsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ItemsService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const prisma_service_1 = require("../prisma.service");
let ItemsService = ItemsService_1 = class ItemsService {
    prisma;
    logger = new common_1.Logger(ItemsService_1.name);
    APP_ID = 730;
    BASE_URL = process.env.APP_URL || 'http://localhost:3000';
    allItemsCache = null;
    cacheTimestamp = 0;
    CACHE_DURATION = 24 * 60 * 60 * 1000;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getAllCS2Items(maxRetries = 3, retryDelay = 60000) {
        const now = Date.now();
        if (this.allItemsCache && (now - this.cacheTimestamp) < this.CACHE_DURATION) {
            this.logger.log(`Returning ${this.allItemsCache.length} cached items`);
            return this.allItemsCache;
        }
        for (let retry = 0; retry <= maxRetries; retry++) {
            try {
                if (retry > 0) {
                    const delay = retryDelay * retry;
                    this.logger.log(`Retry ${retry}/${maxRetries}: Waiting ${delay / 1000} seconds before retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                const items = await this._fetchItemsFromSteam();
                if (items.length > 0) {
                    this.allItemsCache = items;
                    this.cacheTimestamp = Date.now();
                    this.logger.log(`Successfully fetched ${items.length} items from Steam Market`);
                    return items;
                }
                else if (retry < maxRetries) {
                    this.logger.warn(`Got 0 items on attempt ${retry + 1}, will retry...`);
                    continue;
                }
                else {
                    this.logger.error(`All ${maxRetries + 1} attempts failed. Trying cache...`);
                    if (this.allItemsCache && this.allItemsCache.length > 100) {
                        this.logger.log(`Returning ${this.allItemsCache.length} cached items as fallback`);
                        return this.allItemsCache;
                    }
                    return [];
                }
            }
            catch (error) {
                if (retry < maxRetries) {
                    this.logger.warn(`Error on attempt ${retry + 1}: ${error.message}. Will retry...`);
                    continue;
                }
                else {
                    this.logger.error(`All ${maxRetries + 1} attempts failed with error: ${error.message}`);
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
    async _fetchItemsFromSteam() {
        this.logger.log('Fetching all CS2 items from Steam Market Search API...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        const allItems = [];
        let start = 0;
        const count = 100;
        let hasMore = true;
        let attempts = 0;
        const maxAttempts = 50;
        let rateLimited = false;
        while (hasMore && attempts < maxAttempts && !rateLimited) {
            try {
                const url = `https://steamcommunity.com/market/search/render/?query=&start=${start}&count=${count}&search_descriptions=0&sort_column=popular&sort_dir=desc&appid=${this.APP_ID}&norender=1`;
                this.logger.log(`Fetching items ${start} to ${start + count}...`);
                const response = await axios_1.default.get(url, {
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
                    validateStatus: (status) => status < 500,
                });
                if (response.status === 200 && response.data) {
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
                    if (hasMore && attempts < maxAttempts) {
                        const delay = attempts < 10 ? 3000 : 5000;
                        this.logger.log(`Waiting ${delay}ms before next request to avoid rate limit...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
                else if (response.status === 429) {
                    this.logger.warn(`Steam Market API returned 429 (Rate Limited) at page ${attempts + 1}`);
                    this.logger.warn(`Got ${allItems.length} items before rate limit. Will retry...`);
                    rateLimited = true;
                    throw new Error('Steam API rate limited');
                }
                else {
                    this.logger.warn(`Steam Market API returned unexpected response: ${response.status}`);
                    this.logger.warn(`Response data: ${JSON.stringify(response.data).substring(0, 1000)}`);
                    hasMore = false;
                }
            }
            catch (error) {
                if (axios_1.default.isAxiosError(error)) {
                    if (error.response?.status === 429) {
                        this.logger.warn(`Rate limited at page ${attempts + 1}. Got ${allItems.length} items so far.`);
                        rateLimited = true;
                        throw new Error('Steam API rate limited');
                    }
                    else {
                        this.logger.error(`Error fetching items batch: ${error.message}`);
                        hasMore = false;
                    }
                }
                else {
                    this.logger.error(`Error: ${error.message}`);
                    hasMore = false;
                }
            }
        }
        const uniqueItems = Array.from(new Map(allItems.map(item => [item.name, item])).values());
        this.logger.log(`Fetched ${uniqueItems.length} unique CS2 items from Steam Market`);
        return uniqueItems;
    }
    getItemType(name) {
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
    extractQuality(name) {
        if (name.includes('Factory New'))
            return 'Factory New';
        if (name.includes('Minimal Wear'))
            return 'Minimal Wear';
        if (name.includes('Field-Tested'))
            return 'Field-Tested';
        if (name.includes('Well-Worn'))
            return 'Well-Worn';
        if (name.includes('Battle-Scarred'))
            return 'Battle-Scarred';
        return '';
    }
    async searchItems(query) {
        const allItems = await this.getAllCS2Items();
        const lowerQuery = query.toLowerCase();
        return allItems.filter(item => item.name.toLowerCase().includes(lowerQuery) ||
            item.market_hash_name?.toLowerCase().includes(lowerQuery));
    }
    async getItemsByType(type) {
        const allItems = await this.getAllCS2Items();
        return allItems.filter(item => item.type === type);
    }
    async syncAllItemsToDatabase(force = false) {
        this.logger.log('Starting sync of all CS2 items to database...');
        try {
            if (force) {
                this.logger.log('Force mode: clearing cache to force fresh fetch from Steam Market...');
                this.allItemsCache = null;
                this.cacheTimestamp = 0;
            }
            this.logger.log('Fetching items from Steam Market with automatic retries (up to 5 attempts, 2 minutes between)...');
            const items = await this.getAllCS2Items(5, 120000);
            this.logger.log(`Fetched ${items.length} items from Steam Market, starting database sync...`);
            if (items.length === 0) {
                this.logger.error('No items fetched from Steam Market API. Likely rate-limited. Please wait 10-15 minutes and try again.');
                return { synced: 0, errors: 0 };
            }
            let synced = 0;
            let errors = 0;
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
                        const iconUrl = item.icon_url || '';
                        let imageUrl = '';
                        if (iconUrl) {
                            let imagePath = iconUrl;
                            if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
                                const urlMatch = imagePath.match(/\/economy\/image\/(.+)$/);
                                if (urlMatch) {
                                    imagePath = urlMatch[1];
                                }
                                else {
                                    imageUrl = imagePath;
                                }
                            }
                            if (!imageUrl) {
                                const cleanPath = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;
                                imageUrl = `${this.BASE_URL}/image-proxy/${encodeURIComponent(cleanPath)}`;
                            }
                        }
                        const rarity = this.extractRarity(item.name || marketHashName);
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
                    }
                    catch (error) {
                        this.logger.error(`Error syncing item ${item.name || 'Unknown'}: ${error.message}`);
                        errors++;
                    }
                }
                if (i + batchSize < items.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            this.logger.log(`Database sync complete: ${synced} synced, ${errors} errors`);
            return { synced, errors };
        }
        catch (error) {
            this.logger.error(`Error in syncAllItemsToDatabase: ${error.message}`);
            throw error;
        }
    }
    extractRarity(name) {
        const lowerName = name.toLowerCase();
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
    async getAllItemsFromDatabase(limit, offset) {
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
        }
        catch (error) {
            this.logger.error(`Error getting items from database: ${error.message}`);
            return [];
        }
    }
    async getItemsCount() {
        try {
            return await this.prisma.item.count();
        }
        catch (error) {
            this.logger.error(`Error getting items count: ${error.message}`);
            return 0;
        }
    }
};
exports.ItemsService = ItemsService;
exports.ItemsService = ItemsService = ItemsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ItemsService);
