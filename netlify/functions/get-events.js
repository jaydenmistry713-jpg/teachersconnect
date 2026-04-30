const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  const onlyFeatured = event.queryStringParameters && event.queryStringParameters.featured === 'true';

  let query = supabase
    .from('events')
    .select('id, name, date, location, description, price, capacity, tickets_sold, image_url, active, show_availability, featured')
    .eq('active', true)
    .order('date', { ascending: true });

  if (onlyFeatured) query = query.eq('featured', true);

  const { data: events, error } = await query;

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  // Attach ticket types
  if (events && events.length > 0) {
    const eventIds = events.map(e => e.id);
    const { data: ticketTypes } = await supabase
      .from('ticket_types')
      .select('id, event_id, name, price, capacity, tickets_sold, sort_order')
      .in('event_id', eventIds)
      .eq('active', true)
      .order('sort_order', { ascending: true });

    const typesByEvent = {};
    (ticketTypes || []).forEach(t => {
      if (!typesByEvent[t.event_id]) typesByEvent[t.event_id] = [];
      typesByEvent[t.event_id].push(t);
    });
    events.forEach(e => { e.ticket_types = typesByEvent[e.id] || []; });
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(events),
  };
};
