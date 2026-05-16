import { LiveEventsFeed } from '@/components/live-events-feed';
import { OfflineBanner } from '@/components/offline-banner';
import { getEvents } from '@/lib/kernel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function EventsPage() {
  try {
    const { events } = await getEvents({ limit: 100 });
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-neutral-100">Events</h1>
          <p className="text-sm text-neutral-400">
            Live feed from the event bus — polls every 1.5s.
          </p>
        </header>
        <LiveEventsFeed initial={events} />
      </div>
    );
  } catch (err) {
    return <OfflineBanner error={err} />;
  }
}
