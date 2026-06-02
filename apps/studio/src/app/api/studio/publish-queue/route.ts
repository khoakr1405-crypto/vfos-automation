import { NextResponse } from 'next/server';
import { loadPublishQueueItems } from '@/lib/studio-data/jobs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const items = loadPublishQueueItems();
    return NextResponse.json({
      success: true,
      items,
      source: 'real',
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: 'FAILED_TO_LOAD_PUBLISH_QUEUE',
        detail: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
