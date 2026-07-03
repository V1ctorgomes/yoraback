import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProductSearchSort,
  SearchProductsDto,
  SearchSuggestionsDto,
} from './dto/search-products.dto';
import {
  matchesSearchTokens,
  normalizeSearchText,
  sanitizeSearchTerm,
  tokenizeSearchQuery,
} from './product-search.util';

const searchListSelect = {
  id: true,
  name: true,
  slug: true,
  shortDescription: true,
  description: true,
  basePrice: true,
  coverImage: true,
  isFeatured: true,
  isNew: true,
  isOnSale: true,
  compareAtPrice: true,
  createdAt: true,
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  collection: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  variants: {
    where: { isActive: true },
    select: {
      color: true,
      size: true,
      sku: true,
      stock: true,
    },
  },
  images: {
    orderBy: { displayOrder: 'asc' as const },
    select: {
      id: true,
      imageUrl: true,
      altText: true,
      color: true,
      displayOrder: true,
    },
  },
} as const;

type SearchProductRecord = Prisma.ProductGetPayload<{
  select: typeof searchListSelect;
}>;

@Injectable()
export class ProductSearchService {
  constructor(private prisma: PrismaService) {}

  async search(query: SearchProductsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;
    const term = sanitizeSearchTerm(query.q);
    const tokens = tokenizeSearchQuery(term);

    const products = await this.loadCandidates(query);
    const filtered = products.filter((product) =>
      this.matchesFilters(product, query, tokens),
    );

    const sorted = this.sortProducts(filtered, query.sort ?? ProductSearchSort.RELEVANCE, tokens);
    const total = sorted.length;
    const slice = sorted.slice((page - 1) * limit, page * limit);

    if (term.length >= 2) {
      void this.logSearch(term, total);
    }

    return {
      data: slice.map((product) => this.serializeProduct(product)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        q: term || null,
      },
      filters: this.buildAvailableFilters(filtered),
    };
  }

  async suggestions(query: SearchSuggestionsDto) {
    const term = sanitizeSearchTerm(query.q);
    const tokens = tokenizeSearchQuery(term);

    if (tokens.length === 0) {
      return { data: [] };
    }

    const products = await this.loadCandidates({ q: term });
    const matched = products
      .filter((product) => this.matchesText(product, tokens))
      .slice(0, 10);

    if (term.length >= 2) {
      void this.logSearch(term, matched.length);
    }

    return {
      data: matched.map((product) => ({
        id: product.id,
        name: product.name,
        slug: product.slug,
        coverImage: product.coverImage,
        basePrice: Number(product.basePrice),
        category: product.category,
      })),
    };
  }

  async getSearchAnalytics() {
    const [totalSearches, topTerms] = await Promise.all([
      this.prisma.searchQueryLog.count(),
      this.prisma.searchQueryLog.groupBy({
        by: ['termNormalized'],
        _count: { _all: true },
        _max: { term: true },
        orderBy: { _count: { termNormalized: 'desc' } },
        take: 20,
      }),
    ]);

    return {
      totalSearches,
      topTerms: topTerms.map((entry) => ({
        term: entry._max.term ?? entry.termNormalized,
        count: entry._count._all,
      })),
    };
  }

  private async loadCandidates(query: SearchProductsDto) {
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(query.category
        ? { category: { slug: query.category, isActive: true } }
        : {}),
      ...(query.collection
        ? { collection: { slug: query.collection, isActive: true } }
        : {}),
      ...(query.onSale !== undefined ? { isOnSale: query.onSale } : {}),
      ...(query.isNew !== undefined ? { isNew: query.isNew } : {}),
      ...(query.minPrice !== undefined || query.maxPrice !== undefined
        ? {
            basePrice: {
              ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
              ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
            },
          }
        : {}),
      ...(query.color || query.size || query.inStock
        ? {
            variants: {
              some: {
                isActive: true,
                ...(query.color
                  ? { color: { equals: query.color, mode: 'insensitive' } }
                  : {}),
                ...(query.size
                  ? { size: { equals: query.size, mode: 'insensitive' } }
                  : {}),
                ...(query.inStock ? { stock: { gt: 0 } } : {}),
              },
            },
          }
        : {}),
    };

