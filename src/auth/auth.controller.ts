import { Controller, Get, Post, UseGuards, Req, Res, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';

// Extend Express Session type
declare module 'express-session' {
  interface SessionData {
    user?: any;
  }
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  @Get('steam')
  @UseGuards(AuthGuard('steam'))
  async steamLogin() {
    // Initiates the Steam login flow
    this.logger.log('Steam login initiated');
  }

  @Get('steam/return')
  @UseGuards(AuthGuard('steam'))
  async steamReturn(@Req() req: Request & { user?: any }, @Res() res: Response) {
    try {
      this.logger.log('Steam return callback received');
      this.logger.log(`User object: ${JSON.stringify(req.user)}`);
      
      if (!req.user) {
        this.logger.error('No user object in request');
        throw new HttpException('Authentication failed: No user data', HttpStatus.UNAUTHORIZED);
      }
      
      // Store user in session
      if (req.session) {
        req.session.user = req.user;
        this.logger.log(`User ${req.user.steamId} stored in session`);
      } else {
        this.logger.warn('Session not available, but continuing...');
      }

      // Return HTML page that closes the window and notifies parent
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
    } catch (error: any) {
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
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(html);
    }
  }

  @Get('success')
  async authSuccess() {
    // Simple success page for mobile WebView
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

  @Get('me')
  async getMe(@Req() req: Request & { user?: any }) {
    // Check session first (for web browsers with cookies)
    if (req.session?.user) {
      this.logger.log(`Returning user from session: ${req.session.user.steamId}`);
      return req.session.user;
    }
    
    // Check req.user (for API calls with auth guard)
    if (req.user) {
      this.logger.log(`Returning user from request: ${req.user.steamId}`);
      return req.user;
    }
    
    // Not authenticated
    this.logger.warn('No user in session or request');
    return { error: 'Not authenticated' };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    this.logger.log('Logout requested');
    
    // Destroy session
    return new Promise<void>((resolve) => {
      req.session?.destroy((err) => {
        if (err) {
          this.logger.error(`Error destroying session: ${err.message}`);
        } else {
          this.logger.log('Session destroyed successfully');
        }
        res.json({ success: true, message: 'Logged out successfully' });
        resolve();
      });
    });
  }
}
