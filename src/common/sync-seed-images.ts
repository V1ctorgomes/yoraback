import { PrismaClient } from '@prisma/client';
import { seedImages } from './seed-images';

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

  for (const [slug, coverImage] of Object.entries(seedImages.products)) {
    const product = await prisma.product.findUnique({
      where: { slug },
      select: {
        id: true,
        images: {
          orderBy: { displayOrder: 'asc' },
          take: 1,
          select: { id: true },
        },
      },
    });

    if (!product) continue;

    await prisma.product.update({
      where: { id: product.id },
      data: { coverImage },
    });

    const firstImage = product.images[0];
    if (firstImage) {
      await prisma.productImage.update({
        where: { id: firstImage.id },
        data: { imageUrl: coverImage },
      });
    }
  }

  const banners = await prisma.banner.findMany({
    orderBy: { displayOrder: 'asc' },
    take: 2,
    select: { id: true, displayOrder: true },
  });

  const bannerImages = [
    seedImages.banners.summerDrop,
    seedImages.banners.essentials,
  ];

  await Promise.all(
    banners.map((banner, index) =>
      prisma.banner.update({
        where: { id: banner.id },
        data: { imageUrl: bannerImages[index] ?? bannerImages[0] },
      }),
    ),
  );
}
