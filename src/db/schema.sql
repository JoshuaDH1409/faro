CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(50) CHECK (role IN ('ADMIN', 'VIEWER')) DEFAULT 'VIEWER',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS metrics_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  period VARCHAR(50) NOT NULL, -- e.g., '2026-10'
  gross_revenue DECIMAL(15, 2) DEFAULT 0.00,
  cac DECIMAL(15, 2) DEFAULT 0.00,
  active_accounts INTEGER DEFAULT 0,
  operating_margin DECIMAL(5, 2) DEFAULT 0.00,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, period)
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  folio VARCHAR(100) NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  service_concept VARCHAR(255),
  amount DECIMAL(15, 2) NOT NULL,
  status VARCHAR(50) CHECK (status IN ('Pagado', 'Pendiente', 'En Proceso')),
  date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, folio)
);

CREATE TABLE IF NOT EXISTS executive_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  bullet_points JSONB NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(200) NOT NULL,
  company VARCHAR(160) NOT NULL,
  role VARCHAR(120),
  message TEXT,
  source VARCHAR(60),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  email VARCHAR(200),
  stripe_customer_id VARCHAR(120),
  subscription_id VARCHAR(120) UNIQUE NOT NULL,
  status VARCHAR(40),
  current_period_end TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS subscriptions_email_idx ON subscriptions (lower(email));
CREATE INDEX IF NOT EXISTS subscriptions_customer_idx ON subscriptions (stripe_customer_id);

CREATE TABLE IF NOT EXISTS report_setups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(200) NOT NULL,
  token VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(160) DEFAULT 'Reporte semanal',
  column_mapping JSONB,
  period VARCHAR(20) DEFAULT 'week',
  schedule VARCHAR(20) DEFAULT 'weekly',
  last_reminded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS report_setups_email_uidx ON report_setups (lower(email));
CREATE INDEX IF NOT EXISTS report_setups_token_idx ON report_setups (token);

CREATE TABLE IF NOT EXISTS report_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(200) NOT NULL,
  setup_id UUID REFERENCES report_setups(id) ON DELETE SET NULL,
  title VARCHAR(255),
  summary JSONB,
  snapshot JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS report_history_email_idx ON report_history (lower(email));
CREATE INDEX IF NOT EXISTS report_history_created_idx ON report_history (created_at DESC);

CREATE TABLE IF NOT EXISTS shared_reports (
  id VARCHAR(32) PRIMARY KEY,
  email VARCHAR(200),
  snapshot JSONB NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS shared_reports_expires_idx ON shared_reports (expires_at);
