// admin-application\components\interview-slot-manager.tsx

"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent } from "@/components/ui/card"
import { format } from "date-fns"
import { createClient } from "@/utils/supabase/client"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

type InterviewSlot = {
  id: string
  interview_date: string
  available_spots: number
}

export default function InterviewScheduler({
  applicationId,
  availableSlots,
}: {
  applicationId: string
  availableSlots: InterviewSlot[] | null | undefined
}) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  // Safely convert available slots to Date objects for the calendar
  // Adding null check to fix the TypeError: Cannot read properties of undefined (reading 'map')
  const availableDates = availableSlots 
    ? availableSlots.map(slot => new Date(slot.interview_date))
    : []

  // Function to check if a date is available
  const isDateAvailable = (date: Date) => {
    if (!availableSlots) return false
    
    return availableSlots.some(slot => 
      new Date(slot.interview_date).toISOString().split('T')[0] === date.toISOString().split('T')[0]
    )
  }

  // Get the slot information for a given date
  const getSlotForDate = (date: Date) => {
    if (!availableSlots) return null
    
    return availableSlots.find(slot => 
      new Date(slot.interview_date).toISOString().split('T')[0] === date.toISOString().split('T')[0]
    )
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
      const selectedSlot = getSlotForDate(selectedDate)
      if (!selectedSlot) {
        throw new Error("Selected date is not available")
      }

      // Generate a booking code (6-digit random number as string)
      const bookingCode = Math.floor(100000 + Math.random() * 900000).toString()

      // Create the booking
      const { error: bookingError } = await supabase
        .from("interview_bookings")
        .insert({
          application_id: applicationId,
          interview_slot_id: selectedSlot.id,
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
          interview_date: `${selectedSlot.interview_date}T15:00:00Z`,
          interview_confirmation: true,
          current_step: "confirmation" // Update to match what was previously waiting_calendly_booking
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
          interview_date: `${selectedSlot.interview_date}T15:00:00Z`,
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

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="mb-4">
            <h2 className="text-lg font-medium">Select Interview Date</h2>
            <p className="text-sm text-gray-500">
              Please select an available date for your interview.
              All interviews take place at 3:00 PM.
            </p>
          </div>
          
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            disabled={(date) => 
              // Disable dates that are in the past
              date < new Date(new Date().setHours(0, 0, 0, 0)) ||
              // Disable dates that aren't in our available slots
              !isDateAvailable(date)
            }
            modifiers={{
              available: availableDates,
            }}
            modifiersStyles={{
              available: { 
                fontWeight: "bold",
                backgroundColor: "rgba(0, 112, 243, 0.1)"
              },
            }}
            className="rounded-md border"
          />
        </CardContent>
      </Card>

      {selectedDate && (
        <div className="space-y-4">
          <div className="p-4 border rounded bg-green-50">
            <h3 className="text-md font-medium">Your Selection</h3>
            <p>Date: <strong>{format(selectedDate, "EEEE, MMMM d, yyyy")}</strong></p>
            <p>Time: <strong>3:00 PM</strong></p>
            <p className="text-sm text-green-700 mt-2">
              {getSlotForDate(selectedDate)?.available_spots ?? 0} spots remaining
            </p>
          </div>
          
          <Button 
            onClick={handleBookInterview} 
            className="w-full" 
            disabled={isSubmitting}
          >
            {isSubmitting ? "Booking..." : "Confirm Interview"}
          </Button>
        </div>
      )}
    </div>
  )
}