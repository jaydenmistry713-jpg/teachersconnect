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
