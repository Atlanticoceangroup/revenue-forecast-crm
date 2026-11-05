import {
  BUSINESS_UNIT_SEGMENTS,
  BUSINESS_UNITS,
  DEFAULT_BUSINESS_UNIT,
  DEFAULT_SEGMENTS,
  DEFAULT_SERVICES_BY_SEGMENT,
  DEFAULT_SELLERS,
  LEGACY_SELLER_MAP,
} from "../constants";
import { mockOpportunities } from "../data/mockData";
import { validateQuotation } from "../utils/money";
import type { ClientDraft, ClientOption, CurrentUser, FunnelStage, OfficialSalesSegment, Opportunity, OpportunityHistory, OptionLists, SalesSegment, UserRole } from "../types";

const STORAGE_KEY = "crm-kanban-opportunities";
const OPTION_STORAGE_KEY = "crm-kanban-options";
const AUTH_STORAGE_KEY = "crm-kanban-auth";

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabaseUrl = normalizeSupabaseUrl(rawSupabaseUrl);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let authSession: AuthSession | null = readStoredSession();

export function getStoredSession() {
  return authSession;
}

export async function signIn(email: string, password: string) {
  const session = await authRequest<AuthSession>("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  authSession = session;
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function signOut() {
  authSession = null;
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

export async function loadCurrentUser(): Promise<CurrentUser | null> {
  if (!authSession) return null;
  const authUser = await authRequest<AuthUser>("/auth/v1/user");
  const rows = await supabaseRequest<SupabaseCrmUser[]>(`/rest/v1/crm_users?id=eq.${authUser.id}&select=*`);
  if (rows[0]) return fromSupabaseUser(rows[0]);

  const fallback: CurrentUser = {
    id: authUser.id,
    email: authUser.email,
    name: authUser.email.split("@")[0],
    role: "seller",
    sellerName: authUser.email.split("@")[0],
    allowedBusinessUnits: [DEFAULT_BUSINESS_UNIT],
  };
  await upsertCurrentUser(fallback);
  return fallback;
}

export async function upsertCurrentUser(user: CurrentUser) {
  await supabaseRequest("/rest/v1/crm_users?on_conflict=id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(toSupabaseUser(user)),
  });
}

export async function loadOpportunities(): Promise<Opportunity[]> {
  if (isSupabaseConfigured) {
    try {
      const rows = await supabaseRequest<SupabaseOpportunity[]>("/rest/v1/opportunities?select=*&order=created_at.desc");
      return rows.map(fromSupabase).map(normalizeOpportunity);
    } catch (error) {
      console.warn("Supabase indisponível. Usando localStorage.", error);
    }
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored).map(normalizeOpportunity) : mockOpportunities;
}

export async function persistOpportunities(opportunities: Opportunity[]) {
  if (!isSupabaseConfigured) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(opportunities));
  }
}

export async function upsertOpportunity(opportunity: Opportunity) {
  validateQuotation(opportunity.value, opportunity.fee ?? null);
  if (!isSupabaseConfigured) {
    return;
  }

  await supabaseRequest("/rest/v1/opportunities", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(toSupabase(opportunity)),
  });
}

