-- ==========================================
-- SUPABASE SCHEMA FOR SIMPLY DELIVERY
-- ==========================================

-- 1. Restaurants
CREATE TABLE restaurants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    address TEXT,
    phone TEXT,
    whatsapp TEXT,
    delivery_fee DECIMAL(10,2) DEFAULT 0.00,
    delivery_time TEXT,
    is_open BOOLEAN DEFAULT true,
    logo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- 2. Profiles (Extends Supabase Auth)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('admin', 'caixa', 'driver')),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- 3. Categories
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true
);

-- 4. Products
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false
);

-- 5. Product Variations (e.g. Size: Small, Large)
CREATE TABLE product_variations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price DECIMAL(10,2) NOT NULL
);

-- 6. Product Addons (e.g. Extra Bacon)
CREATE TABLE product_addons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    is_active BOOLEAN DEFAULT true
);

-- 7. Customers (CRM)
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT,
    order_count INTEGER DEFAULT 0,
    total_spent DECIMAL(10,2) DEFAULT 0.00,
    accepts_notifications BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    UNIQUE(restaurant_id, phone)
);

-- 8. Orders
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_address TEXT,
    status TEXT CHECK (status IN ('new', 'prep', 'ready', 'delivering', 'delivered', 'completed', 'canceled')) DEFAULT 'new',
    type TEXT CHECK (type IN ('delivery', 'pickup')) DEFAULT 'delivery',
    payment_method TEXT,
    subtotal DECIMAL(10,2) NOT NULL,
    delivery_fee DECIMAL(10,2) DEFAULT 0.00,
    discount DECIMAL(10,2) DEFAULT 0.00,
    total DECIMAL(10,2) NOT NULL,
    driver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- 9. Order Items
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    notes TEXT,
    variation_name TEXT,
    addons JSONB -- Store selected addons as JSON array
);

-- 10. Coupons
CREATE TABLE coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    description TEXT,
    type TEXT CHECK (type IN ('percent', 'fixed')) NOT NULL,
    value DECIMAL(10,2) NOT NULL,
    min_order DECIMAL(10,2) DEFAULT 0.00,
    usage_limit INTEGER,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(restaurant_id, code)
);

-- Note: Enable Row Level Security (RLS) on these tables via Supabase Dashboard to ensure restaurants only access their own data.
