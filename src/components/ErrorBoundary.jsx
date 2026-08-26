import { Component } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Catches render-time errors anywhere below it in the tree and shows a
// recoverable screen instead of leaving the whole app blank.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Uncaught render error:', error, info?.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background px-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-lg font-black mb-1.5">Something went wrong</h1>
          <p className="text-sm text-muted-foreground mb-6">
            That's on us, not your data — nothing you've saved is affected. Reloading usually fixes it.
          </p>
          <Button onClick={this.handleReload} className="gap-1.5">
            <RotateCw className="w-4 h-4" /> Reload MoneyGlow
          </Button>
        </div>
      </div>
    );
  }
}
