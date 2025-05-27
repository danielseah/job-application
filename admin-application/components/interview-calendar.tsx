// admin-application\components\interview-calendar.tsx

"use client"

import { useState } from "react"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { format, isSameDay, parseISO } from "date-fns"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { FileText, AlertTriangle, Calendar as CalendarIcon, List } from "lucide-react"
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog"

interface Applicant {
  id: string
  name: string
  phone_number: string
  nric: string
  resume_url?: string
  red_flags: number
  red_flag_reasons: string[] | null
}

interface Booking {
  id: string
  booking_code: string
  interview_date: string
  created_at: string
  applications: Applicant
}

export default function InterviewCalendarView({
  bookings,
}: {
  bookings: Booking[]
}) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
  const [selectedApplicant, setSelectedApplicant] = useState<Applicant | null>(null)
  const [view, setView] = useState<"calendar" | "list">("calendar")
  
  // Helper function to ensure red_flag_reasons is always an array
  const ensureArray = (value: string[] | string | null | undefined): string[] => {
    if (Array.isArray(value)) {
      return value
    }
    
    if (typeof value === 'string') {
      try {
        // Try to parse it as JSON
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) ? parsed : [value]
      } catch {
        // If parsing fails, treat it as a single string item
        return [value]
      }
    }
    
    // Default to empty array for null/undefined
    return []
  }
  
  // Get bookings for the selected date
  const getBookingsForDate = (date: Date) => {
    return bookings.filter(booking => {
      const bookingDate = parseISO(booking.interview_date)
      return isSameDay(bookingDate, date)
    })
  }

  // Get dates with bookings for highlighting on calendar
  const datesWithBookings = bookings.map(booking => parseISO(booking.interview_date))
  
  // Get bookings for currently selected date
  const selectedDateBookings = selectedDate 
    ? getBookingsForDate(selectedDate)
    : []

  return (
    <Tabs value={view} onValueChange={(v) => setView(v as "calendar" | "list")} className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <TabsList>
          <TabsTrigger value="calendar" className="flex items-center">
            <CalendarIcon className="mr-2 h-4 w-4" />
            Calendar View
          </TabsTrigger>
          <TabsTrigger value="list" className="flex items-center">
            <List className="mr-2 h-4 w-4" />
            List View
          </TabsTrigger>
        </TabsList>
        
        <div className="text-sm text-muted-foreground">
          Total interviews: <Badge variant="secondary">{bookings.length}</Badge>
        </div>
      </div>
      
      <TabsContent value="calendar" className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">Interview Dates</CardTitle>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                modifiers={{
                  booked: datesWithBookings,
                }}
                modifiersStyles={{
                  booked: { 
                    fontWeight: "bold",
                    backgroundColor: "rgba(0, 112, 243, 0.1)",
                    color: "#0070f3"
                  },
                }}
                className="rounded-md border"
              />
              
              {selectedDate && (
                <div className="mt-4 text-center">
                  <h3 className="font-medium">
                    {format(selectedDate, "EEEE, MMMM d, yyyy")}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedDateBookings.length} interview{selectedDateBookings.length !== 1 ? 's' : ''} scheduled
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">
                {selectedDate 
                  ? `Interviews on ${format(selectedDate, "MMMM d, yyyy")}`
                  : "Select a date to view interviews"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedDateBookings.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Applicant</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Booking Code</TableHead>
                      <TableHead>Red Flags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedDateBookings.map((booking) => (
                      <TableRow 
                        key={booking.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedApplicant(booking.applications)}
                      >
                        <TableCell className="font-medium">{booking.applications.name}</TableCell>
                        <TableCell>{booking.applications.phone_number}</TableCell>
                        <TableCell>{booking.booking_code}</TableCell>
                        <TableCell>
                          {booking.applications.red_flags > 0 ? (
                            <div className="flex items-center text-red-500">
                              <AlertTriangle className="h-4 w-4 mr-1" />
                              <span>{booking.applications.red_flags}</span>
                            </div>
                          ) : "None"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  {selectedDate
                    ? "No interviews scheduled for this date."
                    : "Select a date to view scheduled interviews."}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>
      
      <TabsContent value="list">
        <Card>
          <CardHeader>
            <CardTitle>All Upcoming Interviews</CardTitle>
          </CardHeader>
          <CardContent>
            {bookings.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Applicant</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Booking Code</TableHead>
                    <TableHead>Red Flags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookings.map((booking) => (
                    <TableRow 
                      key={booking.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedApplicant(booking.applications)}
                    >
                      <TableCell>{format(parseISO(booking.interview_date), "MMM d, yyyy")}</TableCell>
                      <TableCell>3:00 PM</TableCell>
                      <TableCell className="font-medium">{booking.applications.name}</TableCell>
                      <TableCell>{booking.applications.phone_number}</TableCell>
                      <TableCell>{booking.booking_code}</TableCell>
                      <TableCell>
                        {booking.applications.red_flags > 0 ? (
                          <div className="flex items-center text-red-500">
                            <AlertTriangle className="h-4 w-4 mr-1" />
                            <span>{booking.applications.red_flags}</span>
                          </div>
                        ) : "None"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                No upcoming interviews scheduled.
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
      
      {/* Applicant Details Dialog */}
      {selectedApplicant && (
        <Dialog open={!!selectedApplicant} onOpenChange={(open) => !open && setSelectedApplicant(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Applicant Details</DialogTitle>
              <DialogDescription>
                Information about {selectedApplicant.name}
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <h3 className="text-lg font-medium mb-2">Personal Information</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="font-medium">Name:</span>
                    <span>{selectedApplicant.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Phone:</span>
                    <span>{selectedApplicant.phone_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">NRIC:</span>
                    <span>{selectedApplicant.nric}</span>
                  </div>
                </div>
                
                {selectedApplicant.resume_url && (
                  <div className="mt-4">
                    <h4 className="font-medium mb-1">Resume:</h4>
                    <div className="flex items-center text-blue-600">
                      <FileText className="h-4 w-4 mr-2" />
                      <a href="#" className="underline">View Resume</a>
                    </div>
                  </div>
                )}
              </div>
              
              <div>
                {selectedApplicant.red_flags > 0 && (
                  <div>
                    <h3 className="text-lg font-medium mb-2 text-red-600 flex items-center">
                      <AlertTriangle className="h-5 w-5 mr-2" />
                      Red Flags
                    </h3>
                    <ul className="list-disc pl-5 space-y-1">
                      {ensureArray(selectedApplicant.red_flag_reasons).map((reason, index) => (
                        <li key={index} className="text-red-500">
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <div className="mt-4">
                  <h3 className="text-lg font-medium mb-2">Notes</h3>
                  <textarea 
                    className="w-full h-28 p-2 border rounded-md" 
                    placeholder="Add interview notes here..."
                  />
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Tabs>
  )
}