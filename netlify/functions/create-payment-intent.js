const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { event_id, name, email, phone, quantity } = body;

  if (!event_id || !name || !email || !phone || !quantity || quantity < 1) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  const { data: eventData, error: eventError } = await supabase
    .from('events')
    .select('*')
    .eq('id', event_id)
    .eq('active', true)
    .single();

  if (eventError || !eventData) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Event not found' }) };
  }

  const remaining = eventData.capacity - eventData.tickets_sold;
  if (quantity > remaining) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Only ${remaining} ticket${remaining === 1 ? '' : 's'} remaining` }),
    };
  }

  const amount = eventData.price * quantity;

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: 'gbp',
    metadata: {
      event_id,
      event_name: eventData.name,
      buyer_name: name,
      buyer_email: email,
      buyer_phone: phone,
      quantity: String(quantity),
    },
  });

  const { error: ticketError } = await supabase.from('tickets').insert({
    event_id,
    buyer_name: name,
    buyer_email: email,
    buyer_phone: phone,
    quantity,
    stripe_payment_intent_id: paymentIntent.id,
    amount_paid: amount,
    status: 'pending',
  });

  if (ticketError) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create ticket record' }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_secret: paymentIntent.client_secret }),
  };
};
