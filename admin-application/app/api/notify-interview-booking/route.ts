import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    
    // Validate request body
    if (!data.application_id || !data.interview_date || !data.booking_code) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }
    
    // Get the WhatsApp bot webhook URL from environment variables
    const chatbotWebhookUrl = process.env.CHATBOT_WEBHOOK_URL || "https://1c6f-151-192-105-138.ngrok-free.app/external-review-webhook"
    
    // Forward the booking notification to the WhatsApp bot
    const response = await fetch(chatbotWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.CHATBOT_API_KEY 
          ? { "Authorization": `Bearer ${process.env.CHATBOT_API_KEY}` }
          : {})
      },
      body: JSON.stringify({
        application_id: data.application_id,
        event_type: "interview_booked",
        interview_date: data.interview_date,
        booking_code: data.booking_code,
        timestamp: new Date().toISOString(),
      }),
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error("Failed to notify chatbot:", errorText)
      return NextResponse.json(
        { 
          error: "Failed to notify chatbot",
          status: response.status,
          details: errorText
        },
        { status: 502 }
      )
    }
    
    // If successful, return success response
    return NextResponse.json({
      success: true,
      message: "Interview booking notification sent successfully"
    })
    
  } catch (error: any) {
    console.error("Error in notify-interview-booking API route:", error)
    return NextResponse.json(
      { error: "Internal server error", message: error.message || "Unknown error" },
      { status: 500 }
    )
  }
}

export const config = {
  runtime: "edge",
}