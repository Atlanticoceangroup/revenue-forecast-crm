import { Save } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { BUSINESS_UNIT_SEGMENTS, BUSINESS_UNITS, FUNNEL_STAGES, LOSS_REASONS } from "../constants";
import type { BusinessUnit, ClientDraft, ClientOption, CurrentUser, FunnelStage, LeadSource, LeadTemperature, LossReason, OfficialSalesSegment, Opportunity, OptionLists, PredictableRevenueLeadType, Priority, SalesSegment } from "../types";
import { todayIso } from "../utils/metrics";

interface AddOpportunityFormProps {
  initial?: Opportunity | null;
  onSubmit: (opportunity: Opportunity) => Promise<void>;
  onCancel: () => void;
  optionLists: OptionLists;
  onAddOption: (type: keyof OptionLists, name: string, segment?: OfficialSalesSegment) => Promise<void>;
  onAddClient: (client: ClientDraft) => Promise<ClientOption>;
  onDeleteOption: (type: keyof OptionLists, name: string, segment?: OfficialSalesSegment) => Promise<void>;
  currentUser: CurrentUser;
  selectedBusinessUnit: BusinessUnit;
}

const sources: LeadSource[] = ["outbound", "inbound", "indicação", "evento", "parceiro"];
const leadTypes: PredictableRevenueLeadType[] = ["Seeds", "Nets", "Spears"];
const priorities: Priority[] = ["baixa", "média", "alta"];
const temperatures: LeadTemperature[] = ["frio", "morno", "quente"];

