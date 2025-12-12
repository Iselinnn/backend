import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { ImageProxyController } from './image-proxy.controller';

@Module({
  controllers: [InventoryController, ImageProxyController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}

