-- إضافة عمود سعر التكلفة للمنتجات
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS profit_margin DECIMAL(10, 2) GENERATED ALWAYS AS (
  CASE 
    WHEN cost_price > 0 THEN ((price - cost_price) / cost_price * 100)
    ELSE 0
  END
) STORED;

-- إضافة صلاحية جديدة لعرض الأرباح
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS can_view_profits BOOLEAN DEFAULT false;

-- تحديث صلاحيات الـ Admins لعرض الأرباح
UPDATE permissions 
SET can_view_profits = true 
WHERE user_id IN (SELECT id FROM users WHERE role = 'admin');

-- عرض المنتجات مع الأرباح
SELECT 
  id,
  title,
  price,
  cost_price,
  (price - cost_price) as profit_per_unit,
  profit_margin as profit_percentage
FROM products
WHERE cost_price > 0;
