import { BUSINESS_UNITS, FUNNEL_STAGES } from "../constants";
import type { BusinessUnit, Currency, Opportunity } from "../types";
import { calculateMetrics, calculateMonthlyMetrics, daysBetween, sumFees } from "./metrics";
import { CURRENCIES, opportunityCurrency, opportunityFee } from "./money";

interface WorkbookExportOptions {
  opportunities: Opportunity[];
  businessUnit: BusinessUnit;
  selectedMonth: string;
  generatedBy: string;
  currency?: Currency;
}

interface WorkbookCell {
  value: string | number | null;
  style?: number;
}

interface WorksheetDefinition {
  name: string;
  rows: WorkbookCell[][];
  widths: number[];
  freezeRows?: number;
  freezeColumns?: number;
  autoFilter?: string;
  merges?: string[];
}

const STYLE = {
  normal: 0,
  header: 1,
  currency: 2,
  percent: 3,
  date: 4,
  integer: 5,
  title: 6,
  subtitle: 7,
  label: 8,
  kpiCurrency: 9,
  kpiPercent: 10,
  kpiInteger: 11,
  green: 12,
  red: 13,
  amber: 14,
  section: 15,
  dateTime: 16,
  wrapped: 17,
  totalInteger: 18,
  totalCurrency: 19,
} as const;