    return this.prisma.product.findMany({
      where,
      select: searchListSelect,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  private matchesFilters(
    product: SearchProductRecord,
    query: SearchProductsDto,
    tokens: string[],
  ) {
    if (!this.matchesText(product, tokens)) {
      return false;
    }

    if (query.inStock) {
      const hasStock = product.variants.some((variant) => variant.stock > 0);
      if (!hasStock) {
        return false;
      }
    }

    return true;
  }

  private matchesText(product: SearchProductRecord, tokens: string[]) {
    if (tokens.length === 0) {
      return true;
    }

    const skuList = product.variants.map((variant) => variant.sku).join(' ');
    const colors = product.variants.map((variant) => variant.color).join(' ');
    const sizes = product.variants.map((variant) => variant.size).join(' ');

    return matchesSearchTokens(
      [
        product.name,
        product.shortDescription,
        product.description,
        product.category.name,
        product.collection?.name,
        skuList,
        colors,
        sizes,
      ],
      tokens,
    );
  }

  private sortProducts(
    products: SearchProductRecord[],
    sort: ProductSearchSort,
    tokens: string[],
  ) {
    const items = [...products];

    switch (sort) {
      case ProductSearchSort.PRICE_ASC:
        return items.sort(
          (a, b) => Number(a.basePrice) - Number(b.basePrice),
        );
      case ProductSearchSort.PRICE_DESC:
        return items.sort(
          (a, b) => Number(b.basePrice) - Number(a.basePrice),
        );
      case ProductSearchSort.NAME_ASC:
        return items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      case ProductSearchSort.NAME_DESC:
        return items.sort((a, b) => b.name.localeCompare(a.name, 'pt-BR'));
      case ProductSearchSort.NEWEST:
        return items.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        );
      case ProductSearchSort.BEST_SELLERS:
        return items.sort((a, b) => {
          if (a.isFeatured !== b.isFeatured) {
            return Number(b.isFeatured) - Number(a.isFeatured);
          }
          return b.createdAt.getTime() - a.createdAt.getTime();
        });
      case ProductSearchSort.RELEVANCE:
      default:
        return items.sort((a, b) => {
          const scoreA = this.relevanceScore(a, tokens);
          const scoreB = this.relevanceScore(b, tokens);
          if (scoreA !== scoreB) {
            return scoreB - scoreA;
          }
          return b.createdAt.getTime() - a.createdAt.getTime();
        });
    }
  }

  private relevanceScore(product: SearchProductRecord, tokens: string[]) {
    if (tokens.length === 0) {
      return 0;
    }

    const name = normalizeSearchText(product.name);
    const category = normalizeSearchText(product.category.name);
    let score = 0;

    for (const token of tokens) {
      if (name === token) score += 100;
      else if (name.startsWith(token)) score += 60;
      else if (name.includes(token)) score += 40;
      if (category.includes(token)) score += 15;
      if (normalizeSearchText(product.shortDescription).includes(token)) {
        score += 10;
      }
    }

    if (product.isFeatured) score += 5;
    if (product.isNew) score += 3;

    return score;
  }

  private buildAvailableFilters(products: SearchProductRecord[]) {
    const categories = new Map<string, { slug: string; name: string; count: number }>();
    const collections = new Map<string, { slug: string; name: string; count: number }>();
    const colors = new Map<string, number>();
    const sizes = new Map<string, number>();
    let minPrice = Number.POSITIVE_INFINITY;
    let maxPrice = 0;

    for (const product of products) {
      const price = Number(product.basePrice);
      minPrice = Math.min(minPrice, price);
      maxPrice = Math.max(maxPrice, price);

      const categoryEntry = categories.get(product.category.slug) ?? {
        slug: product.category.slug,
        name: product.category.name,
        count: 0,
      };
      categoryEntry.count += 1;
      categories.set(product.category.slug, categoryEntry);

      if (product.collection) {
        const collectionEntry = collections.get(product.collection.slug) ?? {
          slug: product.collection.slug,
          name: product.collection.name,
          count: 0,
        };
        collectionEntry.count += 1;
        collections.set(product.collection.slug, collectionEntry);
      }

      for (const variant of product.variants) {
        colors.set(variant.color, (colors.get(variant.color) ?? 0) + 1);
        sizes.set(variant.size, (sizes.get(variant.size) ?? 0) + 1);
      }
    }

    return {
      categories: [...categories.values()].sort((a, b) =>
        a.name.localeCompare(b.name, 'pt-BR'),
      ),
      collections: [...collections.values()].sort((a, b) =>
        a.name.localeCompare(b.name, 'pt-BR'),
      ),
      colors: [...colors.entries()]
        .map(([color, count]) => ({ color, count }))
        .sort((a, b) => a.color.localeCompare(b.color, 'pt-BR')),
      sizes: [...sizes.entries()]
        .map(([size, count]) => ({ size, count }))
        .sort((a, b) => a.size.localeCompare(b.size, 'pt-BR')),
      priceRange: {
        min: Number.isFinite(minPrice) ? minPrice : 0,
        max: maxPrice,
      },
    };
  }

  private serializeProduct(product: SearchProductRecord) {
    const colors = [
      ...new Set(product.variants.map((variant) => variant.color).filter(Boolean)),
    ];

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      shortDescription: product.shortDescription,
      basePrice: Number(product.basePrice),
      coverImage: product.coverImage,
      isFeatured: product.isFeatured,
      isNew: product.isNew,
      isOnSale: product.isOnSale,
      compareAtPrice:
        product.compareAtPrice !== null && product.compareAtPrice !== undefined
          ? Number(product.compareAtPrice)
          : null,
      category: product.category,
      collection: product.collection,
      images: product.images,
      ...(colors.length ? { colors } : {}),
    };
  }

  private async logSearch(term: string, resultsCount: number) {
    try {
      await this.prisma.searchQueryLog.create({
        data: {
          term,
          termNormalized: normalizeSearchText(term),
          resultsCount,
        },
      });
    } catch {
      // analytics must not break search
    }
  }
}
