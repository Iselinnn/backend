import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  
  constructor(private prisma: PrismaService) {}

  async validateUser(profile: any): Promise<any> {
    try {
      this.logger.log(`Validating user profile: ${JSON.stringify(profile)}`);
      
      if (!profile || !profile.id) {
        this.logger.error('Invalid profile: missing id');
        throw new Error('Invalid Steam profile: missing id');
      }

      const { id, displayName, photos } = profile;
      
      // Safely get avatar - photos array might have different lengths
      let avatar = null;
      if (photos && photos.length > 0) {
        avatar = photos[photos.length - 1]?.value || photos[0]?.value || null;
      }
      
      this.logger.log(`Authenticating Steam user: ${id} (${displayName})`);
      
      // Try to save user, but don't fail if DB is unavailable
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
      } catch (dbError: any) {
        this.logger.error(`Database error during user save: ${dbError.message}`);
        // Return user object anyway, even if DB save failed
        return {
          steamId: id,
          name: displayName,
          avatar: avatar,
        };
      }
    } catch (error: any) {
      this.logger.error(`Failed to validate user: ${error.message || error}`);
      this.logger.error(`Stack: ${error.stack}`);
      
      // Return a minimal user object to prevent crash
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
}
