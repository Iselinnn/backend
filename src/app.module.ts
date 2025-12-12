import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { InventoryModule } from './inventory/inventory.module';
import { MarketModule } from './market/market.module';
import { PrismaModule } from './prisma.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ItemsModule } from './items/items.module';

@Module({
  imports: [PrismaModule, AuthModule, InventoryModule, AnalyticsModule, MarketModule, ItemsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
