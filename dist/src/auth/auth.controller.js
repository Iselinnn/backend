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
var AuthController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
let AuthController = AuthController_1 = class AuthController {
    logger = new common_1.Logger(AuthController_1.name);
    async steamLogin() {
        this.logger.log('Steam login initiated');
    }
    async steamReturn(req, res) {
        try {
            this.logger.log('Steam return callback received');
            this.logger.log(`User object: ${JSON.stringify(req.user)}`);
            if (!req.user) {
                this.logger.error('No user object in request');
                throw new common_1.HttpException('Authentication failed: No user data', common_1.HttpStatus.UNAUTHORIZED);
            }
            if (req.session) {
                req.session.user = req.user;
                this.logger.log(`User ${req.user.steamId} stored in session`);
            }
            else {
                this.logger.warn('Session not available, but continuing...');
            }
            const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Steam Authentication</title>
          <meta charset="UTF-8">
        </head>
        <body>
          <script>
            // Try to close the window and notify parent
            if (window.opener) {
              // If opened in popup, notify parent and close
              window.opener.postMessage({ type: 'STEAM_AUTH_SUCCESS', user: ${JSON.stringify(req.user)} }, '*');
              window.close();
            } else {
              // If opened in same window (mobile WebView), redirect to success page
              window.location.href = 'http://localhost:3000/auth/success';
            }
          </script>
          <p>Authentication successful! You can close this window.</p>
        </body>
        </html>
      `;
            res.setHeader('Content-Type', 'text/html');
            res.send(html);
        }
        catch (error) {
            this.logger.error(`Steam auth error: ${error.message || error}`);
            this.logger.error(`Stack: ${error.stack}`);
            const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Steam Authentication Error</title>
          <meta charset="UTF-8">
        </head>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'STEAM_AUTH_ERROR', error: '${error.message || 'Unknown error'}' }, '*');
              window.close();
            } else {
              window.location.href = 'http://localhost:3000/auth/error?message=${encodeURIComponent(error.message || 'Unknown error')}';
            }
          </script>
          <p>Authentication failed: ${error.message || 'Unknown error'}</p>
        </body>
        </html>
      `;
            res.setHeader('Content-Type', 'text/html');
            res.status(common_1.HttpStatus.INTERNAL_SERVER_ERROR).send(html);
        }
    }
    async authSuccess() {
        return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Successful</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #170704;
            color: #A1937E;
          }
          .container {
            text-align: center;
            padding: 20px;
          }
          h1 {
            color: #4D1519;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✓ Authentication Successful!</h1>
          <p>You can close this window now.</p>
        </div>
      </body>
      </html>
    `;
    }
    async getMe(req) {
        if (req.session?.user) {
            this.logger.log(`Returning user from session: ${req.session.user.steamId}`);
            return req.session.user;
        }
        if (req.user) {
            this.logger.log(`Returning user from request: ${req.user.steamId}`);
            return req.user;
        }
        this.logger.warn('No user in session or request');
        return { error: 'Not authenticated' };
    }
    async logout(req, res) {
        this.logger.log('Logout requested');
        return new Promise((resolve) => {
            req.session?.destroy((err) => {
                if (err) {
                    this.logger.error(`Error destroying session: ${err.message}`);
                }
                else {
                    this.logger.log('Session destroyed successfully');
                }
                res.json({ success: true, message: 'Logged out successfully' });
                resolve();
            });
        });
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Get)('steam'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('steam')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "steamLogin", null);
__decorate([
    (0, common_1.Get)('steam/return'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('steam')),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "steamReturn", null);
__decorate([
    (0, common_1.Get)('success'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "authSuccess", null);
__decorate([
    (0, common_1.Get)('me'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "getMe", null);
__decorate([
    (0, common_1.Post)('logout'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
exports.AuthController = AuthController = AuthController_1 = __decorate([
    (0, common_1.Controller)('auth')
], AuthController);
