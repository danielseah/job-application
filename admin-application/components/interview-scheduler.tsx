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

  // Function to check if a date has available slots
  const checkAvailability = async (date: Date) => {
    setIsCheckingAvailability(true)
    setSlotsAvailable(null)

    try {
      // Format date to match database format (YYYY-MM-DD)
      const formattedDate = format(date, "yyyy-MM-dd")
      
      // Count existing bookings for this date
      const { count, error } = await supabase
        .from("interview_bookings")
        .select("*", { count: 'exact', head: true })
        .eq("interview_date", `${formattedDate}T15:00:00+08:00`) // SGT time zone

      if (error) {
        throw new Error(error.message)
      }
      
      // Calculate available spots (total 20 per day)
      const availableSpots = 20 - (count || 0)
      setSlotsAvailable(availableSpots)
      
      return availableSpots > 0
    } catch (error) {
      console.error("Error checking availability:", error)
      setSlotsAvailable(null)
      return false
    } finally {
      setIsCheckingAvailability(false)
    }
  }

  // Handle date selection
  const handleDateSelect = async (date: Date | undefined) => {
    setSelectedDate(date)
    
    if (date) {
      await checkAvailability(date)
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
      // Check availability one more time
      const isAvailable = await checkAvailability(selectedDate)
      
      if (!isAvailable) {
        throw new Error("Sorry, this date is no longer available. Please select another date.")
      }

      // Format the date for storage
      const formattedDate = `${format(selectedDate, "yyyy-MM-dd")}T15:00:00+08:00` // SGT timezone
      
      // Generate a booking code (6-digit random number as string)
      const bookingCode = Math.floor(100000 + Math.random() * 900000).toString()

      // Create the booking
      const { error: bookingError } = await supabase
        .from("interview_bookings")
        .insert({
          application_id: applicationId,
          interview_date: formattedDate,
          booking_code: bookingCode,
        })

      if (bookingError) {
        throw new Error(bookingError.message)
      }

      // Update the application status
      const { error: updateError } = await supabase
        .from("applications")
        .update({ 
          status: "interview_scheduled",
          interview_date: formattedDate,
          interview_confirmation: true,
          current_step: "confirmation"
        })
        .eq("id", applicationId)

      if (updateError) {
        throw new Error(updateError.message)
      }

      // Notify the WhatsApp bot about the booking
      await fetch("/api/notify-interview-booking", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          application_id: applicationId,
          interview_date: formattedDate,
          booking_code: bookingCode,
        }),
      })

      // Redirect to confirmation page
      router.push(`/interview/confirmation/${applicationId}`)
    } catch (error: any) {
      console.error("Error booking interview:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to book the interview",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Get today's date
  const today = startOfDay(new Date())
  
  // Calculate tomorrow's date
  let tomorrow = addDays(today, 1)
  // If tomorrow is weekend, move to next Monday
  if (isWeekend(tomorrow)) {
    tomorrow = nextMonday(today)
  }
  
  // Calculate the end date (5 working days from tomorrow)
  const getNext5WorkingDays = (startDate: Date): Date => {
    let workingDaysCount = 0
    let currentDay = startDate
    let endDate = startDate
    
    while (workingDaysCount < 5) {
      currentDay = addDays(currentDay, 1)
      if (!isWeekend(currentDay)) {
        workingDaysCount++
        endDate = currentDay
      }
    }
    
    return endDate
  }
  
  const lastAvailableDay = getNext5WorkingDays(tomorrow)
  
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="mb-4">
            <h2 className="text-lg font-medium">Select Interview Date</h2>
            <p className="text-sm text-gray-500">
              Please select an available date for your interview.
              All interviews take place at 3:00 PM (Singapore Time).
              Only the next 5 working days (Monday-Friday) are available for scheduling.
            </p>
          </div>
          
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleDateSelect}
            disabled={(date) => 
              // Disable dates that are before tomorrow
              isBefore(date, tomorrow) || 
              // Disable dates after the last available day
              isAfter(date, lastAvailableDay) ||
              // Disable weekends
              isWeekend(date)
            }
            className="rounded-md border"
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
              <p className="text-sm text-green-700 mt-2">
                {slotsAvailable > 0 
                  ? `${slotsAvailable} of 20 spots remaining`
                  : "No spots remaining for this date"}
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