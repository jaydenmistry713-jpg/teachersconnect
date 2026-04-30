-- Run this in the Supabase SQL editor

CREATE TABLE events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  location TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL, -- stored in pence (e.g. 1500 = £15.00)
  capacity INTEGER NOT NULL,
  tickets_sold INTEGER DEFAULT 0,
  image_emoji TEXT DEFAULT '🎉',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  buyer_name TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  buyer_phone TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  stripe_payment_intent_id TEXT UNIQUE,
  amount_paid INTEGER NOT NULL, -- total in pence
  status TEXT DEFAULT 'pending', -- pending | paid | refunded
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Used by the webhook to atomically increment tickets_sold
CREATE OR REPLACE FUNCTION increment_tickets_sold(event_id_param UUID, qty_param INTEGER)
RETURNS void AS $$
  UPDATE events SET tickets_sold = tickets_sold + qty_param WHERE id = event_id_param;
$$ LANGUAGE sql;

-- Allow public read of active events (used by get-events function with service key anyway)
-- Row-level security is optional since all DB access goes through Netlify functions using the service key

-- ── Run these ALTER statements to add columns added after initial schema ──────

ALTER TABLE events ADD COLUMN IF NOT EXISTS show_availability BOOLEAN DEFAULT true;
ALTER TABLE events ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false;

-- ── Supabase Storage setup (one-time, in the dashboard) ──────────────────────
-- 1. Go to Storage in the Supabase dashboard
-- 2. Create a new bucket named exactly: event-images
-- 3. Toggle it to Public so uploaded images are accessible without a signed URL

-- ── Ticket types (multiple price tiers per event) ─────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price INTEGER NOT NULL, -- pence
  capacity INTEGER NOT NULL,
  tickets_sold INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ticket_type_id UUID REFERENCES ticket_types(id);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ticket_type_name TEXT;

CREATE OR REPLACE FUNCTION increment_ticket_type_sold(ticket_type_id_param UUID, qty_param INTEGER)
RETURNS void AS $$
  UPDATE ticket_types SET tickets_sold = tickets_sold + qty_param WHERE id = ticket_type_id_param;
$$ LANGUAGE sql;
