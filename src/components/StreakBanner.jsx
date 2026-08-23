import { useEffect, useState } from 'react';
import { Flame } from 'lucide-react';

// Tracks daily logins via localStorage to show a streak — drives Day-7 retention
export default function StreakBanner() {
  const [streak, setStreak] = useState(0);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const lastVisit = localStorage.getItem('last_visit_date');
    const storedStreak = parseInt(localStorage.getItem('visit_streak') || '0', 10);

    if (!lastVisit) {
      localStorage.setItem('last_visit_date', today);
      localStorage.setItem('visit_streak', '1');
      setStreak(1);
      setIsNew(true);
      return;
    }

    const last = new Date(lastVisit);
    const now = new Date(today);
    const diffDays = Math.round((now - last) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      // Same day, just show streak
      setStreak(storedStreak);
    } else if (diffDays === 1) {
      // Consecutive day!
      const newStreak = storedStreak + 1;
      localStorage.setItem('visit_streak', String(newStreak));
      localStorage.setItem('last_visit_date', today);
      setStreak(newStreak);
      setIsNew(true);
    } else {
      // Streak broken
      localStorage.setItem('visit_streak', '1');
      localStorage.setItem('last_visit_date', today);
      setStreak(1);
    }
  }, []);

  if (streak < 2) return null;

  return (
    <div
      className="flex items-center gap-2 rounded-2xl px-4 py-2.5 mb-1"
      style={{ background: 'linear-gradient(135deg, #FF6B35 0%, #F7931E 100%)' }}
    >
      <Flame className="w-4 h-4 text-white" />
      <span className="text-white text-sm font-bold">{streak}-day streak!</span>
      <span className="text-white/70 text-xs ml-auto">{isNew && streak > 1 ? '🎉 Keep it up!' : 'Keep checking in'}</span>
    </div>
  );
}