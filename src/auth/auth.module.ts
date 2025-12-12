import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { SteamStrategy } from './steam.strategy';
import { AuthController } from './auth.controller';

@Module({
  imports: [PassportModule.register({ session: true })],
  providers: [AuthService, SteamStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}

