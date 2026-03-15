import { Module, Global } from '@nestjs/common';
import { StorageService } from './storage.service';
import { DatabaseStorage } from './database-storage.service';

@Global()
@Module({
  providers: [
    {
      provide: StorageService,
      useClass: DatabaseStorage,
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}

