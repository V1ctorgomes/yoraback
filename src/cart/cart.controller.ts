import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

const CART_TOKEN_HEADER = 'x-cart-token';

@Controller('cart')
export class CartController {
  constructor(private cartService: CartService) {}

  @Get()
  async getCart(
    @Headers(CART_TOKEN_HEADER) token: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cart = await this.cartService.getCart(token);

    if (token) {
      res.setHeader(CART_TOKEN_HEADER, token);
    }

    return cart;
  }

  @Post('items')
  async addItem(
    @Headers(CART_TOKEN_HEADER) token: string | undefined,
    @Body() dto: AddCartItemDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cart = await this.cartService.addItem(token, dto);
    res.setHeader(CART_TOKEN_HEADER, cart.token);
    return cart;
  }

  @Patch('items/:variantId')
  async updateItem(
    @Headers(CART_TOKEN_HEADER) token: string | undefined,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateCartItemDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cart = await this.cartService.updateItem(token, variantId, dto);
    res.setHeader(CART_TOKEN_HEADER, cart.token);
    return cart;
  }

  @Delete('items/:variantId')
  async removeItem(
    @Headers(CART_TOKEN_HEADER) token: string | undefined,
    @Param('variantId') variantId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cart = await this.cartService.removeItem(token, variantId);
    res.setHeader(CART_TOKEN_HEADER, cart.token);
    return cart;
  }

  @Delete('clear')
  async clearCart(
    @Headers(CART_TOKEN_HEADER) token: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cart = await this.cartService.clearCart(token);
    res.setHeader(CART_TOKEN_HEADER, cart.token);
    return cart;
  }
}
