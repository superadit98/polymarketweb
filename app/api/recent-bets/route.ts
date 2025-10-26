import crypto from 'node:crypto';
import { NextResponse } from 'next/server';

import { getRecentBets } from '@/lib/service';

const DEFAULT_MIN_BET = 500;

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const minBetParam = Number(searchParams.get('minBet') ?? DEFAULT_MIN_BET);
  const minBet = Number.isFinite(minBetParam) ? Math.max(minBetParam, DEFAULT_MIN_BET) : DEFAULT_MIN_BET;

  try {
    const bets = await getRecentBets(minBet);
    const body = JSON.stringify(bets);
    const etag = crypto.createHash('sha256').update(body).digest('hex');

    const response = new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=0, s-maxage=3600',
        ETag: etag,
      },
    });

    return response;
  } catch (error) {
    console.error('Failed to load recent bets', error);
    return NextResponse.json(
      { error: 'Failed to load recent bets. Please try again later.' },
      { status: 500 },
    );
  }
}
