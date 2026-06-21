import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';
import { BannersService } from './banners/banners.service';
import { CategoriesService } from './categories/categories.service';
import { CollectionsService } from './collections/collections.service';
import { ProductsService } from './products/products.service';
import { ProductVariantsService } from './products/product-variants.service';
import { ProductImagesService } from './products/product-images.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()) ?? [
      'http://localhost:3000',
    ],
    credentials: true,
    exposedHeaders: ['X-Cart-Token'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const authService = app.get(AuthService);
  await authService.seedAdmin();

  const bannersService = app.get(BannersService);
  await bannersService.seedDefaults();

  const categoriesService = app.get(CategoriesService);
  await categoriesService.seedDefaults();

  const productsService = app.get(ProductsService);
  await productsService.seedDefaults();

  const productVariantsService = app.get(ProductVariantsService);
  await productVariantsService.seedDefaults();

  const productImagesService = app.get(ProductImagesService);
  await productImagesService.seedDefaults();

  const collectionsService = app.get(CollectionsService);
  await collectionsService.seedDefaults();

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}

bootstrap();
