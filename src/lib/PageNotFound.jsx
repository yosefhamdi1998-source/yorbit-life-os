import { Link } from 'react-router-dom';
import { Home, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PageNotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="text-center max-w-sm">
        {/* Brand mark */}
        <div className="w-16 h-16 gradient-primary rounded-3xl flex items-center justify-center shadow-lg shadow-primary/20 mx-auto mb-6">
          <Sparkles className="w-8 h-8 text-white" />
        </div>

        {/* Error */}
        <p className="text-5xl font-black text-primary/20 mb-2">404</p>
        <h1 className="text-xl font-black text-foreground mb-2">Page not found</h1>
        <p className="text-sm text-muted-foreground mb-8">
          This page doesn't exist. Let's get you back to your money.
        </p>

        <Link to="/">
          <Button className="gap-2 bg-primary hover:bg-primary/90 text-white shadow-sm shadow-primary/25 min-h-[44px]">
            <Home className="w-4 h-4" /> Go to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}