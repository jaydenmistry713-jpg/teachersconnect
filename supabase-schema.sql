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
