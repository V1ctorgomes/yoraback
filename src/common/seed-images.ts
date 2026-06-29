function unsplash(photoId: string, width: number) {
  return `https://images.unsplash.com/photo-${photoId}?ixlib=rb-4.0.3&auto=format&fit=crop&w=${width}&q=80`;
}

/** IDs verificados (HTTP 200) — moda fitness feminina */
const p = {
  heroWorkout: '1571019614242-c5c5dee9f50b',
  yogaGroup: '1518611012118-696072aa579a',
  yellowLeggings: '1506629082955-511b1aa562c8',
  greyHoodie: '1556821840-3a63f95609a7',
  streetActivewear: '1515886657613-9f3515b0c78f',
  blackPinkSet: '1538805060514-97d9cc17730c',
  gymBarbell: '1571902943202-507ec2618e8f',
  gymTraining: '1534438327276-14e5300c3a48',
  activewearStudio: '1486218119243-13883505764c',
  fitnessStudio: '1576678927484-cc907957088c',
  yogaPose: '1544367567-0f2fcb009e0b',
  pinkSporty: '1487412720507-e7ab37603c6f',
  gymWoman: '1461896836934-ffe607ba8211',
  fitnessJump: '1571019613454-1cb2f99b2d8b',
  activeLifestyle: '1540497077202-7c8a3999166f',
  stretching: '1526506118085-60ce8714f8c5',
} as const;

export type SeedGalleryImage = {
  imageUrl: string;
  color: string | null;
  displayOrder: number;
};

export type SeedProductConfig = {
  coverImage: string;
  gallery: SeedGalleryImage[];
};

export const seedImages = {
  banners: {
    summerDrop: {
      desktop: unsplash(p.heroWorkout, 1920),
      mobile: unsplash(p.fitnessJump, 1080),
    },
    essentials: {
      desktop: unsplash(p.yogaGroup, 1920),
      mobile: unsplash(p.stretching, 1080),
    },
  },
  categories: {
    camisetas: {
      imageUrl: unsplash(p.gymBarbell, 800),
      bannerImageUrl: unsplash(p.blackPinkSet, 1600),
    },
    moletons: {
      imageUrl: unsplash(p.greyHoodie, 800),
      bannerImageUrl: unsplash(p.greyHoodie, 1600),
    },
    calcas: {
      imageUrl: unsplash(p.yellowLeggings, 800),
      bannerImageUrl: unsplash(p.yellowLeggings, 1600),
    },
    bones: {
      imageUrl: unsplash(p.activeLifestyle, 800),
      bannerImageUrl: unsplash(p.fitnessJump, 1600),
    },
    acessorios: {
      imageUrl: unsplash(p.yogaPose, 800),
      bannerImageUrl: unsplash(p.stretching, 1600),
    },
  },
  collections: {
    'winter-2026': {
      bannerImageUrl: unsplash(p.greyHoodie, 1600),
      thumbnailImageUrl: unsplash(p.greyHoodie, 800),
    },
    'street-vol-1': {
      bannerImageUrl: unsplash(p.streetActivewear, 1600),
      thumbnailImageUrl: unsplash(p.streetActivewear, 800),
    },
    'black-collection': {
      bannerImageUrl: unsplash(p.blackPinkSet, 1600),
      thumbnailImageUrl: unsplash(p.blackPinkSet, 800),
    },
  },
  products: {
    'legging-flow': {
      coverImage: unsplash(p.yellowLeggings, 800),
      gallery: [
        { imageUrl: unsplash(p.yellowLeggings, 800), color: 'Bege', displayOrder: 0 },
        { imageUrl: unsplash(p.blackPinkSet, 800), color: 'Preto', displayOrder: 1 },
        { imageUrl: unsplash(p.pinkSporty, 800), color: 'Branco', displayOrder: 2 },
      ],
    },
    'top-cruzado': {
      coverImage: unsplash(p.blackPinkSet, 800),
      gallery: [
        { imageUrl: unsplash(p.blackPinkSet, 800), color: 'Preto', displayOrder: 0 },
        { imageUrl: unsplash(p.pinkSporty, 800), color: 'Branco', displayOrder: 1 },
        { imageUrl: unsplash(p.yellowLeggings, 800), color: 'Bege', displayOrder: 2 },
      ],
    },
    'conjunto-aura': {
      coverImage: unsplash(p.streetActivewear, 800),
      gallery: [
        { imageUrl: unsplash(p.streetActivewear, 800), color: 'Bege', displayOrder: 0 },
        { imageUrl: unsplash(p.blackPinkSet, 800), color: 'Preto', displayOrder: 1 },
        { imageUrl: unsplash(p.greyHoodie, 800), color: 'Branco', displayOrder: 2 },
      ],
    },
    'macacao-slim': {
      coverImage: unsplash(p.activewearStudio, 800),
      gallery: [
        { imageUrl: unsplash(p.activewearStudio, 800), color: 'Preto', displayOrder: 0 },
        { imageUrl: unsplash(p.yogaPose, 800), color: 'Branco', displayOrder: 1 },
        { imageUrl: unsplash(p.yellowLeggings, 800), color: 'Bege', displayOrder: 2 },
      ],
    },
    'short-performance': {
      coverImage: unsplash(p.fitnessJump, 800),
      gallery: [
        { imageUrl: unsplash(p.fitnessJump, 800), color: 'Preto', displayOrder: 0 },
        { imageUrl: unsplash(p.activeLifestyle, 800), color: 'Branco', displayOrder: 1 },
        { imageUrl: unsplash(p.stretching, 800), color: 'Bege', displayOrder: 2 },
      ],
    },
    'jaqueta-studio': {
      coverImage: unsplash(p.greyHoodie, 800),
      gallery: [
        { imageUrl: unsplash(p.greyHoodie, 800), color: 'Branco', displayOrder: 0 },
        { imageUrl: unsplash(p.gymTraining, 800), color: 'Preto', displayOrder: 1 },
        { imageUrl: unsplash(p.fitnessStudio, 800), color: 'Bege', displayOrder: 2 },
      ],
    },
    'calca-flare': {
      coverImage: unsplash(p.pinkSporty, 800),
      gallery: [
        { imageUrl: unsplash(p.pinkSporty, 800), color: 'Branco', displayOrder: 0 },
        { imageUrl: unsplash(p.yellowLeggings, 800), color: 'Bege', displayOrder: 1 },
        { imageUrl: unsplash(p.blackPinkSet, 800), color: 'Preto', displayOrder: 2 },
      ],
    },
    'top-longline': {
      coverImage: unsplash(p.gymBarbell, 800),
      gallery: [
        { imageUrl: unsplash(p.gymBarbell, 800), color: 'Preto', displayOrder: 0 },
        { imageUrl: unsplash(p.streetActivewear, 800), color: 'Bege', displayOrder: 1 },
        { imageUrl: unsplash(p.pinkSporty, 800), color: 'Branco', displayOrder: 2 },
      ],
    },
  } satisfies Record<string, SeedProductConfig>,
  brandStory: unsplash(p.stretching, 1200),
  variantColors: ['Preto', 'Branco', 'Bege'] as const,
} as const;

export function getProductCoverImage(slug: string, fallback: string) {
  const product = seedImages.products[slug as keyof typeof seedImages.products];
  return product?.coverImage ?? fallback;
}
