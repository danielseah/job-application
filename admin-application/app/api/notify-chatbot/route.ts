
// admin-application/app/api/notify-chatbot/route.ts

import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    
    // Validate request body
    if (!data.application_id) {
      return NextResponse.json(
        { error: "Missing required field: application_id" },
        { status: 400 }
      )
    }
    
    // Ensure decision is either "approved" or "rejected"
    if (!data.decision || !["approved", "rejected"].includes(data.decision)) {
      return NextResponse.json(
        { error: "Invalid decision value. Must be 'approved' or 'rejected'" },
        { status: 400 }
      )
    }

    // Get the WhatsApp bot webhook URL from environment variables
    const chatbotWebhookUrl = process.env.CHATBOT_WEBHOOK_URL || "https://9b40-151-192-105-138.ngrok-free.app/external-review-webhook"
    
    // Forward the notification to the WhatsApp bot
    const response = await fetch(chatbotWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Optional: Add authentication header if your webhook requires it
        ...(process.env.CHATBOT_API_KEY 
          ? { "Authorization": `Bearer ${process.env.CHATBOT_API_KEY}` }
          : {})
      },
      body: JSON.stringify({
        application_id: data.application_id,
        event_type: "application_review",
        decision: data.decision,
        reason: data.reason || "",
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
      message: `Chatbot notification sent successfully for ${data.decision} decision`
    })
    
  } catch (error: any) {
    console.error("Error in notify-chatbot API route:", error)
    return NextResponse.json(
      { error: "Internal server error", message: error.message || "Unknown error" },
      { status: 500 }
    )
  }
}

// Configure API route
export const config = {
  runtime: "edge", // Optional: Use Edge runtime for faster execution
}