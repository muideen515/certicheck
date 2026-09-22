import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const adminId = 'admin-user-id';
    const appId = params.id;

    const application = await prisma.application.update({
      where: { id: appId },
      data: {
        status: 'APPROVED',
        reviewedAt: new Date(),
        reviewedById: adminId,
      },
    });

    const user = await prisma.user.update({
      where: { id: application.userId },
      data: {
        role: 'ISSUER',
        status: 'ACTIVE',
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId,
        action: 'APPLICATION_APPROVE',
        targetId: appId,
        reasoning: 'Approved issuer application',
        metadata: { userId: user.id, email: user.email },
      },
    });

    return NextResponse.json({ success: true, application, user });
  } catch (error) {
    console.error('approve application error', error);
    return NextResponse.json({ error: 'Failed to approve application' }, { status: 500 });
  }
}
