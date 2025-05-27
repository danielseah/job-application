import { createClient } from "@/utils/supabase/server"
import InterviewScheduler from "@/components/interview-scheduler"
import { notFound, redirect } from "next/navigation"

// Validate a UUID format
const isValidUUID = (uuid: string) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

export default async function InterviewSchedulePage({
  params,
}: {
  params: { applicationId: string }
}) {
  // Await params before accessing properties
  const resolvedParams = await params;
  const applicationId = resolvedParams.applicationId;

  // Validate UUID format
  if (!isValidUUID(applicationId)) {
    notFound()
  }

  // Rest of your function remains the same
  const supabase = await createClient()

  // Verify the application exists and is in the correct state
  const { data: application, error: appError } = await supabase
    .from("applications")
    .select("id, name, current_step, phone_number")
    .eq("id", applicationId)
    .single()

  if (appError || !application) {
    notFound()
  }

  // Check if application is approved for interview
  if (application.current_step !== "waiting_interview_booking") {
    // Redirect to a page explaining the application isn't ready for interview scheduling
    return redirect(`/interview/not-eligible?id=${applicationId}`)
  }

  // Check if the user has already booked an interview
  const { data: existingBooking } = await supabase
    .from("interview_bookings")
    .select("id, booking_code, interview_date")
    .eq("application_id", applicationId)
    .single()

  if (existingBooking) {
    // Redirect to the confirmation page if already booked
    return redirect(`/interview/confirmation/${applicationId}`)
  }

  return (
    <div className="container max-w-xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Schedule Your Interview</h1>
      
      <div className="mb-6 p-4 border rounded bg-blue-50">
        <p className="text-sm text-blue-800">
          <strong>Applicant:</strong> {application.name}
        </p>
        <p className="text-sm text-blue-800">
          <strong>Interview Time:</strong> 3:00 PM SGT (Group Interview)
        </p>
        <p className="text-sm text-blue-800 mt-2">
          Each day has 20 available spots. Please select a date in the next 30 days.
        </p>
      </div>
      
      <InterviewScheduler applicationId={applicationId} />
    </div>
  )
}