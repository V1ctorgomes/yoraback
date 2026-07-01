import PDFDocument = require('pdfkit');
import type PDFKit from 'pdfkit';
import {
  CustomerSegment,
  ExportAdminCrmCustomersDto,
} from './dto/query-admin-crm-customers.dto';

export interface CrmPdfCustomerRow {
  name: string;
  cpf: string | null;
  email: string;
  phone: string;
  city: string | null;
  state: string | null;
  totalSpent: number;
  orderCount: number;
  lastPurchaseAt: string | null;
  segment: CustomerSegment;
  status: string;
  createdAt: string;
}

interface CrmPdfExportMeta {
  adminEmail: string;
  filters: ExportAdminCrmCustomersDto;
  generatedAt?: Date;
}

const BRAND = {
  charcoal: '#111111',
  cream: '#FDFBF7',
  sand: '#F2ECE4',
  taupe: '#967C5D',
  rose: '#CFA88A',
  muted: '#736C65',
  white: '#FFFFFF',
};

const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  [CustomerSegment.NEW]: 'Novo',
  [CustomerSegment.RECURRING]: 'Recorrente',
  [CustomerSegment.VIP]: 'VIP',
  [CustomerSegment.INACTIVE]: 'Inativo',
};

const SEGMENT_COLORS: Record<CustomerSegment, { bg: string; text: string }> = {
  [CustomerSegment.VIP]: { bg: BRAND.taupe, text: BRAND.cream },
  [CustomerSegment.NEW]: { bg: BRAND.rose, text: BRAND.charcoal },
  [CustomerSegment.RECURRING]: { bg: BRAND.sand, text: BRAND.charcoal },
  [CustomerSegment.INACTIVE]: { bg: '#E8E4DF', text: BRAND.muted },
};

const PAGE = {
  width: 841.89,
  height: 595.28,
  marginX: 36,
  marginBottom: 44,
  headerHeight: 88,
  footerHeight: 28,
};

const COLUMNS = [
  { key: 'name', label: 'Cliente', width: 130 },
  { key: 'contact', label: 'Contato', width: 148 },
  { key: 'location', label: 'Local', width: 72 },
  { key: 'totalSpent', label: 'Total gasto', width: 72, align: 'right' as const },
  { key: 'orderCount', label: 'Pedidos', width: 44, align: 'center' as const },
  { key: 'lastPurchaseAt', label: 'Última compra', width: 72 },
  { key: 'segment', label: 'Segmento', width: 72, align: 'center' as const },
  { key: 'status', label: 'Status', width: 56, align: 'center' as const },
];

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatDate(value: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return dateFormatter.format(parsed);
}

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function describeFilters(filters: ExportAdminCrmCustomersDto) {
  const parts: string[] = [];

  if (filters.search?.trim()) {
    parts.push(`Busca: "${filters.search.trim()}"`);
  }
  if (filters.segment) {
    parts.push(`Segmento: ${SEGMENT_LABELS[filters.segment]}`);
  }
  if (filters.hasOrders === true) {
    parts.push('Com pedidos pagos');
  }
  if (filters.hasOrders === false) {
    parts.push('Sem pedidos pagos');
  }
  if (filters.state) {
    parts.push(`Estado: ${filters.state}`);
  }
  if (filters.city) {
    parts.push(`Cidade: ${filters.city}`);
  }
  if (filters.registeredFrom || filters.registeredTo) {
    parts.push(
      `Cadastro: ${filters.registeredFrom ? formatDate(filters.registeredFrom) : '...'} — ${filters.registeredTo ? formatDate(filters.registeredTo) : '...'}`,
    );
  }
  if (filters.lastPurchaseFrom || filters.lastPurchaseTo) {
    parts.push(
      `Última compra: ${filters.lastPurchaseFrom ? formatDate(filters.lastPurchaseFrom) : '...'} — ${filters.lastPurchaseTo ? formatDate(filters.lastPurchaseTo) : '...'}`,
    );
  }

  return parts.length > 0 ? parts.join(' · ') : 'Todos os clientes';
}

function summarizeRows(rows: CrmPdfCustomerRow[]) {
  const totalRevenue = rows.reduce((sum, row) => sum + row.totalSpent, 0);
  const vipCount = rows.filter((row) => row.segment === CustomerSegment.VIP).length;

  return {
    totalClients: rows.length,
    totalRevenue,
    vipCount,
  };
}

