const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function isAdmin(event) {
  return event.headers['x-admin-password'] === process.env.ADMIN_PASSWORD;
}

exports.handler = async (event) => {
  if (!isAdmin(event)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('date', { ascending: false });

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  // Attach ticket types
  if (data && data.length > 0) {
    const eventIds = data.map(e => e.id);
    const { data: ticketTypes } = await supabase
      .from('ticket_types')
      .select('id, event_id, name, price, capacity, tickets_sold, units, sort_order, active')
      .in('event_id', eventIds)
      .order('sort_order', { ascending: true });
    const typesByEvent = {};
    (ticketTypes || []).forEach(t => {
      if (!typesByEvent[t.event_id]) typesByEvent[t.event_id] = [];
      typesByEvent[t.event_id].push(t);
    });
    data.forEach(e => { e.ticket_types = typesByEvent[e.id] || []; });
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
};
