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

  const { event_id } = event.queryStringParameters || {};

  let query = supabase
    .from('tickets')
    .select('*, events(name, date)')
    .order('created_at', { ascending: false });

  if (event_id) {
    query = query.eq('event_id', event_id);
  }

  const { data, error } = await query;

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
};
