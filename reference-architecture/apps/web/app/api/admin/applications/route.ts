import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const applications = await prisma.application.findMany({
    orderBy: { createdAt: 'desc' },
    include: { user: true },
  });

  return NextResponse.json({ success: true, applications });
}
