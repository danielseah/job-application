import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"

export async function POST(request: Request) {
  try {
    const { applicationId, status } = await request.json()

    // Validate input
    if (!applicationId || !status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Here you would typically send a request to your chatbot API
    // For now, we'll just log it and update our database
    console.log(`Notifying chatbot about application ${applicationId} status change to ${status}`)

    // Update the application status in the database
    const supabase = await createClient()
    const { error } = await supabase.from("applications").update({ status }).eq("id", applicationId)

    if (error) {
      console.error("Error updating application status:", error)
      return NextResponse.json({ error: "Failed to update application status" }, { status: 500 })
    }

    // In a real implementation, you would send a request to your chatbot API
    // Example:
    // const chatbotResponse = await fetch('https://your-chatbot-api.com/webhook', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ applicationId, status }),
    // });

    return NextResponse.json({
      success: true,
      message: "Chatbot notified of status change",
    })
  } catch (error) {
    console.error("Notification error:", error)
    return NextResponse.json({ error: "Failed to notify chatbot" }, { status: 500 })
  }
}
