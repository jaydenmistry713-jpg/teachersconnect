const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

exports.handler = async (event) => {
  const sig = event.headers['stripe-signature'];
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type !== 'payment_intent.succeeded') {
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  const paymentIntent = stripeEvent.data.object;
  const { event_id, event_name, buyer_name, buyer_email, buyer_phone, quantity } = paymentIntent.metadata;
  const qty = parseInt(quantity, 10);
  const amount = paymentIntent.amount;

  await supabase
    .from('tickets')
    .update({ status: 'paid' })
    .eq('stripe_payment_intent_id', paymentIntent.id);

  await supabase.rpc('increment_tickets_sold', {
    event_id_param: event_id,
    qty_param: qty,
  });

  const { ticket_type_id } = paymentIntent.metadata;
  if (ticket_type_id) {
    await supabase.rpc('increment_ticket_type_sold', {
      ticket_type_id_param: ticket_type_id,
      qty_param: qty,
    });
  }

  const { data: ticket } = await supabase
    .from('tickets')
    .select('id')
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .single();

  const { data: eventData } = await supabase
    .from('events')
    .select('date, location, description')
    .eq('id', event_id)
    .single();

  const bookingRef = ticket ? ticket.id.slice(0, 8).toUpperCase() : paymentIntent.id.slice(-8).toUpperCase();

  // The displayed time range is stored as a "[[TIME:10:00 AM – 3:00 PM]]" marker
  // in the description (front-end + admin convention). Use it for the email when
  // present, otherwise fall back to the stored start time. Always wall-clock UTC.
  let eventDate = '';
  if (eventData) {
    const d = new Date(eventData.date);
    const datePart = d.toLocaleDateString('en-GB', {
      timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const timeMatch = String(eventData.description || '').match(/\[\[TIME:([^\]]+)\]\]/);
    const timePart = timeMatch
      ? timeMatch[1].trim()
      : d.toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' });
    eventDate = datePart + ', ' + timePart;
  }

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: 'edwin@theteachersconnect.com',
    subject: `New ticket sale: ${event_name}`,
    html: `
      <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;background:#FAFAF9;">
        <div style="background:linear-gradient(135deg,#008A96,#005C64);border-radius:16px;padding:32px;margin-bottom:32px;">
          <h1 style="color:white;font-size:24px;margin:0 0 8px;font-weight:800;">New Ticket Sale</h1>
          <p style="color:rgba(255,255,255,0.9);margin:0;font-size:15px;">${event_name}</p>
        </div>

        <div style="background:white;border-radius:12px;padding:32px;border:1px solid #E4E4E7;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:10px 0;color:#71717A;font-size:14px;width:130px;">Buyer</td>
              <td style="padding:10px 0;color:#18181B;font-weight:600;font-size:14px;">${buyer_name}</td>
            </tr>
            <tr style="border-top:1px solid #F4F4F5;">
              <td style="padding:10px 0;color:#71717A;font-size:14px;">Email</td>
              <td style="padding:10px 0;color:#18181B;font-weight:600;font-size:14px;">${buyer_email}</td>
            </tr>
            <tr style="border-top:1px solid #F4F4F5;">
              <td style="padding:10px 0;color:#71717A;font-size:14px;">Phone</td>
              <td style="padding:10px 0;color:#18181B;font-weight:600;font-size:14px;">${buyer_phone}</td>
            </tr>
            <tr style="border-top:1px solid #F4F4F5;">
              <td style="padding:10px 0;color:#71717A;font-size:14px;">Event</td>
              <td style="padding:10px 0;color:#18181B;font-weight:600;font-size:14px;">${event_name}</td>
            </tr>
            <tr style="border-top:1px solid #F4F4F5;">
              <td style="padding:10px 0;color:#71717A;font-size:14px;">Date</td>
              <td style="padding:10px 0;color:#18181B;font-weight:600;font-size:14px;">${eventDate}</td>
            </tr>
            <tr style="border-top:1px solid #F4F4F5;">
              <td style="padding:10px 0;color:#71717A;font-size:14px;">Tickets</td>
              <td style="padding:10px 0;color:#18181B;font-weight:600;font-size:14px;">${qty}</td>
            </tr>
            ${ticket_type_id && paymentIntent.metadata.ticket_type_name ? `<tr style="border-top:1px solid #F4F4F5;"><td style="padding:10px 0;color:#71717A;font-size:14px;">Ticket Type</td><td style="padding:10px 0;color:#18181B;font-weight:600;font-size:14px;">${paymentIntent.metadata.ticket_type_name}</td></tr>` : ''}
            <tr style="border-top:1px solid #F4F4F5;">
              <td style="padding:10px 0;color:#71717A;font-size:14px;">Amount</td>
              <td style="padding:10px 0;color:#008A96;font-weight:700;font-size:18px;">£${(amount / 100).toFixed(2)}</td>
            </tr>
            <tr style="border-top:1px solid #F4F4F5;">
              <td style="padding:10px 0;color:#71717A;font-size:14px;">Booking ref</td>
              <td style="padding:10px 0;color:#18181B;font-weight:700;font-size:14px;font-family:monospace;">${bookingRef}</td>
            </tr>
          </table>
        </div>
      </div>
    `,
  });

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: buyer_email,
    subject: `Your ticket for ${event_name} 🎉`,
    html: `
      <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;background:#FAFAF9;">
        <div style="background:linear-gradient(135deg,#008A96,#005C64);border-radius:16px;padding:40px;margin-bottom:32px;text-align:center;">
          <div style="font-size:48px;margin-bottom:16px;">🎉</div>
          <h1 style="color:white;font-size:28px;margin:0 0 8px;font-weight:800;">You're going!</h1>
          <p style="color:rgba(255,255,255,0.9);margin:0;font-size:16px;">Your ticket is confirmed</p>
        </div>

        <div style="background:white;border-radius:12px;padding:32px;margin-bottom:24px;border:1px solid #E4E4E7;">
          <h2 style="color:#18181B;font-size:22px;margin:0 0 24px;font-weight:700;">${event_name}</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:10px 0;color:#71717A;font-size:14px;width:120px;">Date</td>
              <td style="padding:10px 0;color:#18181B;font-weight:600;font-size:14px;">${eventDate}</td>
            </tr>
            <tr style="border-top:1px solid #F4F4F5;">
              <td style="padding:10px 0;color:#71717A;font-size:14px;">Location</td>
              <td style="padding:10px 0;color:#18181B;font-weight:600;font-size:14px;">${eventData?.location || ''}</td>
            </tr>
            <tr style="border-top:1px solid #F4F4F5;">
              <td style="padding:10px 0;color:#71717A;font-size:14px;">Name</td>
              <td style="padding:10px 0;color:#18181B;font-weight:600;font-size:14px;">${buyer_name}</td>
            </tr>
            <tr style="border-top:1px solid #F4F4F5;">
              <td style="padding:10px 0;color:#71717A;font-size:14px;">Tickets</td>
              <td style="padding:10px 0;color:#18181B;font-weight:600;font-size:14px;">${qty}</td>
            </tr>
            ${ticket_type_id && paymentIntent.metadata.ticket_type_name ? `<tr style="border-top:1px solid #F4F4F5;"><td style="padding:10px 0;color:#71717A;font-size:14px;">Ticket Type</td><td style="padding:10px 0;color:#18181B;font-weight:600;font-size:14px;">${paymentIntent.metadata.ticket_type_name}</td></tr>` : ''}
            <tr style="border-top:1px solid #F4F4F5;">
              <td style="padding:10px 0;color:#71717A;font-size:14px;">Total paid</td>
              <td style="padding:10px 0;color:#008A96;font-weight:700;font-size:18px;">£${(amount / 100).toFixed(2)}</td>
            </tr>
            <tr style="border-top:1px solid #F4F4F5;">
              <td style="padding:10px 0;color:#71717A;font-size:14px;">Booking ref</td>
              <td style="padding:10px 0;color:#18181B;font-weight:700;font-size:14px;font-family:monospace;">${bookingRef}</td>
            </tr>
          </table>
        </div>

        <p style="color:#71717A;font-size:14px;text-align:center;margin:0;">
          Questions? Reach us on Instagram
          <a href="https://www.instagram.com/theteachersconnect/" style="color:#008A96;font-weight:600;">@theteachersconnect</a>
        </p>
      </div>
    `,
  });

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
