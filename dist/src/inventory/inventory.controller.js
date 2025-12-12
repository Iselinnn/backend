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
var InventoryController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryController = void 0;
const common_1 = require("@nestjs/common");
const inventory_service_1 = require("./inventory.service");
let InventoryController = InventoryController_1 = class InventoryController {
    inventoryService;
    logger = new common_1.Logger(InventoryController_1.name);
    constructor(inventoryService) {
        this.inventoryService = inventoryService;
    }
    async getMyInventory(req, steamIdParam) {
        try {
            let steamId = req.session?.user?.steamId || req.user?.steamId;
            this.logger.log(`Session data: ${JSON.stringify(req.session?.user)}`);
            this.logger.log(`Request user: ${JSON.stringify(req.user)}`);
            if (!steamId) {
                const querySteamId = req.query?.steamId;
                if (querySteamId) {
                    this.logger.log(`No steamId in session, using query parameter: ${querySteamId}`);
                    steamId = querySteamId;
                }
            }
            if (!steamId || steamId.trim() === '') {
                this.logger.warn('No steamId found in session or query parameter');
                throw new common_1.HttpException('Steam ID is required. Provide it either through authentication, or as query parameter: /inventory/me?steamId=YOUR_STEAM_ID', common_1.HttpStatus.BAD_REQUEST);
            }
            this.logger.log(`Fetching inventory for steamId: ${steamId}`);
            const forceRefresh = req.query?.force === 'true' || req.query?.force === true;
            const inventory = await this.inventoryService.fetchAndSyncInventory(steamId, forceRefresh);
            return inventory;
        }
        catch (error) {
            this.logger.error(`Error in getMyInventory: ${error.message}`);
            this.logger.error(`Stack: ${error.stack}`);
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            throw new common_1.HttpException(`Failed to fetch inventory: ${error.message || 'Unknown error'}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getInventory(steamIdParam, req) {
        try {
            let steamId = req.session?.user?.steamId || req.user?.steamId;
            this.logger.log(`Session data: ${JSON.stringify(req.session?.user)}`);
            this.logger.log(`Request user: ${JSON.stringify(req.user)}`);
            this.logger.log(`URL parameter steamId: ${steamIdParam}`);
            if (!steamId) {
                this.logger.log('No steamId in session, using URL parameter');
                steamId = steamIdParam;
            }
            else {
                this.logger.log(`Using steamId from session: ${steamId}`);
            }
            if (!steamId || steamId.trim() === '') {
                this.logger.error('No steamId found in session or URL parameter');
                throw new common_1.HttpException('Steam ID is required. Provide it either through authentication or as URL parameter.', common_1.HttpStatus.BAD_REQUEST);
            }
            this.logger.log(`Fetching and syncing inventory for steamId: ${steamId}`);
            const forceRefresh = req.query?.force === 'true' || req.query?.force === true;
            const inventory = await this.inventoryService.fetchAndSyncInventory(steamId, forceRefresh);
            this.logger.log(`Successfully fetched ${inventory.length} items for steamId: ${steamId}`);
            if (inventory.length > 0) {
                const firstItem = inventory[0];
                this.logger.log(`Sample item - Name: ${firstItem.name}, ImageURL: ${firstItem.imageUrl}`);
            }
            return inventory;
        }
        catch (error) {
            this.logger.error(`Error in getInventory: ${error.message}`);
            this.logger.error(`Stack: ${error.stack}`);
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            throw new common_1.HttpException(`Failed to fetch inventory: ${error.message || 'Unknown error'}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.InventoryController = InventoryController;
__decorate([
    (0, common_1.Get)('me'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('steamId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "getMyInventory", null);
__decorate([
    (0, common_1.Get)(':steamId'),
    __param(0, (0, common_1.Param)('steamId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "getInventory", null);
exports.InventoryController = InventoryController = InventoryController_1 = __decorate([
    (0, common_1.Controller)('inventory'),
    __metadata("design:paramtypes", [inventory_service_1.InventoryService])
], InventoryController);
