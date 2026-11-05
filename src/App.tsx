import { useEffect, useMemo, useState } from "react";
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

function App() {
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
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!isLoading) {
      persistOpportunities(opportunities);
    }
  }, [isLoading, opportunities]);

  const visibleOpportunities = useMemo(() => {
    if (!currentUser) return [];
    return opportunities.filter((opportunity) => {
      const matchesBusinessUnit = opportunity.businessUnit === selectedBusinessUnit;
      const canAccessBusinessUnit = currentUser.allowedBusinessUnits.includes(opportunity.businessUnit);
      const canAccessSeller =
        currentUser.role === "manager" || currentUser.role === "admin" || opportunity.seller === currentUser.sellerName;
      return matchesBusinessUnit && canAccessBusinessUnit && canAccessSeller;
    });
  }, [currentUser, opportunities, selectedBusinessUnit]);

  const filteredOpportunities = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return visibleOpportunities.filter((opportunity) => {
      const matchesSeller = !filters.seller || opportunity.seller === filters.seller;
      const matchesStage = !filters.stage || opportunity.stage === filters.stage;
      const matchesSegment = !filters.segment || opportunity.segment === filters.segment;
      const matchesService = !filters.service || opportunity.service === filters.service;
      const matchesSearch =
        !search ||
        opportunity.clientName.toLowerCase().includes(search) ||
        opportunity.opportunityName.toLowerCase().includes(search) ||
        opportunity.segment.toLowerCase().includes(search) ||
        opportunity.service.toLowerCase().includes(search);
      return matchesSeller && matchesStage && matchesSegment && matchesService && matchesSearch;
    });
  }, [filters, visibleOpportunities]);

  const boardOpportunities = useMemo(
    () =>
      filteredOpportunities.filter((opportunity) => {
        if (!opportunity.stage.startsWith("Fechado")) return true;
        return opportunity.closedAt?.startsWith(selectedMonth);
      }),
    [filteredOpportunities, selectedMonth],
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
    if (!sourceOpportunity || sourceOpportunity.stage === stage || !currentUser || !canEditOpportunity(sourceOpportunity)) {
      return;
    }

    const lossReason = stage === "Fechado - Perdido" ? requestLossReason(sourceOpportunity.lossReason) : undefined;
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

    setOpportunities((current) =>
      current.map((opportunity) => (opportunity.id === id ? movedOpportunity : opportunity)),
    );
    await upsertOpportunity(movedOpportunity);
    await recordStageMove(id, sourceOpportunity.stage, stage, currentUser);
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
    setModalMode("view");
  }

  async function handleDeleteOpportunity(opportunity: Opportunity) {
    if (currentUser?.role !== "manager" && currentUser?.role !== "admin") return;
    const confirmed = window.confirm(`Excluir a oportunidade "${opportunity.opportunityName}" de ${opportunity.clientName}?`);
    if (!confirmed) return;
    await deleteOpportunity(opportunity.id);
    setOpportunities((current) => current.filter((item) => item.id !== opportunity.id));
    setSelected(null);
    setModalMode("view");
  }

  function openCreate() {
    setSelected(null);
    setModalMode("create");
  }

  function requestLossReason(currentReason?: Opportunity["lossReason"]) {
    if (currentReason) return currentReason;
    const options = LOSS_REASONS.map((reason, index) => `${index + 1}. ${reason}`).join("\n");
    const answer = window.prompt(`Informe o motivo da perda:\n${options}`);
    if (!answer) return undefined;
    const selectedByNumber = LOSS_REASONS[Number(answer.trim()) - 1];
    if (selectedByNumber) return selectedByNumber;
    const selectedByText = LOSS_REASONS.find((reason) => reason.toLowerCase() === answer.trim().toLowerCase());
    return selectedByText ?? "outro";
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
            void exportOpportunitiesWorkbook({
              opportunities: visibleOpportunities,
              businessUnit: selectedBusinessUnit,
              selectedMonth,
              generatedBy: currentUser.name,
            }).catch(() => {
              window.alert("Não foi possível gerar a planilha. Tente novamente.");
            });
          }
        }}
        storageMode={isSupabaseConfigured ? "cloud" : "local"}
        currentUser={currentUser!}
        selectedBusinessUnit={selectedBusinessUnit}
        onBusinessUnitChange={handleBusinessUnitChange}
        onSignOut={handleSignOut}
      />
      <DashboardMetrics
        opportunities={visibleOpportunities}
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
      />
      <FiltersBar
        filters={filters}
        onChange={setFilters}
        optionLists={optionLists}
        currentUser={currentUser!}
        selectedBusinessUnit={selectedBusinessUnit}
      />
      <FunnelBoard
        opportunities={boardOpportunities}
          onOpen={(opportunity) => {
            setSelected(opportunity);
            setModalMode("view");
          }}
        onMove={handleMove}
      />
      <footer className="mx-auto max-w-[1800px] px-4 pb-8 text-xs text-slate-500 sm:px-6">
        Integração pronta: configure as variáveis do Supabase em <code>.env</code> para colaboração na nuvem. A exportação de planilha
        fica restrito a administradores e gestores.
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
        />
      )}
    </div>
  );
}

export default App;
