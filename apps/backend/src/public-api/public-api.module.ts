import { Module } from '@nestjs/common';
import { PublicApiController, ApiKeyController } from './public-api.controller';
import { PublicApiService } from './public-api.service';
import { ApiKeyService } from './api-key.service';
import { ApiKeyGuard } from './guards/api-key.guard';

@Module({
  controllers: [PublicApiController, ApiKeyController],
  providers: [PublicApiService, ApiKeyService, ApiKeyGuard],
  exports: [ApiKeyService],
})
export class PublicApiModule {}
