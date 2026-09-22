import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { email, name, organization, role, submissionData } = body;

    if (!email || !name || !organization) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          role: 'USER',
          status: 'PENDING',
        },
      });
    }

    const application = await prisma.application.create({
      data: {
        userId: user.id,
        status: 'PENDING',
        submissionData: submissionData || body,
      },
    });

    return NextResponse.json({ success: true, application }, { status: 201 });
  } catch (error) {
    console.error('submit application error', error);
    return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 });
  }
}
