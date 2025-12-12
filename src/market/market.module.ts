import { Module } from '@nestjs/common';
import { MarketService } from './market.service';
import { MarketController } from './market.controller';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [AnalyticsModule],
  controllers: [MarketController],
  providers: [MarketService, PrismaService],
})
export class MarketModule {}

