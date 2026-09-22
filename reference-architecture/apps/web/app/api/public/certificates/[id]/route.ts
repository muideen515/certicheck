import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const certificate = await prisma.certificate.findUnique({
      where: { id: params.id },
    });

    if (!certificate) {
      return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, certificate });
  } catch (error) {
    console.error('lookup certificate error', error);
    return NextResponse.json({ error: 'Failed to lookup certificate' }, { status: 500 });
  }
}