export async function exportOpportunitiesWorkbook(options: WorkbookExportOptions) {
  const { businessUnit } = options;
  const bytes = await buildOpportunitiesWorkbook(options);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `crm-relatorio-${businessUnit}-${localDateIso()}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function buildOpportunitiesWorkbook({ opportunities, businessUnit, selectedMonth, generatedBy, currency: selectedCurrency }: WorkbookExportOptions) {
  const currencies = CURRENCIES.map((item) => item.code).filter((currency) =>
    opportunities.some((opportunity) => opportunityCurrency(opportunity) === currency),
  );
  if (!currencies.length) currencies.push(selectedCurrency ?? "BRL");
  const currency = currencies[0];
  const mixedCurrencies = currencies.length > 1;
  const { strToU8, zipSync } = await import("fflate");
  const sheets: WorksheetDefinition[] = mixedCurrencies ? [
    createOpportunitiesSheet(opportunities),
    ...currencies.flatMap((currency) => {
      const group = opportunities.filter((opportunity) => opportunityCurrency(opportunity) === currency);
      return [
        { ...createSummarySheet(group, businessUnit, selectedMonth, generatedBy, currency), name: `Resumo ${currency}` },
        { ...createSellersSheet(group), name: `Vendedores ${currency}` },
      ];
    }),
  ] : [
    createSummarySheet(opportunities, businessUnit, selectedMonth, generatedBy, currency),
    createOpportunitiesSheet(opportunities),
    createSellersSheet(opportunities),
  ];
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypesXml(sheets.length)),
    "_rels/.rels": strToU8(rootRelationshipsXml()),
    "docProps/app.xml": strToU8(appPropertiesXml(sheets)),
    "docProps/core.xml": strToU8(corePropertiesXml()),
    "xl/workbook.xml": strToU8(workbookXml(sheets)),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelationshipsXml(sheets.length)),
    "xl/styles.xml": strToU8(stylesXml(mixedCurrencies ? null : currency)),
  };

  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(worksheetXml(sheet));
  });

  return zipSync(files, { level: 6 });
}

function createSummarySheet(
  opportunities: Opportunity[],
  businessUnit: BusinessUnit,
  selectedMonth: string,
  generatedBy: string,
  currency: Currency,
): WorksheetDefinition {
  const metrics = calculateMetrics(opportunities, currency);
  const monthly = calculateMonthlyMetrics(opportunities, selectedMonth, currency);
  const businessUnitName = BUSINESS_UNITS.find((unit) => unit.id === businessUnit)?.label ?? businessUnit;
  const rows: WorkbookCell[][] = [
    [cell("Relatório comercial detalhado", STYLE.title)],
    [cell(businessUnitName, STYLE.subtitle)],
    [cell("Período selecionado", STYLE.label), cell(monthLabel(selectedMonth)), empty(), cell("Gerado por", STYLE.label), cell(generatedBy)],
    [cell("Gerado em", STYLE.label), cell(excelDateTimeSerial(new Date()), STYLE.dateTime), empty(), cell("Oportunidades", STYLE.label), cell(opportunities.length, STYLE.integer)],
    [cell(`Moeda: ${currency}. Receita Atlantic = fee. Valores sem conversão cambial.`, STYLE.subtitle)],
    [
      cell("Fee em aberto", STYLE.label), cell(metrics.openRevenue, STYLE.kpiCurrency),
      cell("Forecast do fee", STYLE.label), cell(metrics.weightedForecast, STYLE.kpiCurrency),
      cell("Fee ganho no mês", STYLE.label), cell(monthly.wonRevenue, STYLE.kpiCurrency),
    ],
    [
      cell("Win rate no mês", STYLE.label), cell(monthly.winRate, STYLE.kpiPercent),
      cell("Oportunidades sem ação", STYLE.label), cell(metrics.withoutNextAction, STYLE.kpiInteger),
      cell("Paradas há mais de 7 dias", STYLE.label), cell(metrics.stalledOverSeven, STYLE.kpiInteger),
    ],
    [cell(metrics.missingFeeCount ? `Receita parcial: ${metrics.missingFeeCount} oportunidades sem fee informado.` : "Todos os fees informados. Totais referentes aos dados exportados.", STYLE.subtitle)],
    [cell("Funil por etapa", STYLE.section)],
    [cell("Etapa", STYLE.header), cell("Quantidade", STYLE.header), cell("Bruto das cotações", STYLE.header), cell("Fee Atlantic", STYLE.header), cell("Forecast do fee", STYLE.header)],
  ];

  for (const stage of FUNNEL_STAGES) {
    const stageOpportunities = opportunities.filter((opportunity) => opportunity.stage === stage);
    rows.push([
      cell(stage),
      cell(stageOpportunities.length, STYLE.integer),
      cell(sum(stageOpportunities, (opportunity) => opportunity.value), STYLE.currency),
      cell(sumFees(stageOpportunities), STYLE.currency),
      cell(sum(stageOpportunities.filter((opportunity) => !opportunity.stage.startsWith("Fechado")), (opportunity) => (opportunityFee(opportunity) ?? 0) * (opportunity.probability / 100)), STYLE.currency),
    ]);
  }
  rows.push([
    cell("Total", STYLE.header),
    cell(opportunities.length, STYLE.totalInteger),
    cell(sum(opportunities, (opportunity) => opportunity.value), STYLE.totalCurrency),
    cell(sumFees(opportunities), STYLE.totalCurrency),
    cell(metrics.weightedForecast, STYLE.totalCurrency),
  ]);

  return { name: "Resumo", rows, widths: [32, 20, 24, 24, 28, 24], merges: ["A1:F1", "A2:F2", "A5:F5", "A8:F8", "A9:F9"] };
}

function createOpportunitiesSheet(opportunities: Opportunity[]): WorksheetDefinition {
  const headers = [
    "Base operacional", "Cliente", "Oportunidade", "Segmento", "Serviço", "Vendedor", "Bruto da cotação", "Forecast do fee aberto",
    "Entrada no funil", "Última interação", "Próximo passo", "Data da próxima ação", "Dias sem interação", "Status da ação",
    "Probabilidade", "Origem", "Tipo de lead", "Etapa", "Prioridade", "Temperatura", "Motivo da perda", "Data de fechamento", "Moeda", "Fee Atlantic", "Fee informado",
  ];
  const rows: WorkbookCell[][] = [headers.map((header) => cell(header, STYLE.header))];

  opportunities.forEach((opportunity) => {
    const actionStatus = nextActionStatus(opportunity);
    rows.push([
      cell(businessUnitLabel(opportunity.businessUnit)), cell(opportunity.clientName), cell(opportunity.opportunityName),
      cell(opportunity.segment), cell(opportunity.service), cell(opportunity.seller), cell(opportunity.value, STYLE.currency),
      cell(opportunityFee(opportunity) === null ? null : opportunity.stage.startsWith("Fechado") ? 0 : opportunityFee(opportunity)! * (opportunity.probability / 100), STYLE.currency), cell(excelDateSerial(opportunity.enteredAt), STYLE.date),
      cell(excelDateSerial(opportunity.lastInteractionAt), STYLE.date), cell(opportunity.nextStep, STYLE.wrapped),
      cell(excelDateSerial(opportunity.nextActionDate), STYLE.date), cell(daysBetween(opportunity.lastInteractionAt), STYLE.integer),
      cell(actionStatus, statusStyle(actionStatus)), cell(opportunity.probability / 100, STYLE.percent), cell(opportunity.source),
      cell(opportunity.leadType), cell(opportunity.stage, stageStyle(opportunity.stage)), cell(opportunity.priority),
      cell(opportunity.temperature), cell(opportunity.lossReason ?? ""), cell(excelDateSerial(opportunity.closedAt), STYLE.date),
      cell(opportunityCurrency(opportunity)), cell(opportunityFee(opportunity), STYLE.currency), cell(opportunityFee(opportunity) === null ? "Não" : "Sim"),
    ]);
  });

  return {
    name: "Oportunidades",
    rows,
    widths: [28, 28, 32, 24, 28, 24, 20, 24, 17, 17, 42, 20, 20, 18, 16, 16, 16, 28, 14, 14, 20, 20, 12, 20, 18],
    freezeRows: 1,
    freezeColumns: 2,
    autoFilter: `A1:Y${Math.max(rows.length, 1)}`,
  };
}

function createSellersSheet(opportunities: Opportunity[]): WorksheetDefinition {
  const headers = ["Vendedor", "Abertas", "Ganhas", "Perdidas", "Fee em aberto", "Forecast do fee", "Fee ganho", "Win rate", "Sem fee informado"];
  const rows: WorkbookCell[][] = [headers.map((header) => cell(header, STYLE.header))];
  const sellers = [...new Set(opportunities.map((opportunity) => opportunity.seller))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  sellers.forEach((seller) => {
    const sellerOpportunities = opportunities.filter((opportunity) => opportunity.seller === seller);
    const open = sellerOpportunities.filter((opportunity) => !opportunity.stage.startsWith("Fechado"));
    const won = sellerOpportunities.filter((opportunity) => opportunity.stage === "Fechado - Ganhou");
    const lost = sellerOpportunities.filter((opportunity) => opportunity.stage === "Fechado - Perdido");
    const closedCount = won.length + lost.length;
    rows.push([
      cell(seller), cell(open.length, STYLE.integer), cell(won.length, STYLE.integer), cell(lost.length, STYLE.integer),
      cell(sumFees(open), STYLE.currency),
      cell(sum(open, (opportunity) => (opportunityFee(opportunity) ?? 0) * (opportunity.probability / 100)), STYLE.currency),
      cell(sumFees(won), STYLE.currency),
      cell(closedCount ? won.length / closedCount : 0, STYLE.percent),
      cell(sellerOpportunities.filter((opportunity) => opportunityFee(opportunity) === null).length, STYLE.integer),
    ]);
  });
  rows.push([
    cell("Total", STYLE.header),
    cell(rows.slice(1).reduce((total, row) => total + Number(row[1]?.value ?? 0), 0), STYLE.totalInteger),
    cell(rows.slice(1).reduce((total, row) => total + Number(row[2]?.value ?? 0), 0), STYLE.totalInteger),
    cell(rows.slice(1).reduce((total, row) => total + Number(row[3]?.value ?? 0), 0), STYLE.totalInteger),
    cell(sumFees(opportunities.filter((opportunity) => !opportunity.stage.startsWith("Fechado"))), STYLE.totalCurrency),
    cell(sum(opportunities.filter((opportunity) => !opportunity.stage.startsWith("Fechado")), (opportunity) => (opportunityFee(opportunity) ?? 0) * (opportunity.probability / 100)), STYLE.totalCurrency),
    cell(sumFees(opportunities.filter((opportunity) => opportunity.stage === "Fechado - Ganhou")), STYLE.totalCurrency),
    cell("", STYLE.header),
    cell(opportunities.filter((opportunity) => opportunityFee(opportunity) === null).length, STYLE.totalInteger),
  ]);

  return {
    name: "Vendedores",
    rows,
    widths: [28, 14, 14, 14, 20, 22, 20, 16, 20],
    freezeRows: 1,
    autoFilter: `A1:I${Math.max(rows.length - 1, 1)}`,
  };
}

function worksheetXml(sheet: WorksheetDefinition) {
  const maxColumns = Math.max(sheet.widths.length, ...sheet.rows.map((row) => row.length), 1);
  const maxRows = Math.max(sheet.rows.length, 1);
  const columns = sheet.widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const rows = sheet.rows.map((row, rowIndex) => {
    const cells = row.map((item, columnIndex) => cellXml(item, rowIndex + 1, columnIndex + 1)).filter(Boolean).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const pane = frozenPaneXml(sheet.freezeRows ?? 0, sheet.freezeColumns ?? 0);
  const autoFilter = sheet.autoFilter ? `<autoFilter ref="${sheet.autoFilter}"/>` : "";
  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((range) => `<mergeCell ref="${range}"/>`).join("")}</mergeCells>`
    : "";

  return xmlHeader(
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${columnName(maxColumns)}${maxRows}"/>` +
    `<sheetViews><sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/>` +
    `<cols>${columns}</cols><sheetData>${rows}</sheetData>${autoFilter}${merges}` +
    `<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`,
  );
}

