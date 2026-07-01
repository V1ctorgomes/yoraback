import {
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { REVENUE_ORDER_STATUSES } from '../analytics/analytics.constants';
import { AuthAdmin } from '../auth/decorators/current-admin.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  calculateStoreRevenue,
  CrmSettings,
  CustomerOrderMetrics,
  resolveCustomerSegment,
  resolveCustomerStatus,
} from './crm-segment.util';
import {
  buildCrmPdfBuffer,
  CrmPdfCustomerRow,
} from './crm-pdf-export.util';
import {
  CrmCustomerSort,
  CustomerSegment,
  ExportAdminCrmCustomersDto,
  QueryAdminCrmCustomersDto,
} from './dto/query-admin-crm-customers.dto';

type CustomerRecord = Prisma.CustomerGetPayload<{
  include: {
    addresses: true;
    user: { select: { lastLogin: true; createdAt: true } };
  };
}>;

@Injectable()
export class AdminCrmService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryAdminCrmCustomersDto, admin: AuthAdmin) {
    await this.logAccess(admin.email, 'list');

    const settings = await this.getSettings();
    const customers = await this.loadCustomersForQuery(query);
    const metricsMap = await this.buildMetricsMap(customers.map((c) => c.id));

    const filtered = customers
      .map((customer) => ({
        customer,
        metrics: metricsMap.get(customer.id) ?? this.emptyMetrics(),
      }))
      .filter(({ customer, metrics }) =>
        this.matchesAdvancedFilters(customer, metrics, query, settings),
      );

    const sorted = this.sortCustomers(filtered, query.sort ?? CrmCustomerSort.NEWEST);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const total = sorted.length;
    const slice = sorted.slice((page - 1) * limit, page * limit);

