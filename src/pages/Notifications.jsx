import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/PageHeader';
import { Bell, Check, Trash2, Receipt, Sparkles, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

const TYPE_ICON = {
  subscription_renewal: Receipt,
  bill_due: Receipt,
  goal: Sparkles,
  info: Info,
};

const fmtAmount = (n) =>
  Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

import useDeleteLock from '@/hooks/useDeleteLock';

export default function Notifications() {
  const { runGuarded: guardDelete, isDeleting } = useDeleteLock();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [items, setItems] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await base44.entities.Notification.list('-created_date', 100);
      setItems(data);
    } catch (e) {
      setItems([]);
      toast({ title: 'Couldn’t load notifications', description: e.message, variant: 'destructive' });
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (id) => {
    try {
      await base44.entities.Notification.update(id, { is_read: true });
      setItems((prev) => (prev ? prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)) : prev));
    } catch (e) {
      toast({ title: 'Couldn’t update', description: e.message, variant: 'destructive' });
    }
  };

  const markAllRead = async () => {
    try {
      const unread = (items || []).filter((n) => !n.is_read);
      if (!unread.length) return;
      await base44.entities.Notification.bulkUpdate(unread.map((n) => ({ id: n.id, is_read: true })));
      setItems((prev) => (prev ? prev.map((n) => ({ ...n, is_read: true })) : prev));
    } catch (e) {
      toast({ title: 'Couldn’t mark all', description: e.message, variant: 'destructive' });
    }
  };

  const remove = (id) => guardDelete(id, async () => {
    try {
      await base44.entities.Notification.delete(id);
      setItems((prev) => (prev ? prev.filter((n) => n.id !== id) : prev));
    } catch (e) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    }
  });

  const unreadCount = (items || []).filter((n) => !n.is_read).length;

  return (
    <div className="py-6">
      <PageHeader
        title="Notifications"
        subtitle={unreadCount ? `${unreadCount} unread` : 'All caught up'}
        icon={Bell}
        gradient="gradient-primary"
        action={
          unreadCount ? (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <Check className="w-4 h-4 mr-1" /> Mark all read
            </Button>
          ) : null
        }
      />

      {!items ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="sky-card rounded-2xl p-4 h-20 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="sky-card rounded-3xl p-10 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
            <Bell className="w-7 h-7 text-primary" />
          </div>
          <p className="font-semibold">No notifications yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            We’ll alert you here 3 days before any recurring subscription renews.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/bills')}>
            <Receipt className="w-4 h-4 mr-1.5" /> View Bills
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const Icon = TYPE_ICON[n.type] || Bell;
            return (
              <div
                key={n.id}
                className={`sky-card rounded-2xl p-4 flex gap-3 ${!n.is_read ? 'ring-1 ring-primary/40' : ''}`}
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{n.title}</p>
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                  {n.amount != null && (
                    <p className="text-xs font-medium mt-1">{fmtAmount(n.amount)}</p>
                  )}
                  <div className="flex items-center gap-1 mt-2">
                    {n.action_url && (
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0"
                        onClick={() => navigate(n.action_url)}
                      >
                        View
                      </Button>
                    )}
                    {!n.is_read && (
                      <Button variant="ghost" size="sm" onClick={() => markRead(n.id)}>
                        <Check className="w-4 h-4 mr-1" /> Mark read
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => remove(n.id)} aria-label="Delete notification">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}