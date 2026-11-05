import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_BUSINESS_UNIT, DEFAULT_SERVICES_BY_SEGMENT, LOSS_REASONS } from "./constants";
import { DashboardMetrics } from "./components/DashboardMetrics";
import { FiltersBar } from "./components/FiltersBar";
import { FunnelBoard } from "./components/FunnelBoard";
import { Header } from "./components/Header";
import { LoginScreen } from "./components/LoginScreen";
import { OpportunityModal } from "./components/OpportunityModal";
import { exportOpportunitiesWorkbook } from "./utils/exportWorkbook";
import {
  isSupabaseConfigured,
  addOption,
  addClient,
  deleteOption,
  deleteOpportunity,
  loadCurrentUser,
  loadOptionLists,
  loadOpportunities,
  persistOpportunities,
  recordStageMove,
  signIn,
  signOut,
  upsertOpportunity,
} from "./services/opportunityRepository";
import type { BusinessUnit, ClientDraft, ClientOption, CurrentUser, Filters, FunnelStage, OfficialSalesSegment, Opportunity, OptionLists } from "./types";
import { todayIso } from "./utils/metrics";
import { opportunityCurrency } from "./utils/money";
import type { Currency } from "./types";
import { useFeedback } from "./components/ui/Feedback";
import { filterOpportunities, sortOpportunities } from "./utils/opportunityFilters";
import type { QuickFilter, SortOrder } from "./utils/opportunityFilters";
import { readPageSize, savePageSize } from "./utils/viewPreferences";

