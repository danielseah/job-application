// admin-application\app\(protected)\interview-slots\page.tsx

import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"
import InterviewCalendarView from "@/components/interview-calendar-view"

export default async function InterviewSlotsPage() {
  const supabase = await createClient()
  
  // Check if user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return redirect("/login")
  }
  
  // Get all bookings for the next month with applicant details
  const today = new Date()
  const nextMonth = new Date()
  nextMonth.setMonth(nextMonth.getMonth() + 1)
  
  const { data: bookings } = await supabase
    .from("interview_bookings")
    .select(`
      id,
      visitor_pass_number,
      interview_date,
      created_at,
      applications (
        id,
        name,
        phone_number,
        nric,
        resume_url,
        red_flags,
        red_flag_reasons
      )
    `)
    .gte("interview_date", today.toISOString())
    .lte("interview_date", nextMonth.toISOString())
    .order("interview_date", { ascending: true })

  console.log("Bookings fetched:", bookings)
  
  return (
    <div className="container py-10">
      <h1 className="text-2xl font-bold mb-4">Interview Schedule</h1>
      <p className="text-gray-500 mb-8">View upcoming interviews and applicant details</p>
      
      <InterviewCalendarView bookings={bookings || []} />
    </div>
  )
}