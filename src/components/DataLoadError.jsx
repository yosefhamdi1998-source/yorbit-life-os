import { Button } from '@/components/ui/button';

export default function DataLoadError({ onRetry }) {
  return <div role="alert" className="sky-card rounded-2xl p-6 my-6">
    <h1 className="text-lg font-semibold">Your money data couldn’t be loaded</h1>
    <p className="text-sm text-muted-foreground mt-2 mb-4">Check your connection and try again. Your saved records have not changed.</p>
    <Button onClick={onRetry}>Try again</Button>
  </div>;
}