    return {
      settings,
      data: slice.map(({ customer, metrics }) =>
        this.mapListItem(customer, metrics, settings),
      ),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string, admin: AuthAdmin) {
    await this.logAccess(admin.email, 'detail', id);

    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        addresses: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }] },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            lastLogin: true,
            createdAt: true,
          },
        },
        orders: {
          include: {
            address: true,
            payments: { orderBy: { createdAt: 'desc' } },
            statusHistory: { orderBy: { createdAt: 'desc' } },
            shippingEvents: { orderBy: { eventDate: 'desc' } },
            items: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Cliente não encontrado');
    }

    const settings = await this.getSettings();
    const metrics = await this.buildMetricsForCustomer(customer.id);
    const segment = resolveCustomerSegment(metrics, settings);

    const productIds = [
      ...new Set(
        customer.orders
          .filter((order) => REVENUE_ORDER_STATUSES.includes(order.status))
          .flatMap((order) => order.items.map((item) => item.productId)),
      ),
    ];
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: {
            id: true,
            name: true,
            category: { select: { id: true, name: true } },
            collection: { select: { id: true, name: true } },
          },
        })
      : [];
    const productCatalog = new Map(products.map((product) => [product.id, product]));

    const productStats = this.buildProductStats(customer.orders, productCatalog);
    const timeline = this.buildTimeline(customer);

    const lastShippedOrder = customer.orders.find(
      (order) =>
        order.status === OrderStatus.SHIPPED ||
        order.status === OrderStatus.DELIVERED ||
        order.logisticStatus === 'IN_TRANSIT' ||
        order.logisticStatus === 'DELIVERED' ||
        order.logisticStatus === 'POSTED',
    );

    return {
      profile: {
        id: customer.id,
        name: customer.name,
        cpf: customer.cpf,
        cpfPending: customer.cpfPending,
        email: customer.email,
        phone: customer.phone,
        birthDate: customer.birthDate?.toISOString().slice(0, 10) ?? null,
        isGuest: customer.isGuest,
        createdAt: customer.createdAt.toISOString(),
        updatedAt: customer.updatedAt.toISOString(),
        lastLogin: customer.user?.lastLogin?.toISOString() ?? null,
      },
      addresses: customer.addresses.map((address) => ({
        id: address.id,
        recipient: address.recipient,
        zipCode: address.zipCode,
        street: address.street,
        number: address.number,
        complement: address.complement,
        district: address.district,
        city: address.city,
        state: address.state,
        country: address.country,
        reference: address.reference,
        isPrimary: address.isPrimary,
        createdAt: address.createdAt.toISOString(),
        updatedAt: address.updatedAt.toISOString(),
      })),
      stats: {
        totalSpent: metrics.totalSpent,
        averageTicket: metrics.averageTicket,
        totalOrders: metrics.paidOrderCount,
        totalOrderCount: metrics.totalOrderCount,
        firstPurchaseAt: metrics.firstPurchaseAt,
        lastPurchaseAt: metrics.lastPurchaseAt,
        productsPurchased: productStats.productsPurchased,
        topCategories: productStats.topCategories,
        topCollections: productStats.topCollections,
        favoriteProduct: productStats.favoriteProduct,
        favoriteCategory: productStats.favoriteCategory,
        lastShipmentAt: lastShippedOrder?.updatedAt.toISOString() ?? null,
      },
      segment,
      status: resolveCustomerStatus({ isGuest: customer.isGuest, segment }),
      orders: customer.orders.map((order) => this.mapOrderRow(order)),
      timeline,
      settings,
    };
  }

  async exportCustomers(query: ExportAdminCrmCustomersDto, admin: AuthAdmin) {
    await this.logAccess(admin.email, 'export');

    const settings = await this.getSettings();
    const customers = await this.loadCustomersForQuery(query);
    const metricsMap = await this.buildMetricsMap(customers.map((c) => c.id));

    const rows = customers
      .map((customer) => ({
        customer,
        metrics: metricsMap.get(customer.id) ?? this.emptyMetrics(),
      }))
      .filter(({ customer, metrics }) =>
        this.matchesAdvancedFilters(customer, metrics, query, settings),
      )
      .map(({ customer, metrics }) =>
        this.mapListItem(customer, metrics, settings),
      );

    const format = query.format ?? 'csv';

    if (format === 'pdf') {
      return this.buildPdfExport(rows, query, admin.email);
    }

    if (format === 'xlsx') {
      return this.buildXlsxExport(rows);
    }

    return this.buildCsvExport(rows);
  }

  private async loadCustomersForQuery(query: QueryAdminCrmCustomersDto) {
    const where = await this.buildCustomerWhere(query);

    return this.prisma.customer.findMany({
      where,
      include: {
        addresses: true,
        user: { select: { lastLogin: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async buildCustomerWhere(
    query: QueryAdminCrmCustomersDto,
  ): Promise<Prisma.CustomerWhereInput> {
    const where: Prisma.CustomerWhereInput = {};

    if (query.registeredFrom || query.registeredTo) {
      where.createdAt = {
        ...(query.registeredFrom ? { gte: new Date(query.registeredFrom) } : {}),
        ...(query.registeredTo ? { lte: new Date(query.registeredTo) } : {}),
      };
    }

    if (query.state || query.city) {
      where.addresses = {
        some: {
          ...(query.state
            ? { state: { equals: query.state, mode: 'insensitive' } }
            : {}),
          ...(query.city
            ? { city: { contains: query.city, mode: 'insensitive' } }
            : {}),
        },
      };
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      const digits = search.replace(/\D/g, '');
      const orderMatch = await this.prisma.order.findFirst({
        where: { orderNumber: { contains: search, mode: 'insensitive' } },
        select: { customerId: true },
      });

      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        ...(digits.length >= 3
          ? [{ cpfNormalized: { contains: digits } }]
          : []),
        ...(orderMatch ? [{ id: orderMatch.customerId }] : []),
      ];
    }

    return where;
  }

  private async buildMetricsMap(customerIds: string[]) {
    const map = new Map<string, CustomerOrderMetrics>();
    if (customerIds.length === 0) {
      return map;
    }

    const [paidGroups, totalGroups] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['customerId'],
        where: {
          customerId: { in: customerIds },
          status: { in: REVENUE_ORDER_STATUSES },
        },
        _count: { _all: true },
        _sum: { subtotal: true, discount: true },
        _min: { createdAt: true },
        _max: { createdAt: true },
      }),
      this.prisma.order.groupBy({
        by: ['customerId'],
        where: { customerId: { in: customerIds } },
        _count: { _all: true },
      }),
    ]);

    const totalCountMap = new Map(
      totalGroups.map((group) => [group.customerId, group._count._all]),
    );

    for (const group of paidGroups) {
      const totalSpent = calculateStoreRevenue(
        Number(group._sum.subtotal ?? 0),
        Number(group._sum.discount ?? 0),
      );
      const paidOrderCount = group._count._all;

      map.set(group.customerId, {
        paidOrderCount,
        totalSpent,
        averageTicket: paidOrderCount > 0 ? totalSpent / paidOrderCount : 0,
        firstPurchaseAt: group._min.createdAt?.toISOString() ?? null,
        lastPurchaseAt: group._max.createdAt?.toISOString() ?? null,
        totalOrderCount: totalCountMap.get(group.customerId) ?? 0,
      });
    }

    for (const customerId of customerIds) {
      if (!map.has(customerId)) {
        map.set(customerId, {
          ...this.emptyMetrics(),
          totalOrderCount: totalCountMap.get(customerId) ?? 0,
        });
      }
    }

    return map;
  }

  private async buildMetricsForCustomer(customerId: string) {
    const map = await this.buildMetricsMap([customerId]);
    return map.get(customerId) ?? this.emptyMetrics();
  }

  private emptyMetrics(): CustomerOrderMetrics {
    return {
      paidOrderCount: 0,
      totalSpent: 0,
      averageTicket: 0,
      firstPurchaseAt: null,
      lastPurchaseAt: null,
      totalOrderCount: 0,
    };
  }

  private matchesAdvancedFilters(
    customer: CustomerRecord,
    metrics: CustomerOrderMetrics,
    query: QueryAdminCrmCustomersDto,
    settings: CrmSettings,
  ) {
    const segment = resolveCustomerSegment(metrics, settings);

    if (query.segment && segment !== query.segment) {
      return false;
    }

    if (query.hasOrders === true && metrics.paidOrderCount === 0) {
      return false;
    }

    if (query.hasOrders === false && metrics.totalOrderCount > 0) {
      return false;
    }

    if (query.hasAbandonedCart) {
      return false;
    }

    if (query.lastPurchaseFrom && metrics.lastPurchaseAt) {
      if (new Date(metrics.lastPurchaseAt) < new Date(query.lastPurchaseFrom)) {
        return false;
      }
    }

    if (query.lastPurchaseTo && metrics.lastPurchaseAt) {
      if (new Date(metrics.lastPurchaseAt) > new Date(query.lastPurchaseTo)) {
        return false;
      }
    }

    if (query.lastPurchaseFrom && !metrics.lastPurchaseAt) {
      return false;
    }

    return true;
  }

  private sortCustomers(
    items: Array<{ customer: CustomerRecord; metrics: CustomerOrderMetrics }>,
    sort: CrmCustomerSort,
  ) {
    return [...items].sort((a, b) => {
      switch (sort) {
        case CrmCustomerSort.OLDEST:
          return a.customer.createdAt.getTime() - b.customer.createdAt.getTime();
        case CrmCustomerSort.HIGHEST_SPENT:
          return b.metrics.totalSpent - a.metrics.totalSpent;
        case CrmCustomerSort.LOWEST_SPENT:
          return a.metrics.totalSpent - b.metrics.totalSpent;
        case CrmCustomerSort.MOST_ORDERS:
          return b.metrics.paidOrderCount - a.metrics.paidOrderCount;
        case CrmCustomerSort.NEWEST:
        default:
          return b.customer.createdAt.getTime() - a.customer.createdAt.getTime();
      }
    });
  }

  private mapListItem(
    customer: CustomerRecord,
    metrics: CustomerOrderMetrics,
    settings: CrmSettings,
  ) {
    const primaryAddress =
      customer.addresses.find((address) => address.isPrimary) ??
      customer.addresses[0];

    const segment = resolveCustomerSegment(metrics, settings);

    return {
      id: customer.id,
      name: customer.name,
      cpf: customer.cpf,
      email: customer.email,
      phone: customer.phone,
      city: primaryAddress?.city ?? null,
      state: primaryAddress?.state ?? null,
      totalSpent: metrics.totalSpent,
      orderCount: metrics.paidOrderCount,
      lastPurchaseAt: metrics.lastPurchaseAt,
      segment,
      status: resolveCustomerStatus({
        isGuest: customer.isGuest,
        segment,
      }),
      isGuest: customer.isGuest,
      createdAt: customer.createdAt.toISOString(),
    };
  }

  private mapOrderRow(
    order: Prisma.OrderGetPayload<{
      include: { payments: true; address: true };
    }>,
  ) {
    const latestPayment = order.payments[0];

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt.toISOString(),
      total: Number(order.total),
      storeRevenue: calculateStoreRevenue(
        Number(order.subtotal),
        Number(order.discount),
      ),
      status: order.status,
      paymentStatus: latestPayment?.status ?? null,
      paymentMethod: latestPayment?.paymentMethod ?? null,
      shippingProvider: order.shippingProvider,
      shippingService: order.shippingService,
      trackingCode: order.trackingCode,
      logisticStatus: order.logisticStatus,
    };
  }

  private buildProductStats(
    orders: Prisma.OrderGetPayload<{ include: { items: true } }>[],
    productCatalog: Map<
      string,
      {
        id: string;
        name: string;
        category: { id: string; name: string };
        collection: { id: string; name: string } | null;
      }
    >,
  ) {
    const productMap = new Map<string, { name: string; quantity: number }>();
    const categoryMap = new Map<string, { name: string; quantity: number }>();
    const collectionMap = new Map<string, { name: string; quantity: number }>();

    for (const order of orders) {
      if (!REVENUE_ORDER_STATUSES.includes(order.status)) {
        continue;
      }

      for (const item of order.items) {
        const productEntry = productMap.get(item.productId) ?? {
          name: item.productName,
          quantity: 0,
        };
        productEntry.quantity += item.quantity;
        productMap.set(item.productId, productEntry);

        const product = productCatalog.get(item.productId);
        const category = product?.category;
        if (category) {
          const categoryEntry = categoryMap.get(category.id) ?? {
            name: category.name,
            quantity: 0,
          };
          categoryEntry.quantity += item.quantity;
          categoryMap.set(category.id, categoryEntry);
        }

        const collection = product?.collection;
        if (collection) {
          const collectionEntry = collectionMap.get(collection.id) ?? {
            name: collection.name,
            quantity: 0,
          };
          collectionEntry.quantity += item.quantity;
          collectionMap.set(collection.id, collectionEntry);
        }
      }
    }

    const productsPurchased = [...productMap.values()].reduce(
      (total, entry) => total + entry.quantity,
      0,
    );

    const topProducts = [...productMap.entries()]
      .map(([productId, entry]) => ({
        productId,
        name: entry.name,
        quantity: entry.quantity,
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const topCategories = [...categoryMap.entries()]
      .map(([categoryId, entry]) => ({
        categoryId,
        name: entry.name,
        quantity: entry.quantity,
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const topCollections = [...collectionMap.entries()]
      .map(([collectionId, entry]) => ({
        collectionId,
        name: entry.name,
        quantity: entry.quantity,
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    return {
      productsPurchased,
      topCategories,
      topCollections,
      favoriteProduct: topProducts[0] ?? null,
      favoriteCategory: topCategories[0] ?? null,
    };
  }

  private buildTimeline(customer: Prisma.CustomerGetPayload<{
    include: {
      user: { select: { lastLogin: true } };
      orders: {
        include: {
          payments: true;
          statusHistory: true;
          shippingEvents: true;
        };
      };
    };
  }>) {
    const events: Array<{
      type: string;
      title: string;
      description: string;
      date: string;
    }> = [];

    events.push({
      type: 'registration',
      title: 'Cadastro',
      description: customer.isGuest
        ? 'Cliente convidado criado no checkout'
        : 'Conta de cliente criada',
      date: customer.createdAt.toISOString(),
    });

    if (customer.user?.lastLogin) {
      events.push({
        type: 'login',
        title: 'Login',
        description: 'Último acesso à conta',
        date: customer.user.lastLogin.toISOString(),
      });
    }

    if (customer.updatedAt.getTime() - customer.createdAt.getTime() > 60_000) {
      events.push({
        type: 'profile_update',
        title: 'Alteração cadastral',
        description: 'Dados do cliente atualizados',
        date: customer.updatedAt.toISOString(),
      });
    }

    for (const order of customer.orders) {
      events.push({
        type: 'order_created',
        title: 'Pedido criado',
        description: `Pedido ${order.orderNumber}`,
        date: order.createdAt.toISOString(),
      });

      const approvedPayment = order.payments.find(
        (payment) => payment.status === PaymentStatus.APPROVED,
      );
      if (approvedPayment) {
        events.push({
          type: 'payment_approved',
          title: 'Pagamento aprovado',
          description: `Pedido ${order.orderNumber}`,
          date: approvedPayment.createdAt.toISOString(),
        });
      }

      if (
        order.status === OrderStatus.SHIPPED ||
        order.status === OrderStatus.DELIVERED
      ) {
        events.push({
          type: 'order_shipped',
          title: 'Pedido enviado',
          description: `Pedido ${order.orderNumber}`,
          date: order.updatedAt.toISOString(),
        });
      }

      if (order.status === OrderStatus.DELIVERED) {
        events.push({
          type: 'order_delivered',
          title: 'Pedido entregue',
          description: `Pedido ${order.orderNumber}`,
          date: order.updatedAt.toISOString(),
        });
      }

      if (
        order.status === OrderStatus.CANCELLED ||
        order.status === OrderStatus.REFUNDED
      ) {
        events.push({
          type: 'order_cancelled',
          title: 'Cancelamento',
          description: `Pedido ${order.orderNumber}`,
          date: order.updatedAt.toISOString(),
        });
      }

      for (const history of order.statusHistory) {
        if (history.newStatus === OrderStatus.PAID) {
          events.push({
            type: 'payment_approved',
            title: 'Pagamento aprovado',
            description: `Pedido ${order.orderNumber}`,
            date: history.createdAt.toISOString(),
          });
        }
      }

      for (const shippingEvent of order.shippingEvents) {
        events.push({
          type: 'shipping_event',
          title: 'Atualização logística',
          description: shippingEvent.description,
          date: shippingEvent.eventDate.toISOString(),
        });
      }
    }

    return events.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }

  private async getSettings(): Promise<CrmSettings> {
    const settings = await this.prisma.storeSetting.upsert({
      where: { id: 'default' },
      update: {},
      create: {},
    });

    return {
      vipThreshold: Number(settings.crmVipThreshold),
      inactiveDays: settings.crmInactiveDays,
    };
  }

  private async logAccess(
    adminEmail: string,
    action: string,
    customerId?: string,
  ) {
    await this.prisma.crmAccessLog.create({
      data: { adminEmail, action, customerId: customerId ?? null },
    });
  }

  private async buildPdfExport(
    rows: CrmPdfCustomerRow[],
    filters: ExportAdminCrmCustomersDto,
    adminEmail: string,
  ) {
    const buffer = await buildCrmPdfBuffer(rows, {
      adminEmail,
      filters,
    });

    const dateStamp = new Date().toISOString().slice(0, 10);

    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="yora-clientes-crm-${dateStamp}.pdf"`,
    });
  }

  private buildCsvExport(
    rows: ReturnType<AdminCrmService['mapListItem']>[],
  ) {
    const header = [
      'Nome',
      'CPF',
      'Email',
      'Telefone',
      'Cidade',
      'Estado',
      'Total gasto',
      'Pedidos',
      'Última compra',
      'Segmento',
      'Status',
      'Cadastro',
    ];

    const lines = rows.map((row) =>
      [
        row.name,
        row.cpf ?? '',
        row.email,
        row.phone,
        row.city ?? '',
        row.state ?? '',
        row.totalSpent.toFixed(2),
        row.orderCount,
        row.lastPurchaseAt ?? '',
        row.segment,
        row.status,
        row.createdAt,
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(','),
    );

    const content = [header.join(','), ...lines].join('\n');
    const buffer = Buffer.from(`\uFEFF${content}`, 'utf8');

    return new StreamableFile(buffer, {
      type: 'text/csv; charset=utf-8',
      disposition: 'attachment; filename="clientes-crm.csv"',
    });
  }

  private async buildXlsxExport(
    rows: ReturnType<AdminCrmService['mapListItem']>[],
  ) {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Clientes');

    sheet.columns = [
      { header: 'Nome', key: 'name', width: 28 },
      { header: 'CPF', key: 'cpf', width: 16 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Telefone', key: 'phone', width: 18 },
      { header: 'Cidade', key: 'city', width: 18 },
      { header: 'Estado', key: 'state', width: 10 },
      { header: 'Total gasto', key: 'totalSpent', width: 14 },
      { header: 'Pedidos', key: 'orderCount', width: 10 },
      { header: 'Última compra', key: 'lastPurchaseAt', width: 22 },
      { header: 'Segmento', key: 'segment', width: 14 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Cadastro', key: 'createdAt', width: 22 },
    ];

    for (const row of rows) {
      sheet.addRow({
        ...row,
        totalSpent: row.totalSpent,
      });
    }

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="clientes-crm.xlsx"',
    });
  }
}