function App() {
  const { notify, decide } = useFeedback();
  const movingIds = useRef(new Set<string>());
  const [isExporting, setIsExporting] = useState(false);
  const [pageSize, setPageSize] = useState(readPageSize);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("nextAction");
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [optionLists, setOptionLists] = useState<OptionLists>({
    clients: [],
    clientOptions: [],
    sellers: [],
    segments: [],
    services: [],
    servicesBySegment: DEFAULT_SERVICES_BY_SEGMENT,
  });
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [selectedBusinessUnit, setSelectedBusinessUnit] = useState<BusinessUnit>(DEFAULT_BUSINESS_UNIT);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>("BRL");
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({ seller: "", stage: "", segment: "", service: "", search: "" });
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [modalMode, setModalMode] = useState<"view" | "edit" | "create">("view");

  useEffect(() => {
    loadCurrentUser()
      .then(async (loadedUser) => {
        setCurrentUser(loadedUser);
        if (!loadedUser) return;
        setSelectedBusinessUnit(loadedUser.allowedBusinessUnits[0] ?? DEFAULT_BUSINESS_UNIT);
        const [loadedOpportunities, loadedOptions] = await Promise.all([loadOpportunities(), loadOptionLists()]);
        setOpportunities(loadedOpportunities);
        setOptionLists(loadedOptions);
      })
      .catch(() => {
        signOut();
        setCurrentUser(null);
        notify("Não foi possível carregar sua sessão. Entre novamente.", "error");
      })
      .finally(() => setIsLoading(false));
  }, [notify]);

  useEffect(() => {
    if (!isLoading) {
      void persistOpportunities(opportunities).catch(() => notify("Não foi possível salvar os dados neste navegador.", "error"));
    }
  }, [isLoading, opportunities, notify]);

  const visibleOpportunities = useMemo(() => {
    if (!currentUser) return [];
    return opportunities.filter((opportunity) => {
      const matchesBusinessUnit = opportunity.businessUnit === selectedBusinessUnit;
      const canAccessBusinessUnit = currentUser.allowedBusinessUnits.includes(opportunity.businessUnit);
      const canAccessSeller =
        currentUser.role === "manager" || currentUser.role === "admin" || opportunity.seller === currentUser.sellerName;
      return matchesBusinessUnit && canAccessBusinessUnit && canAccessSeller && opportunityCurrency(opportunity) === selectedCurrency;
    });
  }, [currentUser, opportunities, selectedBusinessUnit, selectedCurrency]);

  const filteredOpportunities = useMemo(() => currentUser
    ? filterOpportunities(visibleOpportunities, filters, quickFilter, currentUser)
    : [], [filters, visibleOpportunities, quickFilter, currentUser]);

  const boardOpportunities = useMemo(
    () =>
      sortOpportunities(filteredOpportunities.filter((opportunity) => {
        if (!opportunity.stage.startsWith("Fechado")) return true;
        return opportunity.closedAt?.startsWith(selectedMonth);
      }), sortOrder),
    [filteredOpportunities, selectedMonth, sortOrder],
  );

  async function handleAddOption(type: keyof OptionLists, name: string, segment?: OfficialSalesSegment) {
    await addOption(type, name, segment);
    const nextOptions = await loadOptionLists();
    setOptionLists(nextOptions);
  }

  async function handleAddClient(client: ClientDraft): Promise<ClientOption> {
    const createdClient = await addClient(client);
    const nextOptions = await loadOptionLists();
    setOptionLists(nextOptions);
    return createdClient;
  }

  async function handleDeleteOption(type: keyof OptionLists, name: string, segment?: OfficialSalesSegment) {
    await deleteOption(type, name, segment);
    const nextOptions = await loadOptionLists();
    setOptionLists(nextOptions);
  }

  async function handleLogin(email: string, password: string) {
    await signIn(email, password);
    const loadedUser = await loadCurrentUser();
    setCurrentUser(loadedUser);
    if (!loadedUser) return;
    setSelectedBusinessUnit(loadedUser.allowedBusinessUnits[0] ?? DEFAULT_BUSINESS_UNIT);
    const [loadedOpportunities, loadedOptions] = await Promise.all([loadOpportunities(), loadOptionLists()]);
    setOpportunities(loadedOpportunities);
    setOptionLists(loadedOptions);
  }

  function handleSignOut() {
    signOut();
    setCurrentUser(null);
    setOpportunities([]);
    setSelected(null);
    setSelectedBusinessUnit(DEFAULT_BUSINESS_UNIT);
    setSelectedCurrency("BRL");
    setFilters({ seller: "", stage: "", segment: "", service: "", search: "" });
    setQuickFilter("all");
  }

  function handleBusinessUnitChange(businessUnit: BusinessUnit) {
    setSelectedBusinessUnit(businessUnit);
    setFilters((current) => ({ ...current, segment: "", service: "" }));
  }

  function canEditOpportunity(opportunity: Opportunity) {
    if (!currentUser) return false;
    const canAccessBusinessUnit = currentUser.allowedBusinessUnits.includes(opportunity.businessUnit);
    const canAccessSeller =
      currentUser.role === "manager" || currentUser.role === "admin" || opportunity.seller === currentUser.sellerName;
    return canAccessBusinessUnit && canAccessSeller;
  }

  async function handleMove(id: string, stage: FunnelStage) {
    const sourceOpportunity = opportunities.find((opportunity) => opportunity.id === id);
    if (!sourceOpportunity || sourceOpportunity.stage === stage || !currentUser || !canEditOpportunity(sourceOpportunity) || movingIds.current.has(id)) {
      return;
    }

    movingIds.current.add(id);
    try {
    const lossReason = stage === "Fechado - Perdido" ? await requestLossReason(sourceOpportunity.lossReason) : undefined;
    if (stage === "Fechado - Perdido" && !lossReason) return;

    const movedOpportunity: Opportunity = {
      ...sourceOpportunity,
      stage,
      probability: stage === "Fechado - Ganhou" ? 100 : stage === "Fechado - Perdido" ? 0 : sourceOpportunity.probability,
      closedAt: stage.startsWith("Fechado") ? todayIso() : undefined,
      lossReason: stage === "Fechado - Perdido" ? lossReason : undefined,
      lastInteractionAt: todayIso(),
      stageHistory: {
        ...sourceOpportunity.stageHistory,
        [stage]: sourceOpportunity.stageHistory[stage] ?? todayIso(),
      },
    };

    await upsertOpportunity(movedOpportunity);
    setOpportunities((current) =>
      current.map((opportunity) => (opportunity.id === id ? movedOpportunity : opportunity)),
    );
    if (selected?.id === id) setSelected(movedOpportunity);
    try {
      await recordStageMove(id, sourceOpportunity.stage, stage, currentUser);
      notify(`Etapa atualizada para ${stage}.`);
    } catch {
      notify("A etapa foi salva, mas não foi possível registrar o histórico.", "error");
    }
    } catch {
      notify("Não foi possível alterar a etapa. A oportunidade foi mantida como estava.", "error");
    } finally { movingIds.current.delete(id); }
  }

  async function handleSave(opportunity: Opportunity) {
    if (!currentUser) return;
    const isCreating = modalMode === "create";
    const savedOpportunity: Opportunity = {
      ...opportunity,
      businessUnit: selectedBusinessUnit,
      seller:
        currentUser.role === "manager" || currentUser.role === "admin"
          ? opportunity.seller
          : currentUser.sellerName,
    };
    await upsertOpportunity(savedOpportunity);
    setOpportunities((current) => {
      const exists = current.some((item) => item.id === savedOpportunity.id);
      return exists
        ? current.map((item) => (item.id === savedOpportunity.id ? savedOpportunity : item))
        : [savedOpportunity, ...current];
    });
    setSelected(isCreating ? null : savedOpportunity);
    setSelectedCurrency(opportunityCurrency(savedOpportunity));
    setModalMode("view");
    notify(isCreating ? "Oportunidade criada." : "Oportunidade atualizada.");
  }

  async function handleDeleteOpportunity(opportunity: Opportunity) {
    if (currentUser?.role !== "manager" && currentUser?.role !== "admin") return;
    const confirmed = await decide({ title: "Excluir oportunidade?", message: `A oportunidade “${opportunity.opportunityName}”, de ${opportunity.clientName}, e seu histórico serão excluídos. Essa ação não pode ser desfeita pela interface.`, confirmLabel: "Excluir oportunidade", destructive: true });
    if (!confirmed) return;
    try {
    await deleteOpportunity(opportunity.id);
    setOpportunities((current) => current.filter((item) => item.id !== opportunity.id));
    setSelected(null);
    setModalMode("view");
    notify("Oportunidade excluída.");
    } catch { notify("Não foi possível excluir. A oportunidade foi mantida.", "error"); }
  }

  function openCreate() {
    setSelected(null);
    setModalMode("create");
  }

  async function requestLossReason(currentReason?: Opportunity["lossReason"]) {
    if (currentReason) return currentReason;
    const answer = await decide({ title: "Fechar como perdido", message: "Selecione o motivo da perda para registrar o fechamento.", choices: LOSS_REASONS, confirmLabel: "Confirmar perda" });
    return answer ? answer as Opportunity["lossReason"] : undefined;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#eef3f8] px-4 py-10 text-sm font-semibold text-slate-500">
        Carregando CRM...
      </div>
    );
  }

  if (!currentUser && !isLoading) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-[#eef3f8]">
      <Header
        onAdd={openCreate}
        onExport={() => {
          if (currentUser?.role === "admin" || currentUser?.role === "manager") {
            setIsExporting(true);
            void exportOpportunitiesWorkbook({
              opportunities: boardOpportunities,
              businessUnit: selectedBusinessUnit,
              selectedMonth,
              generatedBy: currentUser.name,
              currency: selectedCurrency,
            }).then(() => notify("Planilha gerada com os resultados filtrados.")).catch(() => {
              notify("Não foi possível gerar a planilha. Tente novamente.", "error");
            }).finally(() => setIsExporting(false));
          }
        }}
        storageMode={isSupabaseConfigured ? "cloud" : "local"}
        currentUser={currentUser!}
        selectedBusinessUnit={selectedBusinessUnit}
        selectedCurrency={selectedCurrency}
        onCurrencyChange={setSelectedCurrency}
        onBusinessUnitChange={handleBusinessUnitChange}
        onSignOut={handleSignOut}
        isExporting={isExporting}
      />
      <DashboardMetrics
        opportunities={boardOpportunities}
        currency={selectedCurrency}
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
        onQuickFilter={setQuickFilter}
      />
      <FiltersBar
        filters={filters}
        onChange={setFilters}
        optionLists={optionLists}
        currentUser={currentUser!}
        selectedBusinessUnit={selectedBusinessUnit}
        opportunities={visibleOpportunities.filter((item) => !item.stage.startsWith("Fechado") || item.closedAt?.startsWith(selectedMonth))}
        quickFilter={quickFilter}
        onQuickFilter={setQuickFilter}
        sortOrder={sortOrder}
        onSortChange={setSortOrder}
      />
      <FunnelBoard
        key={JSON.stringify([selectedBusinessUnit, selectedMonth, selectedCurrency, filters, quickFilter, sortOrder])}
        opportunities={boardOpportunities}
        selectedStage={filters.stage}
        pageSize={pageSize}
        onPageSizeChange={(size) => { setPageSize(size); savePageSize(size); }}
          onOpen={(opportunity) => {
            setSelected(opportunity);
            setModalMode("view");
          }}
        onMove={handleMove}
      />
      <footer className="mx-auto max-w-[1800px] px-4 pb-8 text-xs text-slate-500 sm:px-6">
        Atlantic Ocean Services · Gestão comercial
        <span className="mt-2 block font-semibold text-slate-400">
          Desenvolvido por Paulo Penna - Atlantic Ocean Services 2026
        </span>
      </footer>
      {(selected || modalMode === "create") && (
        <OpportunityModal
          opportunity={selected}
          mode={modalMode}
          onClose={() => {
            setSelected(null);
            setModalMode("view");
          }}
          onEdit={() => setModalMode("edit")}
          onSave={handleSave}
          onDelete={handleDeleteOpportunity}
          optionLists={optionLists}
          onAddOption={handleAddOption}
          onAddClient={handleAddClient}
          onDeleteOption={handleDeleteOption}
          currentUser={currentUser!}
          selectedBusinessUnit={selectedBusinessUnit}
          canEdit={selected ? canEditOpportunity(selected) : true}
          defaultCurrency={selectedCurrency}
        />
      )}
    </div>
  );
}

export default App;
