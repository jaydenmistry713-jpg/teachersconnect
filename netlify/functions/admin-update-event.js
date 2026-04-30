const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function isAdmin(event) {
  return event.headers['x-admin-password'] === process.env.ADMIN_PASSWORD;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'PUT') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  if (!isAdmin(event)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const { id, name, date, location, description, price, capacity, image_url, active, show_availability, featured, ticket_types } = JSON.parse(event.body);

  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Event ID required' }) };
  }

  const updates = {
    name,
    date,
    location,
    description: description || null,
    capacity: parseInt(capacity, 10),
    image_url: image_url !== undefined ? image_url : null,
    active,
    show_availability: show_availability !== false,
    featured: featured === true,
  };

  if (price !== undefined) {
    updates.price = Math.round(parseFloat(price) * 100);
  }

  const { data, error } = await supabase
    .from('events')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  if (ticket_types !== undefined) {
    const incoming = ticket_types || [];

    // Fetch current ticket types so we know what exists
    const { data: existing } = await supabase
      .from('ticket_types')
      .select('id')
      .eq('event_id', id);

    const existingIds = new Set((existing || []).map(t => t.id));
    const incomingIds = new Set(incoming.filter(t => t.id).map(t => t.id));

    // IDs present in DB but removed from the form → delete them
    const toDelete = [...existingIds].filter(eid => !incomingIds.has(eid));
    if (toDelete.length > 0) {
      // Clear FK references so the delete isn't blocked by purchased tickets
      await supabase.from('tickets').update({ ticket_type_id: null }).in('ticket_type_id', toDelete);
      await supabase.from('ticket_types').delete().in('id', toDelete);
    }

    for (let i = 0; i < incoming.length; i++) {
      const t = incoming[i];
      const priceInPence = Math.round(parseFloat(t.price) * 100);
      const cap = parseInt(t.capacity, 10);

      if (t.id && existingIds.has(t.id)) {
        // Update existing type (preserves tickets_sold)
        await supabase.from('ticket_types')
          .update({ name: t.name, price: priceInPence, capacity: cap, sort_order: i })
          .eq('id', t.id);
      } else {
        // Insert new type
        await supabase.from('ticket_types').insert({
          event_id: id,
          name: t.name,
          price: priceInPence,
          capacity: cap,
          sort_order: i,
          active: true,
        });
      }
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
};
