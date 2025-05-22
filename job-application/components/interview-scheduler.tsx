"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getAvailableInterviewSlots, bookInterviewSlot } from "@/app/actions"
import { CheckCircle, XCircle, CalendarIcon, Clock } from "lucide-react"

type InterviewSchedulerProps = {
  applicantId: string
  applicantName: string
  onComplete: (success: boolean) => void
}

export default function InterviewScheduler({ applicantId, applicantName, onComplete }: InterviewSchedulerProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [availableSlots, setAvailableSlots] = useState<Array<{ date: string; time: string }>>([])
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [bookingStatus, setBookingStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [bookingMessage, setBookingMessage] = useState("")

  // Get available dates (only dates that have available slots)
  const availableDates = [...new Set(availableSlots.map((slot) => slot.date))].map((dateStr) => new Date(dateStr))

  // Get available times for the selected date
  const availableTimesForSelectedDate = selectedDate
    ? availableSlots.filter((slot) => slot.date === selectedDate.toISOString().split("T")[0])
    : []

  // Load available slots
  useEffect(() => {
    async function loadSlots() {
      setLoading(true)
      try {
        const result = await getAvailableInterviewSlots()
        if (result.success) {
          setAvailableSlots(result.slots)
        } else {
          setError("Failed to load available interview slots. Please try again.")
        }
      } catch (err) {
        setError("An unexpected error occurred. Please try again.")
      } finally {
        setLoading(false)
      }
    }

    loadSlots()
  }, [])

  // Handle date selection
  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date)
  }

  // Handle booking
  const handleBookSlot = async (time: string) => {
    if (!selectedDate) return

    setBookingStatus("loading")
    const dateString = selectedDate.toISOString().split("T")[0]

    try {
      const result = await bookInterviewSlot(applicantId, applicantName, dateString, time)

      if (result.success) {
        setBookingStatus("success")
        setBookingMessage(`Your interview has been scheduled for ${dateString} at ${formatTime(time)}.`)

        // Remove this slot from available slots
        setAvailableSlots(availableSlots.filter((slot) => !(slot.date === dateString && slot.time === time)))

        // Notify parent component after a delay
        setTimeout(() => onComplete(true), 3000)
      } else {
        setBookingStatus("error")
        setBookingMessage(result.error || "Failed to book interview. Please try again.")
      }
    } catch (err) {
      setBookingStatus("error")
      setBookingMessage("An unexpected error occurred. Please try again.")
    }
  }

  // Format time from 24h to 12h
  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":")
    const hour = Number.parseInt(hours)
    return `${hour > 12 ? hour - 12 : hour}:${minutes} ${hour >= 12 ? "PM" : "AM"}`
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mb-6">
        <XCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (bookingStatus === "success") {
    return (
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-6">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Interview Scheduled!</h2>
        <p className="text-muted-foreground mb-6">{bookingMessage}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold">Schedule Your Interview</h2>
        <p className="text-muted-foreground">Please select a date and time for your interview</p>
      </div>

      {bookingStatus === "error" && (
        <Alert variant="destructive" className="mb-6">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{bookingMessage}</AlertDescription>
        </Alert>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Select Date
            </CardTitle>
            <CardDescription>Available interview dates</CardDescription>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              disabled={(date) => {
                // Disable dates that don't have available slots
                return !availableDates.some(
                  (availableDate) =>
                    availableDate.getDate() === date.getDate() &&
                    availableDate.getMonth() === date.getMonth() &&
                    availableDate.getFullYear() === date.getFullYear(),
                )
              }}
              className="rounded-md border"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Select Time
            </CardTitle>
            <CardDescription>
              {selectedDate ? `Available times on ${selectedDate.toLocaleDateString()}` : "Please select a date first"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedDate ? (
              availableTimesForSelectedDate.length > 0 ? (
                <div className="space-y-2">
                  {availableTimesForSelectedDate.map((slot) => (
                    <Button
                      key={`${slot.date}-${slot.time}`}
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      onClick={() => handleBookSlot(slot.time)}
                      disabled={bookingStatus === "loading"}
                    >
                      <Clock className="mr-2 h-4 w-4" />
                      {formatTime(slot.time)}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No available times on this date.</p>
              )
            ) : (
              <p className="text-muted-foreground">Please select a date to see available times.</p>
            )}
          </CardContent>
          <CardFooter className="flex justify-between">
            <p className="text-sm text-muted-foreground">All interviews are scheduled for 30 minutes</p>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
