-- optimized indices
CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_banners_tenant_id ON banners(tenant_id);
CREATE INDEX idx_social_links_tenant_id ON social_links(tenant_id);
CREATE INDEX idx_categories_tenant_id ON categories(tenant_id);
CREATE INDEX idx_products_tenant_id ON products(tenant_id);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_product_alternatives_product_id ON product_alternatives(product_id);
CREATE INDEX idx_product_sides_product_id ON product_sides(product_id);
CREATE INDEX idx_orders_tenant_id ON orders(tenant_id);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_super_admins_email ON super_admins(email);

-- Enable Row Level Security
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_alternatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_sides ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Function to get current tenant from session
-- This assumes you will run: SET app.current_tenant_id = '123'; 
-- or use a JWT claim in Supabase/PostgREST style
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS integer AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::integer;
$$ LANGUAGE sql STABLE;

-- Super Admin Bypass (optional, check if user is super admin)
-- CREATE OR REPLACE FUNCTION is_super_admin() RETURNS boolean AS $$
--   SELECT NULLIF(current_setting('app.is_super_admin', TRUE), '')::boolean;
-- $$ LANGUAGE sql STABLE;

-- Policies for Tenants
CREATE POLICY tenant_isolation_policy ON tenants
  USING (id = current_tenant_id() OR current_setting('app.is_super_admin', TRUE) = 'true');

-- Policies for Tenant-related tables
-- Banners
CREATE POLICY tenant_banners_isolation_policy ON banners
  USING (tenant_id = current_tenant_id() OR current_setting('app.is_super_admin', TRUE) = 'true');

-- Social Links
CREATE POLICY tenant_social_links_isolation_policy ON social_links
  USING (tenant_id = current_tenant_id() OR current_setting('app.is_super_admin', TRUE) = 'true');

-- Categories
CREATE POLICY tenant_categories_isolation_policy ON categories
  USING (tenant_id = current_tenant_id() OR current_setting('app.is_super_admin', TRUE) = 'true');

-- Products
CREATE POLICY tenant_products_isolation_policy ON products
  USING (tenant_id = current_tenant_id() OR current_setting('app.is_super_admin', TRUE) = 'true');

-- Product Alternatives (via product join or just cascading if possible)
CREATE POLICY product_alt_isolation_policy ON product_alternatives
  USING (EXISTS (
    SELECT 1 FROM products 
    WHERE products.id = product_alternatives.product_id 
    AND (products.tenant_id = current_tenant_id() OR current_setting('app.is_super_admin', TRUE) = 'true')
  ));

-- Product Sides
CREATE POLICY product_sides_isolation_policy ON product_sides
  USING (EXISTS (
    SELECT 1 FROM products 
    WHERE products.id = product_sides.product_id 
    AND (products.tenant_id = current_tenant_id() OR current_setting('app.is_super_admin', TRUE) = 'true')
  ));

-- Orders
CREATE POLICY tenant_orders_isolation_policy ON orders
  USING (tenant_id = current_tenant_id() OR current_setting('app.is_super_admin', TRUE) = 'true');

-- Order Items
CREATE POLICY order_items_isolation_policy ON order_items
  USING (EXISTS (
    SELECT 1 FROM orders 
    WHERE orders.id = order_items.order_id 
    AND (orders.tenant_id = current_tenant_id() OR current_setting('app.is_super_admin', TRUE) = 'true')
  ));

-- Users
CREATE POLICY tenant_users_isolation_policy ON users
  USING (tenant_id = current_tenant_id() OR current_setting('app.is_super_admin', TRUE) = 'true');
