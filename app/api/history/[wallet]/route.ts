import crypto from 'node:crypto';
import { NextResponse } from 'next/server';

import { getWalletHistory } from '@/lib/service';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: { wallet: string } },
) {
  const wallet = params.wallet;

  if (!wallet) {
    return NextResponse.json({ error: 'Wallet address is required.' }, { status: 400 });
  }

  try {
    const history = await getWalletHistory(wallet);
    const body = JSON.stringify(history);
    const etag = crypto.createHash('sha256').update(body).digest('hex');

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=0, s-maxage=3600',
        ETag: etag,
      },
    });
  } catch (error) {
    console.error('Failed to load wallet history', { wallet, error });
    return NextResponse.json(
      { error: 'Failed to load wallet history. Please try again later.' },
      { status: 500 },
    );
  }
}
