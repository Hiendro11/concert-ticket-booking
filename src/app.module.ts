import {
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { RequestIdMiddleware } from './common/request/request-id.middleware';
import { ConcertsModule } from './modules/concerts/concerts.module';
import { OperationsModule } from './modules/operations/operations.module';
import { BookingsModule } from './modules/bookings/bookings.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    HealthModule,
    ConcertsModule,
    OperationsModule,
    BookingsModule,
  ],
})

export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}