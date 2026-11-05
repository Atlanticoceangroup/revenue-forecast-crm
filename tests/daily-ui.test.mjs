import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const dom = new JSDOM('<!doctype html><html><body><button id="opener">Abrir oportunidade</button><div id="root"></div></body></html>', { url: "https://crm.test" });
for (const key of ["window", "document", "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "Event", "MouseEvent", "KeyboardEvent", "FormData", "localStorage"]) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [{ width: 100, height: 30 }]; };
const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const require = createRequire(import.meta.url);
const result = await build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    export { FeedbackProvider } from './src/components/ui/Feedback';
    export { OpportunityModal } from './src/components/OpportunityModal';
    export { AddOpportunityForm } from './src/components/AddOpportunityForm';
    export { FunnelBoard } from './src/components/FunnelBoard';
    export { DashboardMetrics } from './src/components/DashboardMetrics';
    export * from './src/utils/opportunityFilters';
    export * from './src/utils/viewPreferences';
  ` },
  bundle: true, platform: "node", format: "cjs", packages: "external", write: false,
  define: { "import.meta.env": JSON.stringify({ VITE_SUPABASE_URL: "https://test.invalid", VITE_SUPABASE_ANON_KEY: "test" }) },
});
const mod = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(require, mod, mod.exports);
const api = mod.exports;
const h = React.createElement;
let root;
const originalFetch = globalThis.fetch;
const noop = () => {};
const user = { id: "u-1", name: "Erik", sellerName: "Erik", role: "manager", email: "test@example.com", allowedBusinessUnits: ["freight_projects"] };
const quotation = { id: "q-1", clientId: "client-1", businessUnit: "freight_projects", clientName: "Cliente", opportunityName: "Cotação original", seller: "Erik", value: 2349, fee: 190, currency: "BRL", stage: "Proposta Enviada", probability: 50, segment: "Projetos", service: "Consultoria", enteredAt: "2026-11-01", lastInteractionAt: "2026-11-01", nextActionDate: "2026-12-01", nextStep: "Enviar proposta", source: "inbound", leadType: "Nets", priority: "alta", temperature: "quente", stageHistory: {} };
const formProps = { initial: quotation, onSubmit: async () => {}, onCancel: noop, selectedBusinessUnit: "freight_projects", currentUser: user, optionLists: { clientOptions: [{ id: "client-1", displayName: "Cliente", legalName: "Cliente" }], sellers: ["Erik"], servicesBySegment: { Projetos: ["Consultoria"] } }, onAddClient: async () => ({ id: "client-2", displayName: "Novo cliente", legalName: "Novo cliente" }), onAddOption: async () => {}, onDeleteOption: async () => {} };

async function mount(node) {
  root = createRoot(document.getElementById("root"));
  await act(async () => root.render(h(api.FeedbackProvider, null, node)));
}
async function click(element) { assert.ok(element, "Elemento deve existir"); await act(async () => element.click()); }
function button(label) { return [...document.querySelectorAll("button")].find((item) => item.textContent.trim() === label || item.getAttribute("aria-label") === label); }
async function change(element, value) {
  assert.ok(element);
  const prototype = element.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
    element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  localStorage.clear();
  globalThis.fetch = originalFetch;
});

test("atalhos, busca sem acentos e ordenação mantêm os dados originais", () => {
  const records = [{ ...quotation, clientName: "Navegação", nextActionDate: "2026-11-01" }, { ...quotation, id: "q2", fee: null, seller: "Outro" }, { ...quotation, id: "closed", stage: "Fechado - Ganhou", nextActionDate: "2026-11-01" }];
  assert.equal(api.filterOpportunities(records, { search: "navegacao", stage: "", segment: "", service: "", seller: "" }, "all", user).length, 1);
  assert.equal(records.filter((item) => api.matchesQuickFilter(item, "overdue", user, "2026-11-05")).length, 1);
  assert.equal(records.filter((item) => api.matchesQuickFilter(item, "missingFee", user)).length, 1);
  assert.equal(records.filter((item) => api.matchesQuickFilter(item, "mine", user)).length, 2);
  assert.equal(api.sortOpportunities(records, "fee").at(-1).id, "q2");
  assert.equal(records[0].id, "q-1");
});

test("dashboard começa compacto e a preferência de expansão é lembrada", async () => {
  await mount(h(api.DashboardMetrics, { opportunities: [quotation], currency: "BRL", selectedMonth: "2026-11", onMonthChange: noop, onQuickFilter: noop }));
  assert.equal(document.querySelectorAll("article").length, 4);
  await click(button("Ver indicadores completos"));
  assert.equal(document.querySelectorAll("article").length, 22);
  assert.equal(localStorage.getItem("crm-view-dashboard-expanded"), "true");
  await click(button("Recolher indicadores"));
  assert.equal(document.querySelectorAll("article").length, 4);
});

test("quantidade por página permanece após troca de filtro e reinício da página", async () => {
  function Harness() {
    const [size, setSize] = React.useState(api.readPageSize);
    const [filter, setFilter] = React.useState(0);
    return h(React.Fragment, null,
      h("button", { onClick: () => setFilter((value) => value + 1) }, "Trocar filtro"),
      h(api.FunnelBoard, { key: filter, opportunities: Array.from({ length: 120 }, (_, i) => ({ ...quotation, id: String(i) })), selectedStage: "", onOpen: noop, onMove: async () => {}, pageSize: size, onPageSizeChange: (value) => { setSize(value); api.savePageSize(value); } }),
    );
  }
  await mount(h(Harness));
  await change(document.querySelector("select"), "50");
  assert.equal(document.querySelectorAll("article").length, 50);
  await click(button("Próxima página"));
  assert.ok(document.body.textContent.includes("Página 2 de 3"));
  await click(button("Trocar filtro"));
  assert.equal(document.querySelector("select").value, "50");
  assert.ok(document.body.textContent.includes("Página 1 de 3"));
  assert.equal(api.readPageSize(), 50);
});

test("alterações não salvas exigem confirmação e cancelamento mantém os valores", async () => {
  let closed = 0;
  document.getElementById("opener").focus();
  await mount(h(api.OpportunityModal, { ...formProps, opportunity: quotation, mode: "edit", canEdit: true, onSave: async () => {}, onDelete: async () => {}, onEdit: noop, onClose: () => { closed++; } }));
  await change(document.querySelector('[name="opportunityName"]'), "Cotação alterada");
  await click(button("Fechar painel da oportunidade"));
  assert.ok(document.body.textContent.includes("Descartar alterações?"));
  await click(button("Cancelar"));
  assert.equal(closed, 0);
  assert.equal(document.querySelector('[name="opportunityName"]').value, "Cotação alterada");
  await click(button("Fechar painel da oportunidade"));
  await click(button("Descartar alterações"));
  assert.equal(closed, 1);
});

test("salvamento repetido é bloqueado e o painel não fecha enquanto aguarda resposta", async () => {
  let finish;
  let saves = 0;
  let closed = 0;
  const pending = new Promise((resolve) => { finish = resolve; });
  await mount(h(api.OpportunityModal, { ...formProps, opportunity: quotation, mode: "edit", canEdit: true, onSave: async () => { saves++; await pending; }, onDelete: async () => {}, onEdit: noop, onClose: () => { closed++; } }));
  const form = document.querySelector("form");
  await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  assert.equal(saves, 1);
  assert.ok(button("Fechar painel da oportunidade").disabled);
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  assert.equal(closed, 0);
  await act(async () => { finish(); await pending; });
  assert.equal(button("Fechar painel da oportunidade").disabled, false);
});

test("cadastro de cliente é um formulário separado e valida o e-mail", async () => {
  let opportunitySaves = 0;
  await mount(h(api.AddOpportunityForm, { ...formProps, onSubmit: async () => { opportunitySaves++; } }));
  await click(button("Cadastrar cliente"));
  assert.equal(document.querySelectorAll("form").length, 2);
  assert.equal(document.querySelector("form form"), null);
  const clientForm = document.querySelector('[aria-labelledby="client-dialog-title"] form');
  const email = clientForm.querySelector('[type="email"]');
  await change(email, "email-invalido");
  assert.equal(email.validity.typeMismatch, true);
  assert.equal(opportunitySaves, 0);
});

test("falha no salvamento preserva os valores e permite tentar novamente com o mesmo identificador", async () => {
  const attempts = [];
  await mount(h(api.AddOpportunityForm, { ...formProps, onSubmit: async (value) => {
    attempts.push(value);
    if (attempts.length === 1) throw new Error("Conexão indisponível");
  } }));
  await change(document.querySelector('[name="opportunityName"]'), "Cotação revisada");
  await change(document.querySelector('[name="fee"]'), "245,00");
  await click(button("Salvar"));
  assert.ok(document.querySelector('[role="alert"]').textContent.includes("Seus dados foram mantidos"));
  assert.equal(document.querySelector('[name="opportunityName"]').value, "Cotação revisada");
  assert.equal(document.querySelector('[name="fee"]').value, "245,00");
  assert.equal(document.querySelector("fieldset").disabled, false);
  await click(button("Salvar"));
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].id, attempts[1].id);
  assert.equal(attempts[1].fee, 245);
  assert.equal(document.querySelector('[role="alert"]'), null);
});

test("confirmação mantém o foco e Escape cancela apenas o diálogo superior", async () => {
  function Harness() {
    const [open, setOpen] = React.useState(true);
    return open ? h(api.OpportunityModal, { ...formProps, opportunity: quotation, mode: "edit", canEdit: true, onSave: async () => {}, onDelete: async () => {}, onEdit: noop, onClose: () => setOpen(false) }) : null;
  }
  const opener = document.getElementById("opener");
  opener.focus();
  await mount(h(Harness));
  assert.equal(document.body.style.overflow, "hidden");
  await change(document.querySelector('[name="opportunityName"]'), "Alteração pendente");
  await click(button("Fechar painel da oportunidade"));
  const decision = document.querySelector('[aria-labelledby="decision-title"]');
  const actions = decision.querySelectorAll("button");
  assert.equal(document.activeElement, actions[0]);
  actions[1].focus();
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })));
  assert.equal(document.activeElement, actions[0]);
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 1);
  assert.equal(document.querySelector('[name="opportunityName"]').value, "Alteração pendente");
  await click(button("Fechar painel da oportunidade"));
  await click(button("Descartar alterações"));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(document.body.style.overflow, "");
  assert.equal(document.activeElement, opener);
});

test("histórico distingue erro de ausência de movimentações", async () => {
  globalThis.fetch = async () => new Response("Erro", { status: 500 });
  await mount(h(api.OpportunityModal, { ...formProps, opportunity: quotation, mode: "view", canEdit: true, onSave: async () => {}, onDelete: async () => {}, onEdit: noop, onClose: noop }));
  await click(button("Histórico"));
  assert.ok(document.body.textContent.includes("Não foi possível carregar o histórico."));
  assert.ok(!document.body.textContent.includes("Nenhuma movimentação registrada ainda."));
  globalThis.fetch = async () => new Response("[]", { status: 200 });
  await click(button("Tentar novamente"));
  assert.ok(document.body.textContent.includes("Nenhuma movimentação registrada ainda."));
});
