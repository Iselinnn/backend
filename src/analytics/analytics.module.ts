import { Module } from '@nestjs/common';
import { PriceService } from './price.service';
import { AnalyticsController } from './analytics.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [AnalyticsController],
  providers: [PriceService, PrismaService],
  exports: [PriceService], // Export if needed by other modules
})
export class AnalyticsModule {}

