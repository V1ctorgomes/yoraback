import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

const cartItemInclude = {
  productVariant: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          coverImage: true,
          basePrice: true,
          isActive: true,
        },
      },
    },
  },
} satisfies Prisma.CartItemInclude;

type CartItemWithRelations = Prisma.CartItemGetPayload<{
  include: typeof cartItemInclude;
}>;

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  async getCart(token?: string) {
    if (!token) {
      return this.emptyCart();
    }

    const cart = await this.prisma.cart.findUnique({
      where: { token },
      include: { items: { include: cartItemInclude } },
    });

    if (!cart) {
      return this.emptyCart();
    }

    return this.buildCartResponse(cart.items);
  }

  async addItem(token: string | undefined, dto: AddCartItemDto) {
    const variant = await this.validateVariant(dto.productVariantId);
    const quantity = dto.quantity ?? 1;

    if (quantity > variant.stock) {
      throw new BadRequestException('Quantidade indisponível em estoque');
    }

    const cart = await this.resolveCart(token);

    const existing = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productVariantId: {
          cartId: cart.id,
          productVariantId: variant.id,
        },
      },
    });

    if (existing) {
      const nextQuantity = existing.quantity + quantity;

      if (nextQuantity > variant.stock) {
        throw new BadRequestException('Quantidade indisponível em estoque');
      }

      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: nextQuantity },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productVariantId: variant.id,
          quantity,
        },
      });
    }

    return this.getCartWithToken(cart.token);
  }

  async updateItem(
    token: string | undefined,
    variantId: string,
    dto: UpdateCartItemDto,
  ) {
    const cart = await this.requireCart(token);

    const item = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productVariantId: {
          cartId: cart.id,
          productVariantId: variantId,
        },
      },
      include: cartItemInclude,
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado no carrinho');
    }

    const variant = await this.validateVariant(variantId);

    if (dto.quantity > variant.stock) {
      throw new BadRequestException('Quantidade indisponível em estoque');
    }

    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity: dto.quantity },
    });

    return this.getCartWithToken(cart.token);
  }

  async removeItem(token: string | undefined, variantId: string) {
    const cart = await this.requireCart(token);

    const item = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productVariantId: {
          cartId: cart.id,
          productVariantId: variantId,
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado no carrinho');
    }

    await this.prisma.cartItem.delete({ where: { id: item.id } });

    return this.getCartWithToken(cart.token);
  }

  async clearCart(token: string | undefined) {
    const cart = await this.requireCart(token);

    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

    return this.getCartWithToken(cart.token);
  }

  private async getCartWithToken(token: string) {
    const cart = await this.getCart(token);

    return {
      ...cart,
      token,
    };
  }

  private async resolveCart(token?: string) {
    if (token) {
      const existing = await this.prisma.cart.findUnique({ where: { token } });
      if (existing) {
        return existing;
      }
    }

    return this.prisma.cart.create({
      data: { token: randomUUID() },
    });
  }

  private async requireCart(token?: string) {
    if (!token) {
      throw new NotFoundException('Carrinho não encontrado');
    }

    const cart = await this.prisma.cart.findUnique({ where: { token } });

    if (!cart) {
      throw new NotFoundException('Carrinho não encontrado');
    }

    return cart;
  }

  private async validateVariant(variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        product: {
          select: {
            isActive: true,
          },
        },
      },
    });

    if (!variant || !variant.isActive || !variant.product.isActive) {
      throw new BadRequestException('Variante indisponível');
    }

    if (variant.stock <= 0) {
      throw new BadRequestException('Variante sem estoque');
    }

    return variant;
  }

  private buildCartResponse(items: CartItemWithRelations[]) {
    const mappedItems = items
      .filter(
        (item) =>
          item.productVariant.isActive &&
          item.productVariant.product.isActive &&
          item.productVariant.stock > 0,
      )
      .map((item) => this.mapCartItem(item))
      .filter((item) => item.quantity > 0);

    const itemCount = mappedItems.reduce(
      (total, item) => total + item.quantity,
      0,
    );
    const subtotal = mappedItems.reduce((total, item) => total + item.subtotal, 0);

    return {
      items: mappedItems,
      itemCount,
      subtotal,
      total: subtotal,
    };
  }

  private mapCartItem(item: CartItemWithRelations) {
    const variant = item.productVariant;
    const product = variant.product;
    const unitPrice = Number(variant.priceOverride ?? product.basePrice);
    const maxQuantity = Math.min(item.quantity, variant.stock);

    return {
      productId: product.id,
      productVariantId: variant.id,
      productName: product.name,
      productSlug: product.slug,
      imageUrl: product.coverImage,
      color: variant.color,
      size: variant.size,
      unitPrice,
      quantity: maxQuantity,
      subtotal: unitPrice * maxQuantity,
      maxStock: variant.stock,
    };
  }

  private emptyCart() {
    return {
      items: [],
      itemCount: 0,
      subtotal: 0,
      total: 0,
    };
  }
}
