import { Module, Global } from '@nestjs/common';
import { DatabaseStorageService } from './database-storage.service';

@Global()
@Module({
  providers: [DatabaseStorageService],
  exports: [DatabaseStorageService],
})
export class StorageModule {}

