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
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma.service");
let AuthService = AuthService_1 = class AuthService {
    prisma;
    logger = new common_1.Logger(AuthService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async validateUser(profile) {
        try {
            this.logger.log(`Validating user profile: ${JSON.stringify(profile)}`);
            if (!profile || !profile.id) {
                this.logger.error('Invalid profile: missing id');
                throw new Error('Invalid Steam profile: missing id');
            }
            const { id, displayName, photos } = profile;
            let avatar = null;
            if (photos && photos.length > 0) {
                avatar = photos[photos.length - 1]?.value || photos[0]?.value || null;
            }
            this.logger.log(`Authenticating Steam user: ${id} (${displayName})`);
            try {
                const user = await this.prisma.user.upsert({
                    where: { steamId: id },
                    update: {
                        name: displayName,
                        avatar: avatar,
                    },
                    create: {
                        steamId: id,
                        name: displayName,
                        avatar: avatar,
                    },
                });
                this.logger.log(`User authenticated successfully: ${user.steamId}`);
                return user;
            }
            catch (dbError) {
                this.logger.error(`Database error during user save: ${dbError.message}`);
                return {
                    steamId: id,
                    name: displayName,
                    avatar: avatar,
                };
            }
        }
        catch (error) {
            this.logger.error(`Failed to validate user: ${error.message || error}`);
            this.logger.error(`Stack: ${error.stack}`);
            if (profile && profile.id) {
                return {
                    steamId: profile.id,
                    name: profile.displayName || 'Unknown',
                    avatar: null,
                };
            }
            throw error;
        }
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AuthService);
