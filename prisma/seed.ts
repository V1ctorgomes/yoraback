import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

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
          imageUrl:
            'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1920&q=80&auto=format&fit=crop',
          buttonText: 'Explorar coleção',
          buttonLink: '/colecoes/summer-drop',
          displayOrder: 0,
          isActive: true,
        },
        {
          title: 'Essentials',
          subtitle: 'Os favoritos de quem entende de estilo e conforto.',
          imageUrl:
            'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=1920&q=80&auto=format&fit=crop',
          buttonText: 'Ver best sellers',
          buttonLink: '/colecoes/essentials',
          displayOrder: 1,
          isActive: true,
        },
      ],
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