export function AddOpportunityForm({
  initial,
  onSubmit,
  onCancel,
  optionLists,
  onAddOption,
  onAddClient,
  onDeleteOption,
  currentUser,
  selectedBusinessUnit,
}: AddOpportunityFormProps) {
  const selectedBusinessUnitLabel = BUSINESS_UNITS.find((unit) => unit.id === selectedBusinessUnit)?.label ?? selectedBusinessUnit;
  const availableSegments = BUSINESS_UNIT_SEGMENTS[selectedBusinessUnit];
  const [selectedSegment, setSelectedSegment] = useState<OfficialSalesSegment>(
    normalizeSegmentForBusinessUnit(initial?.segment, selectedBusinessUnit) ?? availableSegments[0],
  );
  const [opportunityId] = useState(() => initial?.id ?? `opp-${crypto.randomUUID()}`);
  const isSubmittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const segmentServices = optionLists.servicesBySegment[selectedSegment] ?? [];

  useEffect(() => {
    setSelectedSegment((current) => {
      if (availableSegments.includes(current)) return current;
      return normalizeSegmentForBusinessUnit(initial?.segment, selectedBusinessUnit) ?? availableSegments[0];
    });
  }, [availableSegments, initial?.segment, selectedBusinessUnit]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    const data = new FormData(event.currentTarget);
    const stage = data.get("stage") as FunnelStage;
    const enteredAt = String(data.get("enteredAt"));
    const clientId = String(data.get("clientId") ?? "").trim();
    const clientName = String(data.get("clientName") ?? "").trim();
    if (!clientName || clientName === "Novo cliente") {
      window.alert("Cadastre ou selecione um cliente antes de criar a oportunidade.");
      return;
    }
    const nextStep = String(data.get("nextStep") ?? "").trim();
    const nextActionDate = String(data.get("nextActionDate") ?? "");
    if (!stage.startsWith("Fechado") && (!nextStep || !nextActionDate)) {
      window.alert("Para cards abertos, preencha o próximo passo e a data da próxima ação.");
      return;
    }
    const lossReason = data.get("lossReason") as LossReason | null;
    if (stage === "Fechado - Perdido" && !lossReason) {
      window.alert("Para fechar como perdido, informe o motivo da perda.");
      return;
    }
    const opportunity: Opportunity = {
      id: opportunityId,
      businessUnit: selectedBusinessUnit,
      clientId: clientId || undefined,
      clientName,
      opportunityName: String(data.get("opportunityName")),
      segment: data.get("segment") as SalesSegment,
      service: String(data.get("service")),
      seller: String(data.get("seller")),
      value: Number(data.get("value")),
      enteredAt,
      lastInteractionAt: String(data.get("lastInteractionAt")),
      nextStep,
      nextActionDate: nextActionDate || undefined,
      probability: Number(data.get("probability")),
      source: data.get("source") as LeadSource,
      leadType: data.get("leadType") as PredictableRevenueLeadType,
      stage,
      priority: data.get("priority") as Priority,
      temperature: data.get("temperature") as LeadTemperature,
      lossReason: stage === "Fechado - Perdido" ? lossReason ?? undefined : undefined,
      closedAt: stage.startsWith("Fechado") ? (initial?.closedAt ?? todayIso()) : undefined,
      stageHistory: {
        ...(initial?.stageHistory ?? { Prospecção: enteredAt }),
        [stage]: initial?.stageHistory?.[stage] ?? todayIso(),
      },
    };
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onSubmit(opportunity);
    } catch {
      window.alert("Não foi possível salvar a oportunidade. Confira sua conexão e tente novamente.");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={isSubmitting} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Base operacional" name="businessUnitLabel" value={selectedBusinessUnitLabel} readOnly />
        <ClientSelect
          name="clientId"
          defaultValue={initial?.clientId ?? findClientIdByName(optionLists.clientOptions, initial?.clientName) ?? optionLists.clientOptions[0]?.id ?? ""}
          options={optionLists.clientOptions}
          onAddClient={onAddClient}
        />
        <Field label="Oportunidade" name="opportunityName" defaultValue={initial?.opportunityName} required />
        <Select
          label="Segmento"
          name="segment"
          value={selectedSegment}
          onChange={(event) => setSelectedSegment(event.target.value as OfficialSalesSegment)}
          options={availableSegments}
        />
        <ManagedSelect
          label="Serviço"
          name="service"
          defaultValue={
            initial?.segment === selectedSegment
              ? initial?.service ?? segmentServices[0] ?? "Não informado"
              : segmentServices[0] ?? "Não informado"
          }
          options={segmentServices}
          resetKey={selectedSegment}
          onAdd={(value) => onAddOption("services", value, selectedSegment)}
          onDelete={(value) => onDeleteOption("services", value, selectedSegment)}
        />
        {currentUser.role === "manager" || currentUser.role === "admin" ? (
          <ManagedSelect
            label="Vendedor"
            name="seller"
            defaultValue={initial?.seller ?? optionLists.sellers[0] ?? "Não informado"}
            options={optionLists.sellers}
            onAdd={(value) => onAddOption("sellers", value)}
            onDelete={(value) => onDeleteOption("sellers", value)}
          />
        ) : (
          <Field label="Vendedor" name="seller" value={currentUser.sellerName} readOnly />
        )}
        <Field label="Valor estimado" name="value" type="number" defaultValue={initial?.value ?? 50000} required />
        <Field label="Entrada no funil" name="enteredAt" type="date" defaultValue={initial?.enteredAt ?? todayIso()} required />
        <Field label="Última interação" name="lastInteractionAt" type="date" defaultValue={initial?.lastInteractionAt ?? todayIso()} required />
        <Field label="Data da próxima ação" name="nextActionDate" type="date" defaultValue={initial?.nextActionDate ?? todayIso()} />
        <Select label="Etapa" name="stage" defaultValue={initial?.stage ?? FUNNEL_STAGES[0]} options={FUNNEL_STAGES} />
        <Field label="Probabilidade (%)" name="probability" type="number" min={0} max={100} defaultValue={initial?.probability ?? 15} required />
        <Select label="Origem" name="source" defaultValue={initial?.source ?? "outbound"} options={sources} />
        <Select label="Tipo Receita Previsível" name="leadType" defaultValue={initial?.leadType ?? "Spears"} options={leadTypes} />
        <Select label="Prioridade" name="priority" defaultValue={initial?.priority ?? "média"} options={priorities} />
        <Select label="Temperatura" name="temperature" defaultValue={initial?.temperature ?? "morno"} options={temperatures} />
        <Select label="Motivo da perda" name="lossReason" defaultValue={initial?.lossReason ?? ""} options={["", ...LOSS_REASONS]} />
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-normal text-slate-500">Próximo passo</span>
        <textarea
          name="nextStep"
          defaultValue={initial?.nextStep ?? "Definir próxima ação comercial"}
          rows={3}
          required
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:bg-white"
        />
      </label>
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex min-w-28 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
        >
          <Save size={16} />
          {isSubmitting ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-normal text-slate-500">{label}</span>
      <input
        {...props}
        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-500 focus:bg-white"
      />
    </label>
  );
}

function Select({ label, options, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: string[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-normal text-slate-500">{label}</span>
      <select
        {...props}
        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-500 focus:bg-white"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ClientSelect({
  name,
  defaultValue,
  options,
  onAddClient,
}: {
  name: string;
  defaultValue: string;
  options: ClientOption[];
  onAddClient: (client: ClientDraft) => Promise<ClientOption>;
}) {
  const [value, setValue] = useState(defaultValue);
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState<ClientDraft>({
    legalName: "",
    tradeName: "",
    taxId: "",
    focalPoint: "",
    companyPhone: "",
    contactEmail: "",
    address: "",
    postalCode: "",
    city: "",
    state: "",
    country: "Brasil",
    notes: "",
  });
  const selectedClient = options.find((option) => option.id === value);
  const currentOptions = selectedClient || !value ? options : [{ id: value, displayName: value, legalName: value }, ...options];

  async function handleAddClient() {
    if (!draft.legalName.trim() || !draft.focalPoint.trim() || !draft.companyPhone.trim() || !draft.contactEmail.trim()) {
      window.alert("Preencha razão social, ponto focal, telefone e e-mail do cliente.");
      return;
    }
    const createdClient = await onAddClient(draft);
    setValue(createdClient.id);
    setDraft({
      legalName: "",
      tradeName: "",
      taxId: "",
      focalPoint: "",
      companyPhone: "",
      contactEmail: "",
      address: "",
      postalCode: "",
      city: "",
      state: "",
      country: "Brasil",
      notes: "",
    });
    setIsAdding(false);
  }

  return (
    <div className="block sm:col-span-2">
      <span className="mb-1 block text-xs font-bold uppercase tracking-normal text-slate-500">Cliente</span>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <select
          name={name}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-500 focus:bg-white"
        >
          {currentOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.displayName}
            </option>
          ))}
        </select>
        <input type="hidden" name="clientName" value={selectedClient?.displayName ?? value} />
        <button
          type="button"
          onClick={() => setIsAdding((current) => !current)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600"
        >
          Cadastrar cliente
        </button>
      </div>
      {isAdding ? (
        <div className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
          <ClientField label="Razão social" value={draft.legalName} required onChange={(legalName) => setDraft({ ...draft, legalName })} />
          <ClientField label="Nome fantasia" value={draft.tradeName ?? ""} onChange={(tradeName) => setDraft({ ...draft, tradeName })} />
          <ClientField label="CNPJ" value={draft.taxId ?? ""} onChange={(taxId) => setDraft({ ...draft, taxId })} />
          <ClientField label="Ponto focal" value={draft.focalPoint} required onChange={(focalPoint) => setDraft({ ...draft, focalPoint })} />
          <ClientField label="Telefone" value={draft.companyPhone} required onChange={(companyPhone) => setDraft({ ...draft, companyPhone })} />
          <ClientField label="E-mail" value={draft.contactEmail} required type="email" onChange={(contactEmail) => setDraft({ ...draft, contactEmail })} />
          <ClientField label="Endereço" value={draft.address ?? ""} onChange={(address) => setDraft({ ...draft, address })} />
          <ClientField label="CEP" value={draft.postalCode ?? ""} onChange={(postalCode) => setDraft({ ...draft, postalCode })} />
          <ClientField label="Cidade" value={draft.city ?? ""} onChange={(city) => setDraft({ ...draft, city })} />
          <ClientField label="Estado" value={draft.state ?? ""} onChange={(state) => setDraft({ ...draft, state })} />
          <ClientField label="País" value={draft.country ?? "Brasil"} onChange={(country) => setDraft({ ...draft, country })} />
          <ClientField label="Observações" value={draft.notes ?? ""} onChange={(notes) => setDraft({ ...draft, notes })} />
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600"
            >
              Cancelar cadastro
            </button>
            <button
              type="button"
              onClick={handleAddClient}
              className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white"
            >
              Incluir cliente
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function findClientIdByName(options: ClientOption[], clientName?: string) {
  return options.find((option) => option.displayName === clientName || option.legalName === clientName)?.id;
}

function normalizeOfficialSegment(segment?: SalesSegment): OfficialSalesSegment | undefined {
  if (!segment) return undefined;
  if (["Serviços Portuários", "Serviços Marítimos", "Freight Forwarder", "Projetos"].includes(segment)) {
    return segment as OfficialSalesSegment;
  }
  if (["Portos e Terminais"].includes(segment)) return "Serviços Portuários";
  if (["Óleo e Gás", "Navegação", "Energia"].includes(segment)) return "Serviços Marítimos";
  if (segment === "Logística") return "Freight Forwarder";
  return "Projetos";
}

function normalizeSegmentForBusinessUnit(segment: SalesSegment | undefined, businessUnit: BusinessUnit): OfficialSalesSegment | undefined {
  const normalized = normalizeOfficialSegment(segment);
  if (!normalized) return undefined;
  return BUSINESS_UNIT_SEGMENTS[businessUnit].includes(normalized) ? normalized : undefined;
}

function ClientField({
  label,
  value,
  onChange,
  required,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-normal text-slate-500">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500"
      />
    </label>
  );
}

function ManagedSelect({
  label,
  name,
  defaultValue,
  options,
  onAdd,
  onDelete,
  resetKey,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: string[];
  onAdd: (value: string) => Promise<void>;
  onDelete?: (value: string) => Promise<void>;
  resetKey?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [newValue, setNewValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const currentOptions = options.includes(value) ? options : [value, ...options].filter(Boolean);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue, resetKey]);

  async function handleAdd() {
    const normalized = newValue.trim();
    if (!normalized) return;
    await onAdd(normalized);
    setValue(normalized);
    setNewValue("");
    setIsAdding(false);
  }

  async function handleDelete() {
    if (!onDelete || !value) return;
    const confirmed = window.confirm(
      `Excluir "${value}" da lista de ${label.toLowerCase()}? Os cards existentes não serão apagados.`,
    );
    if (!confirmed) return;
    await onDelete(value);
    const fallback = currentOptions.find((option) => option !== value) ?? "";
    setValue(fallback);
  }

  return (
    <div className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-normal text-slate-500">{label}</span>
      <div className={`grid gap-2 ${onDelete ? "sm:grid-cols-[1fr_auto_auto]" : "sm:grid-cols-[1fr_auto]"}`}>
        <select
          name={name}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-500 focus:bg-white"
        >
          {currentOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setIsAdding((current) => !current)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600"
        >
          Adicionar
        </button>
        {onDelete ? (
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600"
          >
            Excluir
          </button>
        ) : null}
      </div>
      {isAdding ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            value={newValue}
            onChange={(event) => setNewValue(event.target.value)}
            placeholder={`Novo ${label.toLowerCase()}`}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500"
          />
          <button
            type="button"
            onClick={handleAdd}
            className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white"
          >
            Incluir
          </button>
        </div>
      ) : null}
    </div>
  );
}
