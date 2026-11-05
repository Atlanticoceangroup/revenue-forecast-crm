import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { unzipSync, strFromU8 } from "fflate";

const require = createRequire(import.meta.url);
const result = await build({
  stdin: {
    contents: `
      export * from './src/utils/money';
      export * from './src/utils/metrics';
      export * from './src/utils/dashboardMetrics';
      export * from './src/utils/opportunityVisibility';
      export { buildOpportunitiesWorkbook } from './src/utils/exportWorkbook';
      export { upsertOpportunity, loadOpportunities } from './src/services/opportunityRepository';
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { AddOpportunityForm } from './src/components/AddOpportunityForm';
      import { OpportunityCard } from './src/components/OpportunityCard';
      import { FunnelBoard } from './src/components/FunnelBoard';
      import { DashboardMetrics } from './src/components/DashboardMetrics';
      export const renderForm = (props) => renderToStaticMarkup(React.createElement(AddOpportunityForm, props));
      export const renderCard = (props) => renderToStaticMarkup(React.createElement(OpportunityCard, props));
      export const renderBoard = (props) => renderToStaticMarkup(React.createElement(FunnelBoard, props));
      export const renderDashboard = (props) => renderToStaticMarkup(React.createElement(DashboardMetrics, props));
    `,
    loader: "tsx",
    resolveDir: process.cwd(),
  },
  bundle: true, platform: "node", format: "cjs", packages: "external", write: false,
  define: { "import.meta.env": JSON.stringify({ VITE_SUPABASE_URL: "https://test.invalid", VITE_SUPABASE_ANON_KEY: "public-test-key" }) },
});
const mod = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(require, mod, mod.exports);
const api = mod.exports;

const quotation = {
  id: "quote-1", businessUnit: "freight_projects", clientName: "Cliente & Teste", clientId: "client-1",
  opportunityName: "Cotação de teste", segment: "Projetos", service: "Consultoria", seller: "Erik",
  value: 2349, fee: 190, currency: "BRL", probability: 50,
  enteredAt: "2026-11-01", lastInteractionAt: "2026-11-01", nextActionDate: "2026-12-01",
  nextStep: "Enviar proposta", source: "inbound", leadType: "Nets", stage: "Proposta Enviada",
  priority: "alta", temperature: "quente", stageHistory: {},
};

test("valores brasileiros, campos pendentes e fee zero", () => {
  assert.equal(api.parseMoney("2.349,00"), 2349);
  assert.equal(api.parseMoney("2349,00"), 2349);
  assert.equal(api.parseMoney("190,00"), 190);
  assert.equal(api.parseMoney("0,00"), 0);
  assert.equal(api.parseMoney(""), null);
  for (const invalid of ["abc", "1,234", "-1,00", "1,2,3", "12.34", "Infinity"]) assert.throws(() => api.parseMoney(invalid));
  assert.doesNotThrow(() => api.validateQuotation(2349, 190));
  assert.doesNotThrow(() => api.validateQuotation(0, null));
  assert.throws(() => api.validateQuotation(100, 101));
  assert.throws(() => api.validateQuotation(100, -1));
  assert.throws(() => api.validateQuotation(-1, null));
});

test("receita e forecast usam fee, isolando moedas e preservando pendências", () => {
  const records = [quotation, { ...quotation, id: "usd", currency: "USD", fee: 999 },
    { ...quotation, id: "legacy", fee: null }, { ...quotation, id: "zero", fee: 0 },
    { ...quotation, id: "won", stage: "Fechado - Ganhou", closedAt: "2026-11-02", fee: 200 }];
  const brl = api.calculateMetrics(records, "BRL");
  assert.equal(brl.openRevenue, 190);
  assert.equal(brl.weightedForecast, 95);
  assert.equal(brl.wonRevenue, 200);
  assert.equal(brl.avgTicket, 200);
  assert.equal(brl.grossValue, 2349 * 4);
  assert.equal(brl.missingFeeCount, 1);
  assert.equal(api.calculateMetrics(records, "USD").openRevenue, 999);
  assert.equal(api.calculateMetrics(records, "EUR").totalOpportunities, 0);
  assert.equal(api.calculateMonthlyMetrics(records, "2026-11", "BRL").wonRevenue, 200);
  assert.equal(api.calculateMonthlyMetrics(records, "2026-10", "BRL").wonRevenue, 0);
  assert.equal(api.opportunityFee({ ...quotation, fee: undefined }), null);
  assert.equal(api.opportunityCurrency({ ...quotation, currency: undefined }), "BRL");
});

