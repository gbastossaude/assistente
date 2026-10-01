-- Entidades tipadas de situações especiais, expostas como VIEWs sobre special_case_entries.
-- Mantêm um único motor de cadastro/validação (src/lib/domain/special-cases.ts) e permitem consultas SQL diretas.
CREATE OR REPLACE VIEW home_care_cases AS
SELECT id, quotation_id,
       data->>'identificacao' AS identification,
       NULLIF(data->>'gasto_mensal', '')::numeric AS monthly_cost,
       NULLIF(data->>'relatorio_medico', '')::uuid AS medical_report_document_id,
       NULLIF(data->>'protocolo', '')::uuid AS protocol_document_id,
       data->>'observacao' AS notes,
       created_at, updated_at
FROM special_case_entries WHERE kind = 'home_care';
--> statement-breakpoint
CREATE OR REPLACE VIEW injunction_cases AS
SELECT id, quotation_id,
       data->>'descricao' AS description,
       NULLIF(data->>'documento', '')::uuid AS document_id,
       data->>'observacao' AS notes,
       created_at, updated_at
FROM special_case_entries WHERE kind = 'liminares';
--> statement-breakpoint
CREATE OR REPLACE VIEW dismissed_retired_cases AS
SELECT id, quotation_id,
       data->>'tipo' AS kind,
       NULLIF(data->>'quantidade', '')::int AS quantity,
       data->>'faixa_etaria' AS age_band,
       NULLIF(data->>'custo_medio', '')::numeric AS average_cost,
       data->>'observacao' AS notes,
       created_at, updated_at
FROM special_case_entries WHERE kind = 'demitidos_aposentados';
