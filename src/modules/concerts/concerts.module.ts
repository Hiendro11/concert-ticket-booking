import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';

import { ConcertsController } from './concerts.controller';
import { ConcertsService } from './concerts.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ConcertsController],
  providers: [ConcertsService],
  exports: [ConcertsService],
})
export class ConcertsModule {}