function truncateText(doc: PDFKit.PDFDocument, text: string, width: number) {
  if (doc.widthOfString(text) <= width) {
    return text;
  }

  let truncated = text;
  while (truncated.length > 1 && doc.widthOfString(`${truncated}…`) > width) {
    truncated = truncated.slice(0, -1);
  }

  return `${truncated}…`;
}

function drawPageFooter(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  pageCount: number,
  generatedAt: Date,
) {
  const footerY = PAGE.height - PAGE.footerHeight;

  doc
    .save()
    .strokeColor(BRAND.rose)
    .lineWidth(0.5)
    .moveTo(PAGE.marginX, footerY)
    .lineTo(PAGE.width - PAGE.marginX, footerY)
    .stroke()
    .restore();

  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(BRAND.muted)
    .text('YORA · Documento confidencial · Uso interno administrativo', PAGE.marginX, footerY + 8, {
      width: PAGE.width - PAGE.marginX * 2,
      align: 'left',
    });

  doc.text(
    `Gerado em ${dateTimeFormatter.format(generatedAt)} · Página ${pageNumber} de ${pageCount}`,
    PAGE.marginX,
    footerY + 8,
    {
      width: PAGE.width - PAGE.marginX * 2,
      align: 'right',
    },
  );
}

function drawBrandHeader(
  doc: PDFKit.PDFDocument,
  meta: CrmPdfExportMeta,
  summary: ReturnType<typeof summarizeRows>,
  isContinuation = false,
) {
  const headerHeight = isContinuation ? 54 : PAGE.headerHeight;

  doc.save();
  doc.rect(0, 0, PAGE.width, headerHeight).fill(BRAND.charcoal);
  doc.restore();

  doc
    .font('Helvetica-Bold')
    .fontSize(isContinuation ? 20 : 28)
    .fillColor(BRAND.cream)
    .text('Y O R A', PAGE.marginX, isContinuation ? 14 : 18, {
      characterSpacing: isContinuation ? 4 : 6,
    });

  if (!isContinuation) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(BRAND.rose)
      .text('Relatório Premium de Clientes · CRM', PAGE.marginX, 52);

    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(BRAND.cream)
      .text(`Exportado por ${meta.adminEmail}`, PAGE.marginX, 68, {
        width: 360,
      });

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#D8D0C8')
      .text(describeFilters(meta.filters), PAGE.marginX, 80, {
        width: PAGE.width - PAGE.marginX * 2 - 220,
      });
  } else {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(BRAND.rose)
      .text('Relatório de Clientes · continuação', PAGE.marginX, 34);
  }

  const statsX = PAGE.width - PAGE.marginX - 210;
  const statsY = isContinuation ? 16 : 20;
  const statWidth = 66;
  const statHeight = isContinuation ? 30 : 42;
  const stats = [
    { label: 'Clientes', value: String(summary.totalClients) },
    { label: 'VIP', value: String(summary.vipCount) },
    { label: 'Receita', value: formatCurrency(summary.totalRevenue) },
  ];

  stats.forEach((stat, index) => {
    const x = statsX + index * (statWidth + 6);
    doc.save();
    doc.roundedRect(x, statsY, statWidth, statHeight, 4).fill(BRAND.taupe);
    doc.restore();

    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(BRAND.cream)
      .text(stat.label.toUpperCase(), x + 8, statsY + (isContinuation ? 7 : 10), {
        width: statWidth - 16,
        characterSpacing: 0.8,
      });

    doc
      .font('Helvetica-Bold')
      .fontSize(isContinuation ? 9 : 11)
      .fillColor(BRAND.cream)
      .text(stat.value, x + 8, statsY + (isContinuation ? 16 : 22), {
        width: statWidth - 16,
      });
  });

  return headerHeight + 14;
}

function drawTableHeader(doc: PDFKit.PDFDocument, y: number) {
  const tableWidth = COLUMNS.reduce((sum, column) => sum + column.width, 0);
  const x = PAGE.marginX;

  doc.save();
  doc.roundedRect(x, y, tableWidth, 24, 4).fill(BRAND.charcoal);
  doc.restore();

  let cursorX = x + 10;
  COLUMNS.forEach((column) => {
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor(BRAND.cream)
      .text(column.label.toUpperCase(), cursorX, y + 8, {
        width: column.width - 8,
        align: column.align ?? 'left',
        characterSpacing: 0.6,
      });
    cursorX += column.width;
  });

  return y + 30;
}