export async function deleteOpportunity(id: string) {
  if (!isSupabaseConfigured) return;
  await supabaseRequest(`/rest/v1/opportunities?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      Prefer: "return=minimal",
    },
  });
}

export async function recordStageMove(
  opportunityId: string,
  fromStage: FunnelStage,
  toStage: FunnelStage,
  user: CurrentUser,
) {
  if (!isSupabaseConfigured) return;
  await supabaseRequest("/rest/v1/opportunity_history", {
    method: "POST",
    body: JSON.stringify({
      opportunity_id: opportunityId,
      changed_by: user.id,
      changed_by_name: user.name,
      changed_by_email: user.email,
      from_stage: fromStage,
      to_stage: toStage,
    }),
  });
}

export async function loadOpportunityHistory(opportunityId: string): Promise<OpportunityHistory[]> {
  if (!isSupabaseConfigured) return [];
  const rows = await supabaseRequest<SupabaseOpportunityHistory[]>(
    `/rest/v1/opportunity_history?opportunity_id=eq.${encodeURIComponent(
      opportunityId,
    )}&select=*&order=changed_at.desc`,
  );
  return rows.map(fromSupabaseHistory);
}

export async function addClient(client: ClientDraft): Promise<ClientOption> {
  const normalized = {
    legalName: client.legalName.trim(),
    tradeName: client.tradeName?.trim(),
    taxId: client.taxId?.trim(),
    focalPoint: client.focalPoint.trim(),
    companyPhone: client.companyPhone.trim(),
    contactEmail: client.contactEmail.trim(),
    address: client.address?.trim(),
    postalCode: client.postalCode?.trim(),
    city: client.city?.trim(),
    state: client.state?.trim(),
    country: client.country?.trim() || "Brasil",
    notes: client.notes?.trim(),
  };

  if (!normalized.legalName || !normalized.focalPoint || !normalized.companyPhone || !normalized.contactEmail) {
    throw new Error("Cliente precisa ter razão social, ponto focal, telefone e e-mail.");
  }

  if (isSupabaseConfigured) {
    const rows = await supabaseRequest<SupabaseClient[]>("/rest/v1/clients?on_conflict=legal_name&select=id,legal_name,trade_name", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(toSupabaseClient(normalized)),
    });
    return toClientOption(rows[0] ?? { id: normalized.legalName, legal_name: normalized.legalName, trade_name: normalized.tradeName });
  }

  const current = await loadOptionLists();
  const displayName = normalized.tradeName || normalized.legalName;
  const createdClient = {
    id: displayName,
    displayName,
    legalName: normalized.legalName,
  };
  const next = mergeOptionLists({
    ...current,
    clients: [...current.clients, displayName],
    clientOptions: [...current.clientOptions, createdClient],
  });
  localStorage.setItem(OPTION_STORAGE_KEY, JSON.stringify(next));
  return createdClient;
}

export async function loadOptionLists(): Promise<OptionLists> {
  if (isSupabaseConfigured) {
    try {
      const [rows, clients] = await Promise.all([
        supabaseRequest<SupabaseOption[]>("/rest/v1/crm_options?select=option_type,name,segment&order=name.asc"),
        supabaseRequest<SupabaseClient[]>("/rest/v1/clients?select=id,legal_name,trade_name&order=legal_name.asc"),
      ]);
      const clientOptions = clients.map(toClientOption);
      return mergeOptionLists({
        clients: clientOptions.map((client) => client.displayName),
        clientOptions,
        sellers: rows.filter((row) => row.option_type === "seller").map((row) => row.name),
        segments: DEFAULT_SEGMENTS,
        services: rows.filter((row) => row.option_type === "service").map((row) => row.name),
        servicesBySegment: serviceOptionsBySegment(rows),
      });
    } catch (error) {
      console.warn("Opções do Supabase indisponíveis. Usando listas locais.", error);
    }
  }

  const stored = localStorage.getItem(OPTION_STORAGE_KEY);
  return mergeOptionLists(
    stored
      ? JSON.parse(stored)
      : { clients: [], clientOptions: [], sellers: [], segments: [], services: [], servicesBySegment: DEFAULT_SERVICES_BY_SEGMENT },
  );
}

export async function addOption(type: keyof OptionLists, name: string, segment?: OfficialSalesSegment) {
  const normalized = name.trim();
  if (!normalized) return;
  if (type === "segments" || type === "servicesBySegment") return;

  if (isSupabaseConfigured) {
    if (type === "clients") {
      await supabaseRequest("/rest/v1/clients?on_conflict=legal_name", {
        method: "POST",
        headers: {
          Prefer: "resolution=ignore-duplicates",
        },
        body: JSON.stringify({ legal_name: normalized, trade_name: normalized }),
      });
      return;
    }

    await supabaseRequest("/rest/v1/crm_options?on_conflict=option_type,name,segment", {
      method: "POST",
      headers: {
        Prefer: "resolution=ignore-duplicates",
      },
      body: JSON.stringify(toSupabaseOption(type, normalized, segment)),
    });
    return;
  }

  const current = await loadOptionLists();
  const next =
    type === "services" && segment
      ? mergeOptionLists({
          ...current,
          servicesBySegment: {
            ...current.servicesBySegment,
            [segment]: [...(current.servicesBySegment[segment] ?? []), normalized],
          },
          services: [...current.services, normalized],
        })
      : mergeOptionLists({
          ...current,
          [type]: [...(current[type] as string[]), normalized],
        });
  localStorage.setItem(OPTION_STORAGE_KEY, JSON.stringify(next));
}

export async function deleteOption(type: keyof OptionLists, name: string, segment?: OfficialSalesSegment) {
  const normalized = name.trim();
  if (!normalized) return;
  if (type === "segments" || type === "servicesBySegment") return;

  if (isSupabaseConfigured) {
    if (type === "clients") {
      await supabaseRequest(`/rest/v1/clients?legal_name=eq.${encodeURIComponent(normalized)}`, {
        method: "DELETE",
        headers: {
          Prefer: "return=minimal",
        },
      });
      return;
    }

    const optionType = optionListKeyToSupabaseType(type);
    const segmentFilter = type === "services" && segment ? `&segment=eq.${encodeURIComponent(segment)}` : "";
    await supabaseRequest(
      `/rest/v1/crm_options?option_type=eq.${encodeURIComponent(optionType)}&name=eq.${encodeURIComponent(normalized)}${segmentFilter}`,
      {
        method: "DELETE",
        headers: {
          Prefer: "return=minimal",
        },
      },
    );
    return;
  }

  const current = await loadOptionLists();
  const next =
    type === "services" && segment
      ? mergeOptionLists({
          ...current,
          servicesBySegment: {
            ...current.servicesBySegment,
            [segment]: (current.servicesBySegment[segment] ?? []).filter((option) => option !== normalized),
          },
          services: Object.entries(current.servicesBySegment).flatMap(([key, values]) =>
            key === segment ? values.filter((option) => option !== normalized) : values,
          ),
        })
      : mergeOptionLists({
          ...current,
          [type]: (current[type] as string[]).filter((option) => option !== normalized),
        });
  localStorage.setItem(OPTION_STORAGE_KEY, JSON.stringify(next));
}

async function supabaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: supabaseAnonKey ?? "",
      Authorization: `Bearer ${authSession?.access_token ?? supabaseAnonKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (response.status === 401 && authSession?.refresh_token) {
    await refreshSession();
    response = await fetch(`${supabaseUrl}${path}`, {
      ...init,
      headers: {
        apikey: supabaseAnonKey ?? "",
        Authorization: `Bearer ${authSession?.access_token ?? supabaseAnonKey}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  }

  if (!response.ok) {
    throw new Error(`Erro Supabase ${response.status}: ${await response.text()}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const body = await response.text();
  return body ? JSON.parse(body) as T : undefined as T;
}

async function authRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: supabaseAnonKey ?? "",
      Authorization: `Bearer ${authSession?.access_token ?? supabaseAnonKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (response.status === 401 && authSession?.refresh_token && !path.includes("grant_type=refresh_token")) {
    await refreshSession();
    response = await fetch(`${supabaseUrl}${path}`, {
      ...init,
      headers: {
        apikey: supabaseAnonKey ?? "",
        Authorization: `Bearer ${authSession?.access_token ?? supabaseAnonKey}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  }

  if (!response.ok) {
    throw new Error(`Erro Auth ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function refreshSession() {
  if (!authSession?.refresh_token) return;
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey ?? "",
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: authSession.refresh_token }),
  });

  if (!response.ok) {
    signOut();
    throw new Error("Sessão expirada. Entre novamente.");
  }

  authSession = await response.json();
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authSession));
}

function normalizeSupabaseUrl(url?: string) {
  return url?.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
}

interface SupabaseOpportunity {
  id: string;
  business_unit?: Opportunity["businessUnit"];
  client_id?: string;
  client_name: string;
  opportunity_name: string;
  segment?: Opportunity["segment"] | string;
  service?: string;
  seller: string;
  value: number;
  currency?: Opportunity["currency"];
  fee?: number | null;
  entered_at: string;
  last_interaction_at: string;
  next_step: string;
  next_action_date?: string;
  probability: number;
  source: Opportunity["source"];
  lead_type: Opportunity["leadType"];
  stage: Opportunity["stage"];
  priority: Opportunity["priority"];
  temperature: Opportunity["temperature"];
  loss_reason?: Opportunity["lossReason"];
  closed_at?: string;
  stage_history: Opportunity["stageHistory"];
}

interface SupabaseOption {
  option_type: "seller" | "segment" | "service";
  name: string;
  segment?: OfficialSalesSegment | "global" | null;
}

interface SupabaseClient {
  id?: string;
  legal_name: string;
  trade_name?: string | null;
  tax_id?: string | null;
  focal_point?: string | null;
  company_phone?: string | null;
  contact_email?: string | null;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  notes?: string | null;
}

interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: AuthUser;
}

interface AuthUser {
  id: string;
  email: string;
}

interface SupabaseCrmUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  seller_name: string;
  allowed_business_units?: Opportunity["businessUnit"][];
}

interface SupabaseOpportunityHistory {
  id: number;
  opportunity_id: string;
  changed_at: string;
  changed_by_name: string;
  changed_by_email: string;
  from_stage: FunnelStage | null;
  to_stage: FunnelStage;
}

function fromSupabase(row: SupabaseOpportunity): Opportunity {
  return {
    id: row.id,
    businessUnit: normalizeBusinessUnit(row.business_unit),
    clientId: row.client_id,
    clientName: row.client_name,
    opportunityName: row.opportunity_name,
    segment: normalizeSegment(row.segment),
    service: row.service || "Não informado",
    seller: row.seller,
    value: Number(row.value),
    currency: row.currency ?? "BRL",
    fee: row.fee == null ? null : Number(row.fee),
    enteredAt: row.entered_at,
    lastInteractionAt: row.last_interaction_at,
    nextStep: row.next_step,
    nextActionDate: row.next_action_date,
    probability: row.probability,
    source: row.source,
    leadType: row.lead_type,
    stage: row.stage,
    priority: row.priority,
    temperature: row.temperature,
    lossReason: row.loss_reason,
    closedAt: row.closed_at,
    stageHistory: row.stage_history,
  };
}

function fromSupabaseUser(row: SupabaseCrmUser): CurrentUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    sellerName: row.seller_name,
    allowedBusinessUnits: normalizeAllowedBusinessUnits(row.allowed_business_units, row.role),
  };
}

function toSupabaseUser(user: CurrentUser): SupabaseCrmUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    seller_name: user.sellerName,
    allowed_business_units: normalizeAllowedBusinessUnits(user.allowedBusinessUnits, user.role),
  };
}

function fromSupabaseHistory(row: SupabaseOpportunityHistory): OpportunityHistory {
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    changedAt: row.changed_at,
    changedByName: row.changed_by_name,
    changedByEmail: row.changed_by_email,
    fromStage: row.from_stage ?? "",
    toStage: row.to_stage,
  };
}

function toSupabase(opportunity: Opportunity): SupabaseOpportunity {
  return {
    id: opportunity.id,
    business_unit: opportunity.businessUnit,
    client_id: opportunity.clientId,
    client_name: opportunity.clientName,
    opportunity_name: opportunity.opportunityName,
    segment: normalizeSegment(opportunity.segment),
    service: opportunity.service,
    seller: opportunity.seller,
    value: opportunity.value,
    currency: opportunity.currency ?? "BRL",
    fee: opportunity.fee ?? null,
    entered_at: opportunity.enteredAt,
    last_interaction_at: opportunity.lastInteractionAt,
    next_step: opportunity.nextStep,
    next_action_date: opportunity.nextActionDate,
    probability: opportunity.probability,
    source: opportunity.source,
    lead_type: opportunity.leadType,
    stage: opportunity.stage,
    priority: opportunity.priority,
    temperature: opportunity.temperature,
    loss_reason: opportunity.lossReason,
    closed_at: opportunity.closedAt,
    stage_history: opportunity.stageHistory,
  };
}

function toSupabaseClient(client: ClientDraft): SupabaseClient {
  return {
    legal_name: client.legalName,
    trade_name: client.tradeName || client.legalName,
    tax_id: client.taxId,
    focal_point: client.focalPoint,
    company_phone: client.companyPhone,
    contact_email: client.contactEmail,
    address: client.address,
    postal_code: client.postalCode,
    city: client.city,
    state: client.state,
    country: client.country || "Brasil",
    notes: client.notes,
  };
}

function normalizeOpportunity(opportunity: Opportunity): Opportunity {
  const segment = normalizeSegment(opportunity.segment);
  return {
    ...opportunity,
    businessUnit: businessUnitForSegment(segment),
    seller: LEGACY_SELLER_MAP[opportunity.seller] ?? opportunity.seller,
    segment,
    service: opportunity.service || "Não informado",
    nextActionDate: opportunity.nextActionDate || opportunity.lastInteractionAt,
  };
}

function normalizeBusinessUnit(value?: string): Opportunity["businessUnit"] {
  return BUSINESS_UNITS.some((unit) => unit.id === value) ? (value as Opportunity["businessUnit"]) : DEFAULT_BUSINESS_UNIT;
}

function businessUnitForSegment(segment: OfficialSalesSegment): Opportunity["businessUnit"] {
  return BUSINESS_UNIT_SEGMENTS.maritime_port.includes(segment) ? "maritime_port" : "freight_projects";
}

function normalizeAllowedBusinessUnits(
  values: Opportunity["businessUnit"][] | undefined,
  role: UserRole,
): Opportunity["businessUnit"][] {
  const fallback = role === "seller" ? [DEFAULT_BUSINESS_UNIT] : BUSINESS_UNITS.map((unit) => unit.id);
  const normalized = (values?.length ? values : fallback)
    .map((value) => normalizeBusinessUnit(value))
    .filter(Boolean);
  return [...new Set(normalized)];
}

function mergeOptionLists(optionLists: OptionLists): OptionLists {
  const servicesBySegment = mergeServicesBySegment(optionLists.servicesBySegment);
  const clientOptions = mergeClientOptions(optionLists);
  return {
    clients: uniqueSorted(clientOptions.map((client) => client.displayName)),
    clientOptions,
    sellers: uniqueSorted(optionLists.sellers?.length ? optionLists.sellers : DEFAULT_SELLERS),
    segments: DEFAULT_SEGMENTS,
    services: uniqueSorted(Object.values(servicesBySegment).flat()),
    servicesBySegment,
  };
}

function mergeClientOptions(optionLists: OptionLists): ClientOption[] {
  const sourceOptions =
    optionLists.clientOptions?.length
      ? optionLists.clientOptions
      : (optionLists.clients?.length ? optionLists.clients : mockOpportunities.map((opportunity) => opportunity.clientName)).map(
          (name) => ({ id: name, displayName: name, legalName: name }),
        );
  const byId = new Map<string, ClientOption>();
  for (const option of sourceOptions) {
    byId.set(option.id, option);
  }
  return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR"));
}

function toClientOption(client: SupabaseClient): ClientOption {
  const displayName = client.trade_name || client.legal_name;
  return {
    id: client.id ?? displayName,
    displayName,
    legalName: client.legal_name,
  };
}

function toSupabaseOption(type: keyof OptionLists, name: string, segment?: OfficialSalesSegment): SupabaseOption {
  return {
    option_type: optionListKeyToSupabaseType(type),
    name,
    segment: type === "services" ? segment ?? "Projetos" : "global",
  };
}

function optionListKeyToSupabaseType(type: keyof OptionLists): SupabaseOption["option_type"] {
  if (type === "sellers") return "seller";
  if (type === "segments") return "segment";
  return "service";
}

function serviceOptionsBySegment(rows: SupabaseOption[]): Record<OfficialSalesSegment, string[]> {
  const services = rows.filter((row) => row.option_type === "service");
  const grouped = { ...DEFAULT_SERVICES_BY_SEGMENT };
  for (const service of services) {
    const segment = normalizeSegment(service.segment ?? "");
    grouped[segment] = [...(grouped[segment] ?? []), service.name];
  }
  return grouped;
}

function mergeServicesBySegment(values?: Partial<Record<OfficialSalesSegment, string[]>>): Record<OfficialSalesSegment, string[]> {
  return DEFAULT_SEGMENTS.reduce(
    (acc, segment) => {
      acc[segment] = uniqueSorted([...(DEFAULT_SERVICES_BY_SEGMENT[segment] ?? []), ...(values?.[segment] ?? [])]);
      return acc;
    },
    {} as Record<OfficialSalesSegment, string[]>,
  );
}

function normalizeSegment(value?: string): OfficialSalesSegment {
  if (DEFAULT_SEGMENTS.includes(value as OfficialSalesSegment)) {
    return value as OfficialSalesSegment;
  }
  const normalized = value?.trim().toLowerCase() ?? "";
  if (["portos e terminais", "serviços portuários", "apoio portuário"].includes(normalized)) {
    return "Serviços Portuários";
  }
  if (["serviços marítimos", "navegação", "óleo e gás", "energia"].includes(normalized)) {
    return "Serviços Marítimos";
  }
  if (["freight forwarder", "logística", "logistica"].includes(normalized)) {
    return "Freight Forwarder";
  }
  return "Projetos";
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean).map((value) => value.trim()))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}

function readStoredSession(): AuthSession | null {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}
