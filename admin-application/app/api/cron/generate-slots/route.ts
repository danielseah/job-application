import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { addDays, format, eachDayOfInterval } from "date-fns"

export async function POST(req: Request) {
  // Verify authorization - use a secret token for cron jobs
  const authHeader = req.headers.get("authorization")
  const expectedToken = process.env.CRON_SECRET_TOKEN
  
  if (!authHeader || !expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  
  try {
    const supabase = await createClient()
    
    // Get dates for next 4 weeks
    const today = new Date()
    const futureDate = addDays(today, 28) // 4 weeks ahead
    
    const dateRange = eachDayOfInterval({
      start: addDays(today, 1), // Start from tomorrow
      end: futureDate
    })
    
    // Check which dates already have slots
    const { data: existingSlots } = await supabase
      .from("interview_slots")
      .select("interview_date")
    
    const existingDates = new Set(
      (existingSlots || []).map(slot => 
        format(new Date(slot.interview_date), "yyyy-MM-dd")
      )
    )
    
    // Filter dates that don't have slots yet
    const datesToCreate = dateRange.filter(date => 
      !existingDates.has(format(date, "yyyy-MM-dd"))
    )
    
    if (datesToCreate.length === 0) {
      return NextResponse.json({ message: "No new slots to create" })
    }
    
    // Create new slots for these dates
    const slotsToCreate = datesToCreate.map(date => ({
      interview_date: format(date, "yyyy-MM-dd"),
      available_spots: 20,
      time_slot: "15:00:00", // 3:00 PM
    }))
    
    const { data, error } = await supabase
      .from("interview_slots")
      .insert(slotsToCreate)
      .select()
    
    if (error) {
      throw new Error(error.message)
    }
    
    return NextResponse.json({
      message: `Created ${slotsToCreate.length} new interview slots`,
      dates: slotsToCreate.map(slot => slot.interview_date)
    })
    
  } catch (error: any) {
    console.error("Error generating interview slots:", error)
    return NextResponse.json(
      { error: "Failed to generate slots", message: error.message },
      { status: 500 }
    )
  }
}

export const config = {
  runtime: "edge",
}