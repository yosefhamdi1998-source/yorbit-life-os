import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Compute today and 3 days from now (UTC, YYYY-MM-DD).
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const horizon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const horizonStr = horizon.toISOString().slice(0, 10);

    // Fetch all recurring, unpaid subscription bills.
    const bills = await base44.asServiceRole.entities.Bill.filter({
      is_recurring: true,
      category: 'subscription',
      is_paid: false,
    });

    const upcoming = bills.filter((b) => {
      if (!b.due_date) return false;
      const d = String(b.due_date).slice(0, 10);
      return d >= todayStr && d <= horizonStr;
    });

    // Dedup by bill id + due date so we never notify twice for the same cycle.
    const existing = await base44.asServiceRole.entities.Notification.filter({
      type: 'subscription_renewal',
    });
    const seen = new Set(existing.map((n) => n.related_id));

    const fmtAmount = (n) => {
      const v = Number(n || 0);
      return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    };

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

      await base44.asServiceRole.entities.Notification.create({
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
      created++;
    }

    return Response.json({ checked: bills.length, upcoming: upcoming.length, created });
  } catch (error) {
    console.error('generateSubscriptionReminders error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});