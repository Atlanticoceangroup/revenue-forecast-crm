-- Aplicar no projeto existente depois das migrations de autenticação e bases.
-- value mantém o valor bruto já cadastrado. Fee antigo não pode ser inferido.
begin;

alter table public.opportunities
  add column if not exists currency text not null default 'BRL',
  add column if not exists fee numeric(18, 2);

alter table public.opportunities
  add constraint opportunities_currency_check
    check (currency in ('BRL', 'USD', 'EUR')),
  add constraint opportunities_quotation_fee_check
    check (fee is null or (fee >= 0 and fee <= value and fee < 'Infinity'::numeric)),
  add constraint opportunities_gross_nonnegative_check
    check (value >= 0 and value < 'Infinity'::numeric) not valid;

comment on column public.opportunities.value is 'Valor bruto da cotação na moeda indicada em currency.';
comment on column public.opportunities.fee is 'Receita Atlantic, digitada em valor fixo na mesma moeda do bruto. NULL = não informado; zero = fee zero confirmado.';
comment on column public.opportunities.currency is 'Moeda dos valores bruto e fee: BRL, USD ou EUR. Sem conversão cambial automática.';

commit;
