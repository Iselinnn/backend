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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var ImageProxyController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageProxyController = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
let ImageProxyController = ImageProxyController_1 = class ImageProxyController {
    logger = new common_1.Logger(ImageProxyController_1.name);
    async proxyImage(req, res) {
        try {
            const urlPath = req.url;
            const imagePathMatch = urlPath.match(/^\/image-proxy\/(.+)$/);
            if (!imagePathMatch || !imagePathMatch[1]) {
                this.logger.error(`Invalid image path in URL: ${urlPath}`);
                throw new common_1.HttpException('Image path is required', common_1.HttpStatus.BAD_REQUEST);
            }
            const decodedPath = decodeURIComponent(imagePathMatch[1]);
            this.logger.debug(`Proxying image: ${decodedPath}`);
            const cdnUrls = [
                `https://community.fastly.steamstatic.com/economy/image/${decodedPath}`,
                `https://community.cloudflare.steamstatic.com/economy/image/${decodedPath}`,
                `https://steamcommunity-a.akamaihd.net/economy/image/${decodedPath}`,
            ];
            let imageData = null;
            let contentType = 'image/png';
            for (const url of cdnUrls) {
                try {
                    this.logger.debug(`Trying to fetch image from: ${url}`);
                    const response = await axios_1.default.get(url, {
                        responseType: 'arraybuffer',
                        timeout: 10000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                            'Referer': 'https://steamcommunity.com/',
                        },
                        validateStatus: (status) => status < 500,
                    });
                    if (response.status === 200 && response.data) {
                        imageData = Buffer.from(response.data);
                        contentType = response.headers['content-type'] || 'image/png';
                        this.logger.debug(`Successfully fetched image from: ${url}`);
                        break;
                    }
                }
                catch (error) {
                    this.logger.debug(`Failed to fetch from ${url}: ${error.message}`);
                    continue;
                }
            }
            if (!imageData) {
                throw new common_1.HttpException('Failed to fetch image from all CDN sources', common_1.HttpStatus.NOT_FOUND);
            }
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.send(imageData);
        }
        catch (error) {
            this.logger.error(`Error proxying image: ${error.message}`);
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            throw new common_1.HttpException(`Failed to proxy image: ${error.message || 'Unknown error'}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.ImageProxyController = ImageProxyController;
__decorate([
    (0, common_1.Get)('*'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ImageProxyController.prototype, "proxyImage", null);
exports.ImageProxyController = ImageProxyController = ImageProxyController_1 = __decorate([
    (0, common_1.Controller)('image-proxy')
], ImageProxyController);
