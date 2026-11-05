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
      export { buildOpportunitiesWorkbook } from './src/utils/exportWorkbook';
      export { upsertOpportunity, loadOpportunities } from './src/services/opportunityRepository';
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { AddOpportunityForm } from './src/components/AddOpportunityForm';
      import { OpportunityCard } from './src/components/OpportunityCard';
      import { FeedbackProvider } from './src/components/ui/Feedback';
      export const renderForm = (props) => renderToStaticMarkup(React.createElement(FeedbackProvider, null, React.createElement(AddOpportunityForm, props)));
      export const renderCard = (props) => renderToStaticMarkup(React.createElement(OpportunityCard, props));
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
  await assert.rejects(api.buildOpportunitiesWorkbook({ opportunities: [quotation, { ...quotation, currency: "USD" }], businessUnit: "freight_projects", selectedMonth: "2026-11", generatedBy: "Teste" }), /única moeda/);
  const empty = await api.buildOpportunitiesWorkbook({ opportunities: [], currency: "EUR", businessUnit: "freight_projects", selectedMonth: "2026-11", generatedBy: "Teste" });
  assert.ok(strFromU8(unzipSync(empty)["xl/styles.xml"]).includes("EUR"));
});
