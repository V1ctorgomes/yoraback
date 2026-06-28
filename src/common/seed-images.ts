function unsplash(photoId: string, width: number) {
  return `https://images.unsplash.com/photo-${photoId}?w=${width}&q=80&auto=format&fit=crop`;
}

export const seedImages = {
  banners: {
    summerDrop: unsplash('1594381898411-846e597a82cd', 1920),
    essentials: unsplash('1571019614242-c5c5dee9f50b', 1920),
  },
  categories: {
    camisetas: {
      imageUrl: unsplash('1594381898411-846e597a82cd', 800),
      bannerImageUrl: unsplash('1594381898411-846e597a82cd', 1600),
    },
    moletons: {
      imageUrl: unsplash('1556821840-3a63f95609a7', 800),
      bannerImageUrl: unsplash('1556821840-3a63f95609a7', 1600),
    },
    calcas: {
      imageUrl: unsplash('1506629082955-511b1aa562c8', 800),
      bannerImageUrl: unsplash('1506629082955-511b1aa562c8', 1600),
    },
    bones: {
      imageUrl: unsplash('1434682881178-15c34545e4ee', 800),
      bannerImageUrl: unsplash('1434682881178-15c34545e4ee', 1600),
    },
    acessorios: {
      imageUrl: unsplash('1518310383802-640c233de4b5', 800),
      bannerImageUrl: unsplash('1518310383802-640c233de4b5', 1600),
    },
  },
  collections: {
    'winter-2026': {
      bannerImageUrl: unsplash('1556821840-3a63f95609a7', 1600),
      thumbnailImageUrl: unsplash('1556821840-3a63f95609a7', 800),
    },
    'street-vol-1': {
      bannerImageUrl: unsplash('1515886657613-9f3515b0c78f', 1600),
      thumbnailImageUrl: unsplash('1515886657613-9f3515b0c78f', 800),
    },
    'black-collection': {
      bannerImageUrl: unsplash('1538805060514-97d9cc17730c', 1600),
      thumbnailImageUrl: unsplash('1538805060514-97d9cc17730c', 800),
    },
  },
  products: {
    'legging-flow': unsplash('1506629082955-511b1aa562c8', 600),
    'top-cruzado': unsplash('1594381898411-846e597a82cd', 600),
    'conjunto-aura': unsplash('1515886657613-9f3515b0c78f', 600),
    'macacao-slim': unsplash('1599901869650-70188a963a17', 600),
    'short-performance': unsplash('1574680096145-d05b8e5ed4fc', 600),
    'jaqueta-studio': unsplash('1556821840-3a63f95609a7', 600),
    'calca-flare': unsplash('1548690318-9fbfbd89a322', 600),
    'top-longline': unsplash('1571902943202-507ec2618e8f', 600),
  },
  brandStory: unsplash('1574680096145-d05b8e5ed4fc', 800),
} as const;
