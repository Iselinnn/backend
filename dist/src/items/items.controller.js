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
var ItemsController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ItemsController = void 0;
const common_1 = require("@nestjs/common");
const items_service_1 = require("./items.service");
let ItemsController = ItemsController_1 = class ItemsController {
    itemsService;
    logger = new common_1.Logger(ItemsController_1.name);
    constructor(itemsService) {
        this.itemsService = itemsService;
    }
    async getAllItems(limit, offset, forceSteam) {
        const limitNum = limit ? parseInt(limit, 10) : undefined;
        const offsetNum = offset ? parseInt(offset, 10) : undefined;
        const forceSteamApi = forceSteam === 'true';
        if (forceSteamApi) {
            this.logger.log('[GET /items/all] Force fetching from Steam Market API (ignoring database)...');
            const steamItems = await this.itemsService.getAllCS2Items(2, 30000);
            this.logger.log(`[GET /items/all] Steam Market API returned ${steamItems.length} items`);
            if (steamItems.length > 0) {
                return steamItems;
            }
            this.logger.warn('[GET /items/all] Steam Market API returned empty array. Not using database fallback to avoid showing inventory items.');
            return [];
        }
        const dbCount = await this.itemsService.getItemsCount();
        this.logger.log(`[GET /items/all] Database has ${dbCount} items`);
        if (dbCount < 1000) {
            this.logger.log(`[GET /items/all] Database has only ${dbCount} items (likely inventory items, not synced), fetching from Steam Market API...`);
            const steamItems = await this.itemsService.getAllCS2Items(2, 30000);
            this.logger.log(`[GET /items/all] Steam Market API returned ${steamItems.length} items`);
            if (steamItems.length > 0) {
                return steamItems;
            }
            this.logger.warn(`[GET /items/all] Steam Market API returned empty. Not returning ${dbCount} database items to avoid showing inventory items.`);
            return [];
        }
        const dbItems = await this.itemsService.getAllItemsFromDatabase(limitNum, offsetNum);
        if (dbItems.length > 0) {
            this.logger.log(`[GET /items/all] Returning ${dbItems.length} items from database`);
            return dbItems;
        }
        this.logger.warn('[GET /items/all] Database query returned empty, fetching from Steam Market API...');
        const steamItems = await this.itemsService.getAllCS2Items(2, 30000);
        this.logger.log(`[GET /items/all] Steam Market API returned ${steamItems.length} items`);
        return steamItems;
    }
    async getItemsCount() {
        return { count: await this.itemsService.getItemsCount() };
    }
    async syncItems(force) {
        const forceSync = force === 'true';
        this.logger.log(`Starting items sync (force: ${forceSync})...`);
        this.itemsService.syncAllItemsToDatabase(forceSync).then((result) => {
            this.logger.log(`Background sync completed: ${result.synced} synced, ${result.errors} errors`);
        }).catch((error) => {
            this.logger.error(`Background sync failed: ${error.message}`);
        });
        return {
            success: true,
            message: 'Синхронизация запущена в фоновом режиме. Это может занять до 10 минут. Проверьте логи backend для статуса.',
            syncing: true,
        };
    }
    async searchItems(query, forceSteam) {
        const forceSteamApi = forceSteam === 'true';
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
        if (forceSteamApi) {
            this.logger.log(`Searching in Steam Market API for: ${query}`);
            return await this.itemsService.searchItems(query);
        }
        const dbCount = await this.itemsService.getItemsCount();
        if (dbCount < 1000) {
            this.logger.log(`Database has only ${dbCount} items, using Steam Market API for search: ${query}`);
            return await this.itemsService.searchItems(query);
        }
        try {
            const allDbItems = await this.itemsService.getAllItemsFromDatabase();
            const lowerQuery = query.toLowerCase();
            const filtered = allDbItems.filter(item => item.name?.toLowerCase().includes(lowerQuery) ||
                item.market_hash_name?.toLowerCase().includes(lowerQuery));
            if (filtered.length > 0) {
                this.logger.log(`Found ${filtered.length} items in database for query: ${query}`);
                return filtered;
            }
        }
        catch (error) {
            this.logger.debug('Database search failed, falling back to Steam API');
        }
        this.logger.log(`No results in database, searching Steam Market API for: ${query}`);
        return await this.itemsService.searchItems(query);
    }
    async getItemsByType(type) {
        const dbCount = await this.itemsService.getItemsCount();
        if (dbCount < 1000) {
            this.logger.log(`Database has only ${dbCount} items, using Steam Market API for type: ${type}`);
            return await this.itemsService.getItemsByType(type);
        }
        try {
            const allDbItems = await this.itemsService.getAllItemsFromDatabase();
            const filtered = allDbItems.filter(item => item.type === type);
            if (filtered.length > 0) {
                this.logger.log(`Found ${filtered.length} items in database for type: ${type}`);
                return filtered;
            }
        }
        catch (error) {
            this.logger.debug('Database filter failed, falling back to Steam API');
        }
        this.logger.log(`No results in database, using Steam Market API for type: ${type}`);
        return await this.itemsService.getItemsByType(type);
    }
};
exports.ItemsController = ItemsController;
__decorate([
    (0, common_1.Get)('all'),
    __param(0, (0, common_1.Query)('limit')),
    __param(1, (0, common_1.Query)('offset')),
    __param(2, (0, common_1.Query)('forceSteam')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], ItemsController.prototype, "getAllItems", null);
__decorate([
    (0, common_1.Get)('count'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ItemsController.prototype, "getItemsCount", null);
__decorate([
    (0, common_1.Post)('sync'),
    __param(0, (0, common_1.Query)('force')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ItemsController.prototype, "syncItems", null);
__decorate([
    (0, common_1.Get)('search'),
    __param(0, (0, common_1.Query)('q')),
    __param(1, (0, common_1.Query)('forceSteam')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ItemsController.prototype, "searchItems", null);
__decorate([
    (0, common_1.Get)('type/:type'),
    __param(0, (0, common_1.Param)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ItemsController.prototype, "getItemsByType", null);
exports.ItemsController = ItemsController = ItemsController_1 = __decorate([
    (0, common_1.Controller)('items'),
    __metadata("design:paramtypes", [items_service_1.ItemsService])
], ItemsController);
