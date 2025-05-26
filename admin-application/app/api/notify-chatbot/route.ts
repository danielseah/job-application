// import { NextResponse } from "next/server"
// import { createClient } from "@/utils/supabase/server"

// export async function POST(request: Request) {
//   try {
//     const { applicationId, status } = await request.json()

//     // Validate input
//     if (!applicationId || !status) {
//       return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
//     }

//     // Here you would typically send a request to your chatbot API
//     // For now, we'll just log it and update our database
//     console.log(`Notifying chatbot about application ${applicationId} status change to ${status}`)

//     // Update the application status in the database
//     const supabase = await createClient()
//     const { error } = await supabase.from("applications").update({ status }).eq("id", applicationId)

//     if (error) {
//       console.error("Error updating application status:", error)
//       return NextResponse.json({ error: "Failed to update application status" }, { status: 500 })
//     }

//     // In a real implementation, you would send a request to your chatbot API
//     // Example:
//     // const chatbotResponse = await fetch('https://your-chatbot-api.com/webhook', {
//     //   method: 'POST',
//     //   headers: { 'Content-Type': 'application/json' },
//     //   body: JSON.stringify({ applicationId, status }),
//     // });

//     return NextResponse.json({
//       success: true,
//       message: "Chatbot notified of status change",
//     })
//   } catch (error) {
//     console.error("Notification error:", error)
//     return NextResponse.json({ error: "Failed to notify chatbot" }, { status: 500 })
//   }
// }
/**
 * admin-application/app/api/notify-chatbot/route.ts
 * API route to notify the WhatsApp bot of application status changes
 */

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
    const chatbotWebhookUrl = process.env.CHATBOT_WEBHOOK_URL || "http://localhost:5000/external-webhook"
    
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