test("formulário permite edição dos valores existentes e cards distinguem bruto de fee", () => {
  const html = api.renderForm({ initial: quotation, onSubmit: async () => {}, onCancel: () => {},
    selectedBusinessUnit: "freight_projects", currentUser: { role: "manager" },
    optionLists: { clientOptions: [], sellers: [], servicesBySegment: { Projetos: [] } },
  });
  assert.ok(html.includes('value="2.349,00"'));
  assert.ok(html.includes('value="190,00"'));
  assert.ok(html.includes('value="USD"'));
  assert.ok(html.includes('value="EUR"'));
  const card = api.renderCard({ opportunity: quotation, onOpen: () => {}, onMove: async () => {} });
  assert.ok(card.includes("Fee Atlantic"));
  assert.ok(card.includes("190,00"));
  assert.ok(card.includes("2.349,00"));
  const legacy = api.renderCard({ opportunity: { ...quotation, fee: null }, onOpen: () => {}, onMove: async () => {} });
  assert.ok(legacy.includes("Não informado"));
});

test("API grava bruto, fee e moeda, aceitando sucesso sem corpo", async () => {
  const originalFetch = globalThis.fetch;
  let body;
  try {
    globalThis.fetch = async (_url, init) => { body = JSON.parse(init.body); return new Response(null, { status: 201 }); };
    await api.upsertOpportunity(quotation);
    assert.equal(body.value, 2349);
    assert.equal(body.fee, 190);
    assert.equal(body.currency, "BRL");
    await api.upsertOpportunity({ ...quotation, fee: null });
    assert.equal(body.fee, null);
    globalThis.fetch = async () => new Response(JSON.stringify([{
      ...body, currency: "USD", fee: "190.00", value: "2349.00",
    }]), { status: 200 });
    const loaded = await api.loadOpportunities();
    assert.equal(loaded[0].fee, 190);
    assert.equal(loaded[0].value, 2349);
    assert.equal(loaded[0].currency, "USD");
    globalThis.fetch = async () => new Response("Falha de gravação", { status: 500 });
    await assert.rejects(api.upsertOpportunity(quotation), /500/);
  } finally { globalThis.fetch = originalFetch; }
});

function xmlCell(xml, reference) {
  const match = xml.match(new RegExp('<c r="' + reference + '"[^>]*>(.*?)</c>'));
  return match ? match[1] : "";
}

test("Excel preserva bruto, fee, moeda, avisos e totais reconciliados", async () => {
  const bytes = await api.buildOpportunitiesWorkbook({ opportunities: [quotation], businessUnit: "freight_projects", selectedMonth: "2026-11", generatedBy: "Teste" });
  const files = unzipSync(bytes);
  const summary = strFromU8(files["xl/worksheets/sheet1.xml"]);
  const detail = strFromU8(files["xl/worksheets/sheet2.xml"]);
  assert.ok(xmlCell(summary, "B6").includes("190"));
  assert.ok(xmlCell(summary, "D6").includes("95"));
  assert.ok(xmlCell(detail, "G2").includes("2349"));
  assert.ok(xmlCell(detail, "H2").includes("95"));
  assert.ok(xmlCell(detail, "W2").includes("BRL"));
  assert.ok(xmlCell(detail, "X2").includes("190"));
  assert.ok(xmlCell(detail, "Y2").includes("Sim"));
  assert.ok(detail.includes("Cliente &amp; Teste"));
  for (const currency of ["USD", "EUR"]) {
    const output = unzipSync(await api.buildOpportunitiesWorkbook({ opportunities: [{ ...quotation, currency, fee: null }], businessUnit: "freight_projects", selectedMonth: "2026-11", generatedBy: "Teste" }));
    assert.ok(strFromU8(output["xl/styles.xml"]).includes(currency));
    assert.ok(strFromU8(output["xl/worksheets/sheet1.xml"]).includes("Receita parcial"));
    assert.equal(xmlCell(strFromU8(output["xl/worksheets/sheet2.xml"]), "X2"), "");
  }
  const empty = await api.buildOpportunitiesWorkbook({ opportunities: [], currency: "EUR", businessUnit: "freight_projects", selectedMonth: "2026-11", generatedBy: "Teste" });
  assert.ok(strFromU8(unzipSync(empty)["xl/styles.xml"]).includes("EUR"));
});

