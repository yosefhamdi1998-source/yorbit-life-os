import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/supabase.ts';

// Runs across ALL users (this is a system job triggered by pg_cron with the
// service-role key — see schema.sql bottom section — not a per-user request).
Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const admin = serviceClient();

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const horizon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const horizonStr = horizon.toISOString().slice(0, 10);

    const { data: bills, error: billsError } = await admin
      .from('bills')
      .select('*')
      .eq('is_recurring', true)
      .eq('category', 'subscription')
      .eq('is_paid', false);
    if (billsError) throw billsError;

    const upcoming = (bills || []).filter((b) => {
      if (!b.due_date) return false;
      const d = String(b.due_date).slice(0, 10);
      return d >= todayStr && d <= horizonStr;
    });

    const { data: existing, error: existingError } = await admin
      .from('notifications')
      .select('related_id')
      .eq('type', 'subscription_renewal');
    if (existingError) throw existingError;
    const seen = new Set((existing || []).map((n) => n.related_id));

    const fmtAmount = (n: number) =>
      Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

    let created = 0;
    for (const bill of upcoming) {
      const due = String(bill.due_date).slice(0, 10);
      const key = `${bill.id}|${due}`;
      if (seen.has(key)) continue;

      const daysUntil = Math.max(
        0,
        Math.round((new Date(due).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      );

      const message =
        daysUntil <= 0
          ? `Your ${bill.name} subscription (${fmtAmount(bill.amount)}) renews today (${due}).`
          : `Your ${bill.name} subscription (${fmtAmount(bill.amount)}) renews in ${daysUntil} day${daysUntil === 1 ? '' : 's'} on ${due}.`;

      const { error: insertError } = await admin.from('notifications').insert({
        user_id: bill.user_id,
        title: `${bill.name} renews soon`,
        message,
        type: 'subscription_renewal',
        related_id: key,
        related_type: 'Bill',
        due_date: bill.due_date,
        amount: bill.amount,
        is_read: false,
        action_url: '/bills',
      });
      if (!insertError) created++;
    }

    return jsonResponse({ checked: (bills || []).length, upcoming: upcoming.length, created });
  } catch (error) {
    console.error('generate-subscription-reminders error:', error);
    return jsonResponse({ error: error.message }, 500);
  }
});