function cellXml(item: WorkbookCell, row: number, column: number) {
  if (item.value === null || item.value === "") return "";
  const reference = `${columnName(column)}${row}`;
  const style = item.style ? ` s="${item.style}"` : "";
  if (typeof item.value === "number") {
    return `<c r="${reference}"${style}><v>${Number.isFinite(item.value) ? item.value : 0}</v></c>`;
  }
  return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(item.value)}</t></is></c>`;
}

function frozenPaneXml(rows: number, columns: number) {
  if (!rows && !columns) return "";
  const topLeft = `${columnName(columns + 1)}${rows + 1}`;
  const activePane = rows && columns ? "bottomRight" : rows ? "bottomLeft" : "topRight";
  return `<pane ${columns ? `xSplit="${columns}" ` : ""}${rows ? `ySplit="${rows}" ` : ""}topLeftCell="${topLeft}" activePane="${activePane}" state="frozen"/>`;
}

function workbookXml(sheets: WorksheetDefinition[]) {
  return xmlHeader(
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<bookViews><workbookView/></bookViews><sheets>${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}` +
    `</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
  );
}

function workbookRelationshipsXml(sheetCount: number) {
  const relations = Array.from({ length: sheetCount }, (_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join("");
  return xmlHeader(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relations}` +
    `<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
}

function rootRelationshipsXml() {
  return xmlHeader(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
  );
}

function contentTypesXml(sheetCount: number) {
  const sheets = Array.from({ length: sheetCount }, (_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");
  return xmlHeader(
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets}` +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
  );
}

