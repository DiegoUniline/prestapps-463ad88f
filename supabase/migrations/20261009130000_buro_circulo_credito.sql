-- Proveedor: Círculo de Crédito (APIHub) — RCC Persona Moral
ALTER TABLE public.buro_credenciales
  ADD COLUMN IF NOT EXISTS private_key text,      -- PKCS8 PEM (EC secp384r1)
  ADD COLUMN IF NOT EXISTS cdc_public_key text;   -- SPKI PEM del certificado de Círculo

ALTER TABLE public.buro_consultas
  ADD COLUMN IF NOT EXISTS proveedor text NOT NULL DEFAULT 'circulo';
