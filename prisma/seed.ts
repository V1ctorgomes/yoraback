import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { seedImages } from '../src/common/seed-images';
import { syncSeedImages } from '../src/common/sync-seed-images';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@yora.com.br';
  const password = process.env.ADMIN_PASSWORD ?? 'Admin@123';

  const existingAdmin = await prisma.admin.findUnique({ where: { email } });
  if (!existingAdmin) {
    await prisma.admin.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
      },
    });
  }

  const bannerCount = await prisma.banner.count();
  if (bannerCount === 0) {
    await prisma.banner.createMany({
      data: [
        {
          title: 'Summer Drop',
          subtitle:
            'Peças leves para treinar, viver e brilhar — edição limitada.',
          imageUrl: seedImages.banners.summerDrop.desktop,
          mobileImageUrl: seedImages.banners.summerDrop.mobile,
          buttonText: 'Explorar coleção',
          buttonLink: '/colecoes/summer-drop',
          displayOrder: 0,
          isActive: true,
        },
        {
          title: 'Essentials',
          subtitle: 'Os favoritos de quem entende de estilo e conforto.',
          imageUrl: seedImages.banners.essentials.desktop,
          mobileImageUrl: seedImages.banners.essentials.mobile,
          buttonText: 'Ver best sellers',
          buttonLink: '/colecoes/essentials',
          displayOrder: 1,
          isActive: true,
        },
      ],
    });
  }

  await syncSeedImages(prisma);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