function corePropertiesXml() {
  const timestamp = new Date().toISOString();
  return xmlHeader(
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
    `xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>Revenue Forecast CRM</dc:creator>` +
    `<dc:title>Relatório comercial detalhado</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified></cp:coreProperties>`,
  );
}

function appPropertiesXml(sheets: WorksheetDefinition[]) {
  return xmlHeader(
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
    `<Application>Revenue Forecast CRM</Application><TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">` +
    `${sheets.map((sheet) => `<vt:lpstr>${escapeXml(sheet.name)}</vt:lpstr>`).join("")}</vt:vector></TitlesOfParts></Properties>`,
  );
}

function stylesXml(currency: Currency | null) {
  return xmlHeader(
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="3"><numFmt numFmtId="164" formatCode="${currency ? `&quot;${currency}&quot; ` : ""}#,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/><numFmt numFmtId="166" formatCode="dd/mm/yyyy hh:mm"/></numFmts>` +
    `<fonts count="7"><font><sz val="10"/><name val="Arial"/><color rgb="FF0F172A"/></font><font><b/><sz val="10"/><name val="Arial"/><color rgb="FFFFFFFF"/></font>` +
    `<font><b/><sz val="16"/><name val="Arial"/><color rgb="FF0F172A"/></font><font><i/><sz val="11"/><name val="Arial"/><color rgb="FF475569"/></font>` +
    `<font><b/><sz val="10"/><name val="Arial"/><color rgb="FF475569"/></font><font><b/><sz val="12"/><name val="Arial"/><color rgb="FF0F172A"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts>` +
    `<fills count="8"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/><bgColor indexed="64"/></patternFill></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFCFFAFE"/><bgColor indexed="64"/></patternFill></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/><bgColor indexed="64"/></patternFill></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFE2E8F0"/></left>` +
    `<right style="thin"><color rgb="FFE2E8F0"/></right><top style="thin"><color rgb="FFE2E8F0"/></top><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="20">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` +
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `<xf numFmtId="0" fontId="4" fillId="4" borderId="0" xfId="0" applyFill="1" applyFont="1"/>` +
    `<xf numFmtId="164" fontId="5" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyFont="1" applyBorder="1"/>` +
    `<xf numFmtId="10" fontId="5" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyFont="1" applyBorder="1"/>` +
    `<xf numFmtId="3" fontId="5" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyFont="1" applyBorder="1"/>` +
    `<xf numFmtId="0" fontId="6" fillId="5" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="0" fontId="6" fillId="6" borderId="0" xfId="0" applyFill="1" applyFont="1"/>` +
    `<xf numFmtId="0" fontId="6" fillId="7" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/>` +
    `<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
    `<xf numFmtId="3" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyFont="1" applyBorder="1"/>` +
    `<xf numFmtId="164" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyFont="1" applyBorder="1"/>` +
    `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  );
}

