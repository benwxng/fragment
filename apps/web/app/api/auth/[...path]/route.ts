import { getAuth } from '@/lib/auth/server';
import type { NextRequest } from 'next/server';
type Context = { params: Promise<{ path: string[] }> };
export const GET = (request: NextRequest, context: Context) => getAuth().handler().GET(request, context);
export const POST = (request: NextRequest, context: Context) => getAuth().handler().POST(request, context);
