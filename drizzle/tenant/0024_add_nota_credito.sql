-- Nota de Crédito electrónica (tipo_doc 07)
-- Agrega soporte para NC en billing_series y billing_documents.
-- document_type es varchar (sin CHECK constraint en DB) así que solo
-- necesitamos el nuevo campo referenced_document_id.

ALTER TABLE "billing_documents"
  ADD COLUMN IF NOT EXISTS "referenced_document_id" integer;

-- Índice para consultar las NC vinculadas a un documento original
CREATE INDEX IF NOT EXISTS "billing_docs_ref_doc_idx"
  ON "billing_documents" ("referenced_document_id");
