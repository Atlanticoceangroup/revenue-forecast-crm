# Valor bruto, fee Atlantic e moedas

O campo `value` existente passa a ser apresentado como valor bruto da cotação.
O novo campo `fee` representa a receita Atlantic em valor fixo, na mesma moeda
do bruto. A interface aceita valores como `2.349,00` e `190,00`.

## Aplicação no projeto existente

1. Faça backup do banco antes da atualização.
2. No SQL Editor do projeto Supabase conectado ao CRM, execute o conteúdo de
   `supabase/migrations/20261105124839_quotation_gross_fee_currency.sql` uma vez.
3. Confira os campos com a consulta abaixo.
4. Publique o frontend atualizado somente depois de aplicar o SQL.

```sql
select id, client_name, value as bruto, fee, currency
from public.opportunities
order by created_at desc
limit 20;
```

Este repositório já possui scripts SQL manuais anteriores. O novo arquivo é
incremental e pressupõe essas tabelas existentes; sozinho não inicializa um
banco vazio. A constraint de bruto não negativo é `NOT VALID` para não bloquear
a instalação por registros antigos inconsistentes. Novas gravações e alterações
já respeitam a regra. Após revisar dados legados, ela pode ser validada.

## Regras de uso

- Registros antigos permanecem em BRL com o bruto preservado e fee não informado.
- Bruto vazio no cadastro é salvo como zero até a cotação ser definida.
- Fee pode ser preenchido na criação ou depois, ao editar a oportunidade.
- Fee em branco não significa zero. Fee `0,00` confirma receita zero.
- Fee deve ser não negativo e não pode ultrapassar o bruto.
- O cabeçalho seleciona a moeda da visualização. Lista, indicadores e exportação
  usam a mesma moeda. Para consultar outras moedas, altere essa seleção.
- Trocar moeda no cadastro relabela os valores digitados, sem câmbio automático.
- Receita, ticket e forecast usam somente fees informados. O dashboard e o Excel
  avisam quando os totais são parciais por falta de fee.
- Ganhos e perdas contam todas as oportunidades da moeda selecionada, mesmo
  quando o fee está pendente. Fee médio usa somente ganhos com fee informado.
- O bruto permanece separado na lista, no detalhe e na exportação.
- A antiga cobertura de meta foi substituída pelo bruto das cotações: a meta
  anterior não foi definida como uma meta de fee por moeda.
- O Excel é um retrato dos dados exportados, sem recálculo após edição manual.

## Validação de publicação

Cadastre bruto `2.349,00`, fee `190,00` e BRL. Confira a receita como BRL 190,00.
Edite o fee, recarregue e confira a persistência. Repita com USD e EUR e confirme
que cada moeda aparece apenas na seleção correspondente. Verifique que um
registro antigo continua sem fee até ele ser informado explicitamente.