test("lista reúne BRL, USD e EUR preservando restrições de vendedor e base", () => {
  const user = { role: "manager", sellerName: "Erik", allowedBusinessUnits: ["freight_projects"] };
  const records = [quotation,
    { ...quotation, id: "usd", clientName: "Cliente USD", currency: "USD", seller: "Outro", fee: 200 },
    { ...quotation, id: "eur", clientName: "Cliente EUR", currency: "EUR", fee: 300 },
    { ...quotation, id: "legacy", clientName: "Cliente legado", currency: undefined },
    { ...quotation, id: "other-base", businessUnit: "maritime_port" },
  ];
  const visible = api.visibleOpportunitiesForUser(records, user, "freight_projects");
  assert.deepEqual(visible.map((item) => item.id), ["quote-1", "usd", "eur", "legacy"]);
  const board = api.renderBoard({ opportunities: visible, selectedStage: "", onOpen: () => {}, onMove: async () => {} });
  for (const label of ["Cliente USD", "Cliente EUR", "Cliente legado", "BRL", "USD", "EUR", "4 oportunidades"]) assert.ok(board.includes(label), label);
  assert.deepEqual(api.visibleOpportunitiesForUser(records, { ...user, role: "seller" }, "freight_projects").map((item) => item.id), ["quote-1", "eur", "legacy"]);
  assert.deepEqual(api.visibleOpportunitiesForUser(records, user, "maritime_port"), []);
  assert.deepEqual(api.visibleOpportunitiesForUser(records, null, "freight_projects"), []);
  const html = api.renderDashboard({ opportunities: visible, selectedMonth: "2026-11", onMonthChange: () => {} });
  const cards = [...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g)].map((match) => match[1]);
  const total = cards.find((card) => card.includes("Total de oportunidades"));
  const openFee = cards.find((card) => card.includes("Fee em aberto"));
  const forecast = cards.find((card) => card.includes("Forecast do fee"));
  assert.ok(!html.includes("Moeda dos indicadores"));
  assert.ok(!html.includes("<select"));
  assert.ok(total.includes(">4</strong>"));
  assert.ok(total.includes("Todas as moedas"));
  for (const [currency, fee, weighted] of [["BRL", "380,00", "190,00"], ["USD", "200,00", "100,00"], ["EUR", "300,00", "150,00"]]) {
    assert.ok(openFee.includes(fee));
    assert.ok(openFee.includes(currency));
    assert.ok(forecast.includes(weighted));
    assert.ok(forecast.includes(currency));
  }
});

