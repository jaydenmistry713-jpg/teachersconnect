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

  const { image, filename, mimeType } = JSON.parse(event.body);

  if (!image || !filename) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing image or filename' }) };
  }

  const ext = (filename.split('.').pop() || 'jpg').toLowerCase();
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
  const storageName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${safeExt}`;

  const buffer = Buffer.from(image, 'base64');

  const { error: uploadError } = await supabase.storage
    .from('event-images')
    .upload(storageName, buffer, {
      contentType: mimeType || 'image/jpeg',
      upsert: false,
    });

  if (uploadError) {
    return { statusCode: 500, body: JSON.stringify({ error: uploadError.message }) };
  }

  const { data: { publicUrl } } = supabase.storage
    .from('event-images')
    .getPublicUrl(storageName);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: publicUrl }),
  };
};
