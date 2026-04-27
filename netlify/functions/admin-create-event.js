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

  const { name, date, location, description, price, capacity, image_emoji, active } = JSON.parse(event.body);

  if (!name || !date || !location || !price || !capacity) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  const { data, error } = await supabase
    .from('events')
    .insert({
      name,
      date,
      location,
      description: description || null,
      price: Math.round(parseFloat(price) * 100), // convert £ to pence
      capacity: parseInt(capacity, 10),
      image_emoji: image_emoji || '🎉',
      active: active !== false,
    })
    .select()
    .single();

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  return {
    statusCode: 201,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
};
