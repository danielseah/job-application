import { NextResponse } from 'next/server'
 
export async function GET() {
  return NextResponse.json({ health: 'good' })
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('Received content:', body);
    return NextResponse.json({ message: 'Content received' });
  } catch (error) {
    console.error('Error parsing JSON:', error);
    return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }
}