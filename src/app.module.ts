import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { BannersModule } from './banners/banners.module';
import { CartModule } from './cart/cart.module';
import { CategoriesModule } from './categories/categories.module';
import { CollectionsModule } from './collections/collections.module';
import { HealthModule } from './health/health.module';
import { ProductsModule } from './products/products.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    BannersModule,
    CartModule,
    CategoriesModule,
    CollectionsModule,
    ProductsModule,
    HealthModule,
  ],
})
export class AppModule {}
