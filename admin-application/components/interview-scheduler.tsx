// admin-application\components\interview-scheduler.tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent } from "@/components/ui/card"
import { 
  format, 
  addDays, 
  isBefore, 
  startOfDay, 
  isWeekend,
  isAfter,
  nextMonday 
} from "date-fns"
import { createClient } from "@/utils/supabase/client"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

export default function InterviewScheduler({
  applicationId,
}: {
  applicationId: string
}) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false)
  const [slotsAvailable, setSlotsAvailable] = useState<number | null>(null)
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const DAILY_INTERVIEW_LIMIT = 20;
  const PASS_NUMBER_START = 900;

  // Function to check if a date has available slots
  const checkAvailability = async (date: Date) => {
    setIsCheckingAvailability(true)
    setSlotsAvailable(null)

    try {
      const dateStr = format(date, "yyyy-MM-dd")
      
      // Count existing bookings for this day
      const { count, error } = await supabase
        .from("interview_bookings")
        .select("*", { count: 'exact', head: true })
        .gte("interview_date", `${dateStr}T00:00:00+08:00`) // Start of day SGT
        .lt("interview_date", `${format(addDays(date, 1), "yyyy-MM-dd")}T00:00:00+08:00`) // Start of next day SGT

      if (error) {
        console.error("Error checking availability:", error)
        throw new Error(error.message)
      }
      
      const availableSpots = DAILY_INTERVIEW_LIMIT - (count || 0)
      setSlotsAvailable(availableSpots)
      
      return availableSpots > 0
    } catch (error) {
      console.error("Error checking availability:", error)
      setSlotsAvailable(0) // Assume no spots if error
      return false
    } finally {
      setIsCheckingAvailability(false)
    }
  }

  const handleDateSelect = async (date: Date | undefined) => {
    setSelectedDate(date)
    if (date) {
      await checkAvailability(date)
    } else {
      setSlotsAvailable(null)
    }
  }

  const handleBookInterview = async () => {
    if (!selectedDate) {
      toast({
        title: "Error",
        description: "Please select an interview date",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)

    try {
      // Re-check availability just before booking
      const isStillAvailable = await checkAvailability(selectedDate)
      if (!isStillAvailable || (slotsAvailable !== null && slotsAvailable <= 0)) {
         toast({
          title: "Slot Not Available",
          description: "Sorry, this date/time slot is no longer available or fully booked. Please select another date.",
          variant: "destructive",
        })
        setIsSubmitting(false)
        return
      }

      const sgtDateString = format(selectedDate, "yyyy-MM-dd")
      const interviewDateTimeToStore = `${sgtDateString}T15:00:00+08:00` // Fixed time for interview

      // Count existing bookings for this specific day to determine pass number
      const { count: bookingsOnThisDay, error: countErr } = await supabase
        .from("interview_bookings")
        .select("*", { count: 'exact', head: true })
        .gte("interview_date", `${sgtDateString}T00:00:00+08:00`)
        .lt("interview_date", `${format(addDays(selectedDate, 1), "yyyy-MM-dd")}T00:00:00+08:00`)

      if (countErr) {
        console.error("Error counting bookings for pass generation:", countErr)
        throw new Error("Failed to generate pass number. " + countErr.message)
      }

      const currentBookingsCount = bookingsOnThisDay || 0;
      if (currentBookingsCount >= DAILY_INTERVIEW_LIMIT) {
        toast({
          title: "Limit Reached",
          description: "Maximum number of interview slots for this day has been reached.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      const passNumberSuffix = PASS_NUMBER_START + currentBookingsCount;
      const passOfficeCode = passNumberSuffix.toString(); // e.g., "900", "901"
      const visitorPassNumber = `ip-${format(selectedDate, "ddMMyy")}-${passOfficeCode}`; // e.g., ip-260525-900
      
      // Generate a general booking code (if still needed, or could be same as passOfficeCode)
      const generalBookingCode = Math.floor(100000 + Math.random() * 900000).toString()

      // Create the booking
      const { error: bookingError } = await supabase
        .from("interview_bookings")
        .insert({
          application_id: applicationId,
          interview_date: interviewDateTimeToStore,
          booking_code: generalBookingCode, // Keep this if used elsewhere, or replace with passOfficeCode
          visitor_pass_number: visitorPassNumber,
          pass_office_code: passOfficeCode,
          attended: false, // Default value
          // interview_notes is not set here
        })

      if (bookingError) {
        console.error("Supabase booking error:", bookingError);
        throw new Error(bookingError.message)
      }

      // Update the application status
      const { error: updateError } = await supabase
        .from("applications")
        .update({ 
          status: "interview_scheduled",
          interview_date: interviewDateTimeToStore,
          interview_confirmation: true, // This seems to indicate they confirmed the slot
          current_step: "confirmation" // "confirmation" means interview is booked
        })
        .eq("id", applicationId)

      if (updateError) {
        // Potentially roll back booking or log inconsistency
        console.error("Supabase application update error:", updateError);
        throw new Error(updateError.message)
      }

      // Notify the WhatsApp bot about the booking
      // IMPORTANT: Ensure your /api/notify-interview-booking endpoint can handle `pass_office_code`
      await fetch("/api/notify-interview-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: applicationId,
          interview_date: interviewDateTimeToStore,
          booking_code: generalBookingCode, // Or passOfficeCode if that's what user needs
          pass_office_code: passOfficeCode, // Send the 3-digit pass office code
        }),
      })

      toast({
        title: "Interview Booked!",
        description: `Interview scheduled for ${format(selectedDate, "MMMM d, yyyy")} at 3:00 PM. Pass code: ${passOfficeCode}`,
      });
      router.push(`/interview/confirmation/${applicationId}`) // Assuming this page shows confirmation details
    } catch (error: any) {
      console.error("Error booking interview:", error)
      toast({
        title: "Booking Error",
        description: error.message || "Failed to book the interview. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const today = startOfDay(new Date())
  let tomorrow = addDays(today, 1)
  if (isWeekend(tomorrow)) {
    tomorrow = nextMonday(tomorrow) // Use tomorrow as base for nextMonday if tomorrow is weekend
  }
  
  const getNextNWorkingDaysEnd = (startDate: Date, N: number): Date => {
    let workingDaysCount = 0
    let currentDay = startDate
    // If startDate itself is a working day, it counts as the first.
    // The prompt says "next 5 working days ... are available", implying starting from tomorrow.
    // So, if tomorrow is Mon, then Mon, Tue, Wed, Thu, Fri are available.
    
    // Adjust startDate to be the first actual available day
    let firstAvailableDay = startDate;
    while(isWeekend(firstAvailableDay) || isBefore(firstAvailableDay, tomorrow)) {
        firstAvailableDay = addDays(firstAvailableDay, 1);
    }
    if (isWeekend(firstAvailableDay)) firstAvailableDay = nextMonday(firstAvailableDay);


    currentDay = addDays(firstAvailableDay, -1); // Start counting from day before first available
    let endDate = firstAvailableDay;

    while (workingDaysCount < N) {
      currentDay = addDays(currentDay, 1)
      if (!isWeekend(currentDay)) {
        workingDaysCount++
        endDate = currentDay
      }
    }
    return endDate
  }
  
  const lastAvailableDay = getNextNWorkingDaysEnd(tomorrow, 5)
  
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="mb-4">
            <h2 className="text-lg font-medium">Select Interview Date</h2>
            <p className="text-sm text-gray-500">
              Please select an available date for your interview.
              All interviews take place at 3:00 PM (Singapore Time).
              Only the next 5 working days (Monday-Friday, starting from tomorrow) are available for scheduling.
            </p>
          </div>
          
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleDateSelect}
            disabled={(date) => 
              isBefore(startOfDay(date), startOfDay(tomorrow)) || 
              isAfter(startOfDay(date), startOfDay(lastAvailableDay)) ||
              isWeekend(date)
            }
            className="rounded-md border"
            fromDate={tomorrow} // Visually suggest starting from tomorrow
            toDate={lastAvailableDay} // Visually suggest end date
          />
        </CardContent>
      </Card>

      {selectedDate && (
        <div className="space-y-4">
          <div className="p-4 border rounded bg-green-50">
            <h3 className="text-md font-medium">Your Selection</h3>
            <p>Date: <strong>{format(selectedDate, "EEEE, MMMM d, yyyy")}</strong></p>
            <p>Time: <strong>3:00 PM (SGT)</strong></p>
            
            {isCheckingAvailability ? (
              <p className="text-sm text-blue-700 mt-2">Checking availability...</p>
            ) : slotsAvailable !== null ? (
              <p className={`text-sm mt-2 ${slotsAvailable > 0 ? 'text-green-700' : 'text-red-700'}`}>
                {slotsAvailable > 0 
                  ? `${slotsAvailable} of ${DAILY_INTERVIEW_LIMIT} spots remaining for this day.`
                  : "No spots remaining for this day."}
              </p>
            ) : null}
          </div>
          
          <Button 
            onClick={handleBookInterview} 
            className="w-full" 
            disabled={isSubmitting || isCheckingAvailability || (slotsAvailable !== null && slotsAvailable <= 0)}
          >
            {isSubmitting ? "Booking..." : "Confirm Interview"}
          </Button>
        </div>
      )}
    </div>
  )
}