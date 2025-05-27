import { createClient } from "@/utils/supabase/server"
import { notFound } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { format, parseISO } from "date-fns"

export default async function InterviewConfirmationPage({
  params,
}: {
  params: { applicationId: string }
}) {
  const { applicationId } = await params
  const supabase = await createClient()

  // Get booking details with application
  const { data: booking, error } = await supabase
    .from("interview_bookings")
    .select(`
      booking_code,
      interview_date,
      applications (
        name
      )
    `)
    .eq("application_id", applicationId)
    .single()

  if (error || !booking) {
    notFound()
  }

  // Format the interview date and time
  const interviewDate = parseISO(booking.interview_date)
  const formattedDate = format(interviewDate, "EEEE, MMMM d, yyyy")
  const formattedTime = "3:00 PM SGT" // Fixed time for all interviews
  
  return (
    <div className="container max-w-xl mx-auto py-8 px-4">
      <Card className="border-green-200 bg-green-50">
        <CardHeader className="bg-green-100 pb-3">
          <CardTitle className="text-center text-green-800">
            Interview Scheduled Successfully
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 pb-8">
          <div className="space-y-4">
            <div className="text-center mb-6">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-12 w-12 mx-auto text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>

            <div className="space-y-2">
              <h3 className="font-medium">Dear {booking.applications.name},</h3>
              <p>Your interview has been successfully scheduled.</p>
            </div>

            <div className="bg-white p-4 rounded-md border border-green-200">
              <h4 className="font-medium text-center mb-3 text-green-800">Interview Details</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">Date:</span>
                  <span>{formattedDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Time:</span>
                  <span>{formattedTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Booking Code:</span>
                  <span className="font-bold">{booking.booking_code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Interview Type:</span>
                  <span>Group Interview</span>
                </div>
              </div>
            </div>

            <div className="mt-6 text-sm text-gray-600">
              <p className="mb-2">
                Please take a screenshot of this page or note down your booking code for reference.
              </p>
              <p>
                We've also sent a confirmation message to your WhatsApp number.
              </p>
            </div>

            <div className="bg-blue-50 p-4 rounded-md border border-blue-200 mt-4">
              <h4 className="font-medium mb-2">Office Location & Directions:</h4>
              <p className="text-sm">
                Our office is located at:<br />
                123 Business Street<br />
                Suite 456<br />
                Business City, BC 12345<br /><br />
                Nearest transit:<br />
                - Bus: Routes 10, 15 (stop at Business Square)<br />
                - Train: Central Station (5-minute walk)<br /><br />
                Please arrive 15 minutes before your scheduled time.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}