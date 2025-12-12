import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-steam';
import { AuthService } from './auth.service';

@Injectable()
export class SteamStrategy extends PassportStrategy(Strategy, 'steam') {
  private readonly logger = new Logger(SteamStrategy.name);

  constructor(private authService: AuthService) {
    const apiKey = process.env.STEAM_API_KEY || '';
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    
    // super() must be called first
    super({
      returnURL: `${appUrl}/auth/steam/return`,
      realm: appUrl,
      apiKey: apiKey,
    });
    
    // Now we can use this.logger after super()
    this.logger.log(`Initializing Steam Strategy with API Key: ${apiKey ? 'SET (' + apiKey.substring(0, 8) + '...)' : 'NOT SET'}`);
    this.logger.log(`App URL: ${appUrl}`);
  }

  async validate(identifier: string, profile: any, done: Function) {
    try {
      this.logger.log(`Validating Steam user: ${identifier}`);
      const user = await this.authService.validateUser(profile);
      done(null, user);
    } catch (err: any) {
      this.logger.error(`Validation error: ${err.message || err}`);
      done(err, null);
    }
  }
}
