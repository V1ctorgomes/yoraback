import { PrismaClient } from '@prisma/client';
import { seedImages } from './seed-images';

const SEED_PRODUCT_SLUGS = Object.keys(seedImages.products);

export async function syncSeedImages(prisma: PrismaClient) {
  await Promise.all(
    Object.entries(seedImages.categories).map(([slug, images]) =>
      prisma.category.updateMany({
        where: { slug },
        data: images,
      }),
    ),
  );

  await Promise.all(
    Object.entries(seedImages.collections).map(([slug, images]) =>
      prisma.collection.updateMany({
        where: { slug },
        data: images,
      }),
    ),
  );

  for (const slug of SEED_PRODUCT_SLUGS) {
    const config = seedImages.products[slug as keyof typeof seedImages.products];
    const product = await prisma.product.findUnique({
      where: { slug },
      select: { id: true, name: true },
    });

    if (!product) continue;

    await prisma.product.update({
      where: { id: product.id },
      data: { coverImage: config.coverImage },
    });

    await prisma.productImage.deleteMany({
      where: { productId: product.id },
    });

    await prisma.productImage.createMany({
      data: config.gallery.map((image) => ({
        productId: product.id,
        imageUrl: image.imageUrl,
        altText: product.name,
        color: image.color,
        displayOrder: image.displayOrder,
      })),
    });

    await ensureProductVariants(prisma, product.id, slug);
  }

  const banners = await prisma.banner.findMany({
    orderBy: { displayOrder: 'asc' },
    take: 2,
    select: { id: true },
  });

  const bannerConfigs = [
    seedImages.banners.summerDrop,
    seedImages.banners.essentials,
  ];

  await Promise.all(
    banners.map((banner, index) => {
      const config = bannerConfigs[index] ?? bannerConfigs[0];

      return prisma.banner.update({
        where: { id: banner.id },
        data: {
          imageUrl: config.desktop,
          mobileImageUrl: config.mobile,
        },
      });
    }),
  );
}

async function ensureProductVariants(
  prisma: PrismaClient,
  productId: string,
  slug: string,
) {
  const sizes = ['P', 'M', 'G'];
  const stockBySize: Record<string, number> = { P: 12, M: 20, G: 8 };
  const skuPrefix = slug
    .split('-')
    .map((part) => part.slice(0, 3).toUpperCase())
    .join('-');

  const colorCodes: Record<string, string> = {
    Preto: 'PRE',
    Branco: 'BRA',
    Bege: 'BEI',
  };

  for (const color of seedImages.variantColors) {
    for (const size of sizes) {
      const sku = `${skuPrefix}-${colorCodes[color]}-${size}`;
      const existing = await prisma.productVariant.findUnique({
        where: { sku },
        select: { id: true },
      });

      if (existing) continue;

      await prisma.productVariant.create({
        data: {
          productId,
          sku,
          color,
          size,
          stock: stockBySize[size] ?? 10,
          isActive: true,
        },
      });
    }
  }
}
