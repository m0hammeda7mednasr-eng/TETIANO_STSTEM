-- جدول التقارير اليومية للمستخدمين
CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  tasks_completed TEXT,
  notes TEXT,
  attachments JSONB DEFAULT '[]', -- [{name: "file.pdf", url: "...", type: "pdf"}]
  status VARCHAR(50) DEFAULT 'draft', -- draft, submitted, reviewed
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- جدول طلبات الصلاحيات
CREATE TABLE IF NOT EXISTS access_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  permission_requested VARCHAR(100) NOT NULL,
  reason TEXT,
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  admin_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_daily_reports_user_id ON daily_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_access_requests_user_id ON access_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);

-- جدول لتخزين الملفات المرفقة
CREATE TABLE IF NOT EXISTS report_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID REFERENCES daily_reports(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_type VARCHAR(50),
  file_size INTEGER,
  uploaded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_attachments_report_id ON report_attachments(report_id);
