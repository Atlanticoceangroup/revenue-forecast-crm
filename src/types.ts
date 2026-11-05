export type FunnelStage =
  | "Prospecção"
  | "Lead Identificado"
  | "Contato Realizado"
  | "Reunião Agendada"
  | "Diagnóstico / Qualificação"
  | "Proposta Enviada"
  | "Negociação"
  | "Fechado - Ganhou"
  | "Fechado - Perdido";

export type Priority = "baixa" | "média" | "alta";
export type LeadSource = "outbound" | "inbound" | "indicação" | "evento" | "parceiro";
export type PredictableRevenueLeadType = "Seeds" | "Nets" | "Spears";
export type LeadTemperature = "frio" | "morno" | "quente";
export type BusinessUnit = "freight_projects" | "maritime_port";
export type Currency = "BRL" | "USD" | "EUR";
export type OfficialSalesSegment = "Serviços Portuários" | "Serviços Marítimos" | "Freight Forwarder" | "Projetos";
export type LegacySalesSegment =
  | "Óleo e Gás"
  | "Portos e Terminais"
  | "Navegação"
  | "Indústria"
  | "Energia"
  | "Logística"
  | "Serviços Marítimos";
export type SalesSegment = OfficialSalesSegment | LegacySalesSegment;
export type LossReason = "preço" | "concorrência" | "timing" | "sem fit" | "sem oferta" | "desistência" | "prazo" | "outro";

export interface Opportunity {
  id: string;
  businessUnit: BusinessUnit;
  clientId?: string;
  clientName: string;
  opportunityName: string;
  segment: SalesSegment;
  service: string;
  seller: string;
  value: number;
  currency?: Currency;
  fee?: number | null;
  enteredAt: string;
  lastInteractionAt: string;
  nextStep: string;
  nextActionDate?: string;
  probability: number;
  source: LeadSource;
  leadType: PredictableRevenueLeadType;
  stage: FunnelStage;
  priority: Priority;
  temperature: LeadTemperature;
  lossReason?: LossReason;
  closedAt?: string;
  stageHistory: Partial<Record<FunnelStage, string>>;
}

export interface ClientDraft {
  legalName: string;
  tradeName?: string;
  taxId?: string;
  focalPoint: string;
  companyPhone: string;
  contactEmail: string;
  address?: string;
  postalCode?: string;
  city?: string;
  state?: string;
  country?: string;
  notes?: string;
}

export interface ClientOption {
  id: string;
  displayName: string;
  legalName: string;
}

export type UserRole = "admin" | "manager" | "seller";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  sellerName: string;
  allowedBusinessUnits: BusinessUnit[];
}

export interface OpportunityHistory {
  id: number;
  opportunityId: string;
  changedAt: string;
  changedByName: string;
  changedByEmail: string;
  fromStage: FunnelStage | "";
  toStage: FunnelStage;
}

export interface Filters {
  seller: string;
  stage: string;
  segment: string;
  service: string;
  search: string;
}

export interface OptionLists {
  clients: string[];
  clientOptions: ClientOption[];
  sellers: string[];
  segments: OfficialSalesSegment[];
  services: string[];
  servicesBySegment: Record<OfficialSalesSegment, string[]>;
}
