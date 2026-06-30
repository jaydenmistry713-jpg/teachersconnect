const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function isAdmin(event) {
  return event.headers['x-admin-password'] === process.env.ADMIN_PASSWORD;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  if (!isAdmin(event)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const { name, date, location, description, price, capacity, image_url, active, show_availability, featured, ticket_types } = JSON.parse(event.body);

  if (!name || !date || !location || !price || !capacity) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  const eventCapacity = parseInt(capacity, 10);

  const { data, error } = await supabase
    .from('events')
    .insert({
      name,
      date,
      location,
      description: description || null,
      price: Math.round(parseFloat(price) * 100),
      capacity: eventCapacity,
      image_url: image_url || null,
      active: active !== false,
      show_availability: show_availability !== false,
      featured: featured === true,
    })
    .select()
    .single();

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  if (ticket_types && ticket_types.length > 0) {
    // Capacity is a single shared pool on the event (in people). Each ticket type
    // consumes `units` people per ticket. A type's own `capacity` is an optional
    // per-type sell cap (e.g. Early Bird = first 20); when no cap is given it is
    // set to the event capacity so it never binds before the shared pool.
    const typesToInsert = ticket_types.map((t, i) => {
      const cap = parseInt(t.cap, 10);
      return {
        event_id: data.id,
        name: t.name,
        price: Math.round(parseFloat(t.price) * 100),
        capacity: cap > 0 ? cap : eventCapacity,
        units: Math.max(1, parseInt(t.units, 10) || 1),
        sort_order: i,
        active: true,
      };
    });
    await supabase.from('ticket_types').insert(typesToInsert);
  }

  return {
    statusCode: 201,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
};
