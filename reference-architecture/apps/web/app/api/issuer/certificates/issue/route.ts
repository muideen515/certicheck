import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { recipientId, certificateData, txHash, blockNumber } = body;

    if (!recipientId || !certificateData) {
      return NextResponse.json({ error: 'Missing certificate payload' }, { status: 400 });
    }

    const certificate = await prisma.certificate.create({
      data: {
        recipientId,
        certificateData,
        txHash: txHash || null,
        blockNumber: blockNumber ? BigInt(blockNumber) : null,
        status: 'ACTIVE',
      },
    });

    return NextResponse.json({ success: true, certificate }, { status: 201 });
  } catch (error) {
    console.error('issue certificate error', error);
    return NextResponse.json({ error: 'Failed to issue certificate' }, { status: 500 });
  }
}
