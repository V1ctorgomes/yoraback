import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_ITEM_WEIGHT_KG = 0.3;
const DEFAULT_LENGTH_CM = 20;
const DEFAULT_WIDTH_CM = 15;
const DEFAULT_HEIGHT_CM = 5;

export interface PackageDimensions {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  totalWeightKg: number;
  packageWeightKg: number;
  packageId: string;
  packageName: string;
}

@Injectable()
export class ShippingPackageSelectorService {
  constructor(private prisma: PrismaService) {}

  async selectForItems(
    items: Array<{
      quantity: number;
      weightKg?: number | null;
      lengthCm?: number | null;
      widthCm?: number | null;
      heightCm?: number | null;
    }>,
  ): Promise<PackageDimensions> {
    const packages = await this.prisma.shippingPackage.findMany({
      where: { isActive: true },
      orderBy: { maxWeightKg: 'asc' },
    });

    const itemsWeight = items.reduce((total, item) => {
      const unitWeight = Number(item.weightKg ?? DEFAULT_ITEM_WEIGHT_KG);
      return total + item.quantity * unitWeight;
    }, 0);

    const maxLength = Math.max(
      ...items.map((item) => Number(item.lengthCm ?? DEFAULT_LENGTH_CM)),
    );
    const maxWidth = Math.max(
      ...items.map((item) => Number(item.widthCm ?? DEFAULT_WIDTH_CM)),
    );
    const maxHeight = items.reduce(
      (total, item) =>
        total + item.quantity * Number(item.heightCm ?? DEFAULT_HEIGHT_CM),
      0,
    );

    const selected =
      packages.find(
        (pkg: {
          maxWeightKg: { toString(): string };
          lengthCm: { toString(): string };
          widthCm: { toString(): string };
          heightCm: { toString(): string };
          id: string;
          name: string;
          packageWeightKg: { toString(): string };
        }) =>
          Number(pkg.maxWeightKg) >= itemsWeight &&
          Number(pkg.lengthCm) >= maxLength &&
          Number(pkg.widthCm) >= maxWidth &&
          Number(pkg.heightCm) >= maxHeight,
      ) ?? packages[packages.length - 1];

    if (!selected) {
      return {
        lengthCm: maxLength,
        widthCm: maxWidth,
        heightCm: maxHeight,
        totalWeightKg: itemsWeight + 0.2,
        packageWeightKg: 0.2,
        packageId: 'virtual',
        packageName: 'Embalagem calculada',
      };
    }

    return {
      lengthCm: Number(selected.lengthCm),
      widthCm: Number(selected.widthCm),
      heightCm: Number(selected.heightCm),
      totalWeightKg: itemsWeight + Number(selected.packageWeightKg),
      packageWeightKg: Number(selected.packageWeightKg),
      packageId: selected.id,
      packageName: selected.name,
    };
  }
}
