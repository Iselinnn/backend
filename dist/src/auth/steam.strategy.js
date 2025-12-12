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
var SteamStrategy_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SteamStrategy = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const passport_steam_1 = require("passport-steam");
const auth_service_1 = require("./auth.service");
let SteamStrategy = SteamStrategy_1 = class SteamStrategy extends (0, passport_1.PassportStrategy)(passport_steam_1.Strategy, 'steam') {
    authService;
    logger = new common_1.Logger(SteamStrategy_1.name);
    constructor(authService) {
        const apiKey = process.env.STEAM_API_KEY || '';
        const appUrl = process.env.APP_URL || 'http://localhost:3000';
        super({
            returnURL: `${appUrl}/auth/steam/return`,
            realm: appUrl,
            apiKey: apiKey,
        });
        this.authService = authService;
        this.logger.log(`Initializing Steam Strategy with API Key: ${apiKey ? 'SET (' + apiKey.substring(0, 8) + '...)' : 'NOT SET'}`);
        this.logger.log(`App URL: ${appUrl}`);
    }
    async validate(identifier, profile, done) {
        try {
            this.logger.log(`Validating Steam user: ${identifier}`);
            const user = await this.authService.validateUser(profile);
            done(null, user);
        }
        catch (err) {
            this.logger.error(`Validation error: ${err.message || err}`);
            done(err, null);
        }
    }
};
exports.SteamStrategy = SteamStrategy;
exports.SteamStrategy = SteamStrategy = SteamStrategy_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], SteamStrategy);
