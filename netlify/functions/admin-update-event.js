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

  const { id, name, date, location, description, price, capacity, image_url, active, show_availability } = JSON.parse(event.body);

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

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
};
