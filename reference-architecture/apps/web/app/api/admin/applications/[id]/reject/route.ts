import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const adminId = 'admin-user-id';
    const appId = params.id;
    const body = await req.json();

    const application = await prisma.application.update({
      where: { id: appId },
      data: {
        status: 'REJECTED',
        reviewedAt: new Date(),
        reviewedById: adminId,
      },
    });

    await prisma.user.update({
      where: { id: application.userId },
      data: {
        status: 'REJECTED',
        role: 'USER',
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId,
        action: 'APPLICATION_REJECT',
        targetId: appId,
        reasoning: body.reasoning || 'Application rejected by admin',
        metadata: { rejected: true },
      },
    });

    return NextResponse.json({ success: true, application });
  } catch (error) {
    console.error('reject application error', error);
    return NextResponse.json({ error: 'Failed to reject application' }, { status: 500 });
  }
}