test("indicadores e gestão mensal contam todas as moedas sem misturar receitas nos rankings", () => {
  const records = [quotation,
    { ...quotation, id: "usd", currency: "USD", seller: "Outro", fee: 200, stage: "Negociação", stageHistory: { "Proposta Enviada": "2026-11-01", "Negociação": "2026-11-02" } },
    { ...quotation, id: "eur", currency: "EUR", fee: 0, nextActionDate: undefined },
    { ...quotation, id: "pending", currency: "EUR", fee: null },
    { ...quotation, id: "won-brl", fee: 100, stage: "Fechado - Ganhou", closedAt: "2026-11-03", stageHistory: { "Proposta Enviada": "2026-11-01", "Negociação": "2026-11-02" } },
    { ...quotation, id: "won-usd", currency: "USD", seller: "Outro", fee: 200, stage: "Fechado - Ganhou", closedAt: "2026-11-04" },
    { ...quotation, id: "lost-eur", currency: "EUR", fee: 50, stage: "Fechado - Perdido", closedAt: "2026-11-05", lossReason: "preço" },
    { ...quotation, id: "old-won-eur", currency: "EUR", seller: "Outro", fee: 800, enteredAt: "2026-10-01", stage: "Fechado - Ganhou", closedAt: "2026-10-02" },
  ];
  const metrics = api.calculateDashboardMetrics(records, "2026-11");
  assert.equal(metrics.totalOpportunities, 8);
  assert.equal(metrics.stageCounts["Proposta Enviada"], 3);
  assert.equal(metrics.stageConversionRates["Proposta Enviada"], 1);
  assert.equal(metrics.overallConversionRate, 3 / 8);
  assert.equal(metrics.winRate, 3 / 4);
  assert.equal(metrics.lossRate, 1 / 4);
  assert.equal(metrics.avgConversionDays, 2.5);
  assert.equal(metrics.withoutNextAction, 1);
  assert.equal(metrics.missingFeeCount, 1);
  assert.deepEqual(metrics.wonRanking, [{ seller: "Outro", count: 2 }, { seller: "Erik", count: 1 }]);
  assert.equal(metrics.monthly.wonCount, 2);
  assert.equal(metrics.monthly.lostCount, 1);
  assert.equal(metrics.monthly.winRate, 2 / 3);
  assert.deepEqual(metrics.monthly.lossReasonRanking, [{ reason: "preço", count: 1 }]);
  assert.deepEqual(metrics.monthly.sellerRanking, [{ seller: "Erik", count: 1 }, { seller: "Outro", count: 1 }]);
  assert.equal(metrics.monthly.pipelineCounts["Proposta Enviada"], 3);
  assert.equal(metrics.monthly.pipelineCounts["Negociação"], 1);
  assert.deepEqual(metrics.byCurrency.map((group) => [group.currency, group.metrics.openRevenue, group.metrics.wonRevenue, group.metrics.avgTicket, group.monthly.wonRevenue]), [
    ["BRL", 190, 100, 100, 100], ["USD", 200, 200, 200, 200], ["EUR", 0, 800, 800, 0],
  ]);
  const html = api.renderDashboard({ opportunities: records, selectedMonth: "2026-11", onMonthChange: () => {} });
  assert.ok(html.includes("1 oportunidades sem fee informado"));
  for (const currency of ["BRL", "USD", "EUR"]) assert.ok(html.includes(`Fee em negociação · ${currency}`));
  const empty = api.calculateDashboardMetrics([], "2026-11");
  assert.equal(empty.winRate, 0);
  assert.equal(empty.avgConversionDays, 0);
  assert.equal(empty.monthly.winRate, 0);
  assert.deepEqual(empty.wonRanking, []);
  assert.doesNotThrow(() => api.renderDashboard({ opportunities: [], selectedMonth: "2026-11", onMonthChange: () => {} }));
});

test("Excel exporta todas as moedas juntas e mantém totais financeiros separados", async () => {
  const records = [quotation, { ...quotation, id: "usd", currency: "USD", fee: 240, value: 500 },
    { ...quotation, id: "eur", currency: "EUR", fee: null, value: 900 },
    { ...quotation, id: "eur-zero", currency: "EUR", fee: 0, value: 100 }];
  const files = unzipSync(await api.buildOpportunitiesWorkbook({ opportunities: records, currency: "BRL", businessUnit: "freight_projects", selectedMonth: "2026-11", generatedBy: "Teste" }));
  const workbook = strFromU8(files["xl/workbook.xml"]);
  const names = [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(names, ["Oportunidades", "Resumo BRL", "Vendedores BRL", "Resumo USD", "Vendedores USD", "Resumo EUR", "Vendedores EUR"]);
  const detail = strFromU8(files["xl/worksheets/sheet1.xml"]);
  for (const [reference, expected] of [["W2", "BRL"], ["W3", "USD"], ["W4", "EUR"], ["X2", "190"], ["X3", "240"], ["Y4", "Não"], ["X5", "0"]]) assert.ok(xmlCell(detail, reference).includes(expected), reference);
  assert.equal(xmlCell(detail, "X4"), "");
  for (const [sheet, currency, fee, forecast, gross] of [[2, "BRL", 190, 95, 2349], [4, "USD", 240, 120, 500], [6, "EUR", 0, 0, 1000]]) {
    const summary = strFromU8(files[`xl/worksheets/sheet${sheet}.xml`]);
    assert.ok(summary.includes(`Moeda: ${currency}`));
    assert.equal(xmlCell(summary, "B6"), `<v>${fee}</v>`);
    assert.equal(xmlCell(summary, "D6"), `<v>${forecast}</v>`);
    const total = summary.match(/<row r="(\d+)">[\s\S]*?<\/row>/g).at(-1);
    const rowNumber = total.match(/r="(\d+)"/)[1];
    assert.equal(xmlCell(summary, `C${rowNumber}`), `<v>${gross}</v>`);
    assert.equal(xmlCell(summary, `D${rowNumber}`), `<v>${fee}</v>`);
  }
  const styles = strFromU8(files["xl/styles.xml"]);
  assert.ok(styles.includes('formatCode="#,##0.00"'));
  assert.ok(!styles.includes("&quot;BRL&quot;"));
});