function drawSegmentBadge(
  doc: PDFKit.PDFDocument,
  segment: CustomerSegment,
  x: number,
  y: number,
  width: number,
) {
  const colors = SEGMENT_COLORS[segment];
  const label = SEGMENT_LABELS[segment];
  const badgeWidth = Math.min(width - 4, 62);
  const badgeX = x + (width - badgeWidth) / 2;

  doc.save();
  doc.roundedRect(badgeX, y + 1, badgeWidth, 14, 7).fill(colors.bg);
  doc.restore();

  doc
    .font('Helvetica-Bold')
    .fontSize(7)
    .fillColor(colors.text)
    .text(label, badgeX, y + 5, {
      width: badgeWidth,
      align: 'center',
    });
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  row: CrmPdfCustomerRow,
  y: number,
  index: number,
) {
  const tableWidth = COLUMNS.reduce((sum, column) => sum + column.width, 0);
  const x = PAGE.marginX;
  const rowHeight = 34;
  const fill = index % 2 === 0 ? BRAND.cream : BRAND.sand;

  doc.save();
  doc.rect(x, y, tableWidth, rowHeight).fill(fill);
  doc
    .strokeColor('#E6DDD3')
    .lineWidth(0.5)
    .moveTo(x, y + rowHeight)
    .lineTo(x + tableWidth, y + rowHeight)
    .stroke();
  doc.restore();

  const contact = [row.email, row.phone].filter(Boolean).join('\n');
  const location = [row.city, row.state].filter(Boolean).join(' / ') || '—';

  const values: Record<string, string> = {
    name: row.name,
    contact,
    location,
    totalSpent: formatCurrency(row.totalSpent),
    orderCount: String(row.orderCount),
    lastPurchaseAt: formatDate(row.lastPurchaseAt),
    status: row.status,
  };

  let cursorX = x + 10;
  COLUMNS.forEach((column) => {
    if (column.key === 'segment') {
      drawSegmentBadge(doc, row.segment, cursorX - 4, y + 8, column.width);
    } else {
      const text = truncateText(doc, values[column.key] ?? '—', column.width - 8);
      doc
        .font(column.key === 'name' || column.key === 'totalSpent' ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(column.key === 'contact' ? 7 : 8)
        .fillColor(BRAND.charcoal)
        .text(text, cursorX, y + (column.key === 'contact' ? 9 : 12), {
          width: column.width - 8,
          align: column.align ?? 'left',
          lineGap: 1,
        });
    }

    cursorX += column.width;
  });

  return y + rowHeight;
}

export async function buildCrmPdfBuffer(
  rows: CrmPdfCustomerRow[],
  meta: CrmPdfExportMeta,
): Promise<Buffer> {
  const generatedAt = meta.generatedAt ?? new Date();
  const summary = summarizeRows(rows);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [PAGE.width, PAGE.height],
      margins: { top: 0, bottom: PAGE.marginBottom, left: 0, right: 0 },
      autoFirstPage: false,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let currentPage = 0;
    let y = 0;
    const contentBottom = PAGE.height - PAGE.marginBottom - PAGE.footerHeight;

    const startPage = (isContinuation: boolean) => {
      doc.addPage({
        size: [PAGE.width, PAGE.height],
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      });
      currentPage += 1;
      y = drawBrandHeader(doc, meta, summary, isContinuation);
      y = drawTableHeader(doc, y);
    };

    startPage(false);

    rows.forEach((row, index) => {
      if (y + 34 > contentBottom) {
        startPage(true);
      }

      y = drawTableRow(doc, row, y, index);
    });

    if (rows.length === 0) {
      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor(BRAND.muted)
        .text('Nenhum cliente encontrado para os filtros selecionados.', PAGE.marginX, y + 20, {
          width: PAGE.width - PAGE.marginX * 2,
          align: 'center',
        });
    }

    const pageCount = currentPage;
    const range = doc.bufferedPageRange();

    for (let pageIndex = 0; pageIndex < range.count; pageIndex += 1) {
      doc.switchToPage(range.start + pageIndex);
      drawPageFooter(doc, pageIndex + 1, pageCount, generatedAt);
    }

    doc.end();
  });
}