function cell(value: string | number | null, style: number = STYLE.normal): WorkbookCell { return { value, style }; }
function empty(): WorkbookCell { return { value: null }; }
function businessUnitLabel(value: BusinessUnit) { return BUSINESS_UNITS.find((unit) => unit.id === value)?.label ?? value; }

function excelDateSerial(value?: string) {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day) / 86400000 + 25569;
}

function excelDateTimeSerial(value: Date) { return value.getTime() / 86400000 + 25569; }

function nextActionStatus(opportunity: Opportunity) {
  if (opportunity.stage.startsWith("Fechado")) return "Encerrada";
  if (!opportunity.nextActionDate) return "Sem data";
  if (opportunity.nextActionDate < localDateIso()) return "Atrasada";
  if (opportunity.nextActionDate === localDateIso()) return "Hoje";
  return "Em dia";
}

function statusStyle(status: string) {
  if (status === "Atrasada" || status === "Sem data") return STYLE.red;
  if (status === "Hoje") return STYLE.amber;
  if (status === "Em dia") return STYLE.green;
  return STYLE.normal;
}

function stageStyle(stage: Opportunity["stage"]) {
  if (stage === "Fechado - Ganhou") return STYLE.green;
  if (stage === "Fechado - Perdido") return STYLE.red;
  return STYLE.normal;
}

function localDateIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return month;
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, monthNumber - 1, 1, 12));
}

function columnName(column: number) {
  let result = "";
  let current = column;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function escapeXml(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xmlHeader(contents: string) { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${contents}`; }
function sum(items: Opportunity[], getter: (opportunity: Opportunity) => number) { return items.reduce((total, opportunity) => total + getter(opportunity), 0); }
