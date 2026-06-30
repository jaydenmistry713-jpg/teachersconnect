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

  const { event_id, ticket_type_id, name, email, phone, quantity } = body;

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

  // Capacity is a single shared pool on the event, measured in PEOPLE. Each
  // ticket type consumes `units` people per ticket (Single = 1, Duo = 2, custom
  // default 1); a single-price event consumes 1 person per ticket.
  let price, units = 1, ticketTypeName = null;

  if (ticket_type_id) {
    const { data: typeData, error: typeError } = await supabase
      .from('ticket_types')
      .select('*')
      .eq('id', ticket_type_id)
      .eq('active', true)
      .single();
    if (typeError || !typeData) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Ticket type not found' }) };
    }
    price = typeData.price;
    units = Math.max(1, parseInt(typeData.units, 10) || 1);
    ticketTypeName = typeData.name;
  } else {
    price = eventData.price;
  }

  const people = quantity * units;
  const eventRemaining = eventData.capacity - eventData.tickets_sold;

  if (people > eventRemaining) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Only ${eventRemaining} spot${eventRemaining === 1 ? '' : 's'} remaining` }),
    };
  }

  // Bundle products ("Summer Series Pass") carry a "[[BUNDLE:id1,id2,...]]" marker
  // in their description. Buying one reserves one spot per linked event, so each
  // linked event must have at least `quantity` people remaining.
  const bundleMatch = String(eventData.description || '').match(/\[\[BUNDLE:([^\]]+)\]\]/);
  const bundleIds = bundleMatch ? bundleMatch[1].split(',').map(s => s.trim()).filter(Boolean) : [];
  if (bundleIds.length > 0) {
    const { data: linked } = await supabase
      .from('events')
      .select('id, name, capacity, tickets_sold')
      .in('id', bundleIds);
    for (const child of linked || []) {
      const childRemaining = child.capacity - child.tickets_sold;
      if (quantity > childRemaining) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: `"${child.name}" only has ${childRemaining} spot${childRemaining === 1 ? '' : 's'} left` }),
        };
      }
    }
  }

  const amount = price * quantity;

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
      units: String(units),
      ...(ticket_type_id && { ticket_type_id, ticket_type_name: ticketTypeName }),
    },
  });

  const { error: ticketError } = await supabase.from('tickets').insert({
    event_id,
    ticket_type_id: ticket_type_id || null,
    ticket_type_name: ticketTypeName,
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
