"use client"

import { useState, useEffect } from "react"
import { PassOfficeBooking } from "@/app/(protected)/pass-office/page"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Calendar as CalendarIcon, Download, Save } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format, addDays } from "date-fns"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { useToast } from "@/hooks/use-toast"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

function utcToZonedTime(date: Date, timeZone: string): Date {
  // Simple implementation - just return the date since we're mainly using it for display
  return date;
}

export default function PassOfficeTable({ 
  initialBookings,
  initialDate 
}: { 
  initialBookings: PassOfficeBooking[],
  initialDate: Date
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const { toast } = useToast()

  const [bookings, setBookings] = useState<PassOfficeBooking[]>(initialBookings)
  // Ensure initialDate is correctly interpreted in SGT for display
  const timeZone = 'Asia/Singapore';
  const [selectedDate, setSelectedDate] = useState<Date>(utcToZonedTime(initialDate, timeZone));
  const [notes, setNotes] = useState<Record<string, string>>({}) // bookingId -> note
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // Update bookings when initialBookings prop changes (e.g., due to date change via URL)
    setBookings(initialBookings);
    // Initialize notes from fetched bookings
    const initialNotes: Record<string, string> = {};
    initialBookings.forEach(booking => {
      if (booking.interview_notes) {
        initialNotes[booking.id] = booking.interview_notes;
      }
    });
    setNotes(initialNotes);
  }, [initialBookings]);

  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      const newSgtDate = utcToZonedTime(date, timeZone);
      setSelectedDate(newSgtDate);
      const formattedDate = format(newSgtDate, "yyyy-MM-dd") // Format as YYYY-MM-DD for URL
      router.push(`/pass-office?date=${formattedDate}`)
    }
  }

  const handleAttendanceChange = async (bookingId: string, attended: boolean) => {
    setBookings(prev => 
      prev.map(b => b.id === bookingId ? { ...b, attended } : b)
    )

    const { error } = await supabase
      .from("interview_bookings")
      .update({ attended })
      .eq("id", bookingId)

    if (error) {
      toast({ title: "Error", description: "Failed to update attendance.", variant: "destructive" })
      // Revert UI change
      setBookings(prev => 
        prev.map(b => b.id === bookingId ? { ...b, attended: !attended } : b)
      )
    } else {
      toast({ title: "Success", description: "Attendance updated." })
    }

    // update interview_step in applications table to true or false based on attended
    const { error: stepError } = await supabase
      .from("applications")
      .update({ interview_step: attended })
      .eq("id", bookings.find(b => b.id === bookingId)?.application_id)
    
    if (stepError) {
      toast({ title: "Error", description: "Failed to update interview step.", variant: "destructive" })
    }
  }

  const handleNoteChange = (bookingId: string, value: string) => {
    setNotes(prev => ({ ...prev, [bookingId]: value }))
  }

  const handleSaveNote = async (bookingId: string) => {
    const noteToSave = notes[bookingId] || ""
    const { error } = await supabase
      .from("interview_bookings")
      .update({ interview_notes: noteToSave })
      .eq("id", bookingId)

    if (error) {
      toast({ title: "Error", description: "Failed to save note.", variant: "destructive" })
    } else {
      toast({ title: "Success", description: "Note saved." })
      // Update local bookings state if needed, though notes state is separate
      setBookings(prev => 
        prev.map(b => b.id === bookingId ? { ...b, interview_notes: noteToSave } : b)
      );
    }
  }

  const generatePDF = () => {
    try {
      const doc = new jsPDF();
      const formattedSelectedDate = format(selectedDate, "dd MMMM yyyy");
      const validityEndDate = format(addDays(selectedDate, 3), "dd MMMM yyyy");

      // Header
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("CPO PTE LTD (MIRAE)", 14, 20);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("Address: 115 Airport Cargo Road, #07-18 Cargo Agents Building C, Singapore 819466", 14, 26);
      doc.text("Fax: +1 973-327-3824   Mob: +65 8028 5950", 14, 32);

      doc.text(format(new Date(), "dd MMMM yyyy"), 14, 45); // Current date of PDF generation

      doc.text("The Officer-In-Charge", 14, 55);
      doc.text("Changi Airport Police Division", 14, 60);
      doc.text("Pass Office", 14, 65);

      doc.setFont("helvetica", "bold");
      doc.text("Dear Sir/Madam,", 14, 75);
      doc.text("RE: VISITOR PASS APPLICATION", 14, 85);
      doc.setFont("helvetica", "normal");

      const bodyText = `This is to certify that the below mentioned personnel has been approved by our company to enter Changi Airfreight Centre for an interview in our premise at Cargo Agents Building C on ${formattedSelectedDate} to ${validityEndDate}.`;
      
      // Use splitTextToSize for automatic wrapping
      const splitBodyText = doc.splitTextToSize(bodyText, 180); // 180 is the max width
      doc.text(splitBodyText, 14, 95);

      const tableColumn = ["Serial No.", "Full Name", "NRIC/Passport No."];
      const tableRows: (string | null)[][] = [];

      bookings.forEach(booking => {
        const bookingData = [
          booking.visitor_pass_number || "N/A",
          booking.applications?.name || "N/A",
          booking.applications?.nric || "N/A"
        ];
        tableRows.push(bookingData);
      });

      // Using autoTable as an imported function instead of a method on doc
      const tableY = 115;
      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: tableY,
        theme: 'grid',
        headStyles: { fillColor: [22, 160, 133] },
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 40 }, // Serial No.
          1: { cellWidth: 'auto' }, // Full Name
          2: { cellWidth: 50 }, // NRIC
        }
      });
      
      // Get the final Y position after the table is drawn
      const finalY = (doc as any).lastAutoTable.finalY;
      
      doc.text("Thank you for your kind attention.", 14, finalY + 15);
      doc.text("Yours faithfully,", 14, finalY + 25);
      doc.text("For CPO PTE LTD (MIRAE)", 14, finalY + 40);

      doc.save(`Visitor_Pass_List_${format(selectedDate, "yyyy-MM-dd")}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({ 
        title: "Error", 
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive" 
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(selectedDate, "PPP")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateChange}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        <Button onClick={generatePDF} disabled={bookings.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Download PDF
        </Button>
      </div>

      {isLoading ? (
         <p>Loading bookings...</p>
      ) : bookings.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No interviews scheduled for this date.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">Serial No.</TableHead>
                <TableHead>Full Name</TableHead>
                <TableHead>NRIC/Passport</TableHead>
                <TableHead className="w-[100px]">Attended</TableHead>
                <TableHead>Interview Notes</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map((booking) => (
                <TableRow key={booking.id}>
                  <TableCell>{booking.visitor_pass_number || "N/A"}</TableCell>
                  <TableCell>{booking.applications?.name || "N/A"}</TableCell>
                  <TableCell>{booking.applications?.nric || "N/A"}</TableCell>
                  <TableCell>
                    <Checkbox
                      checked={booking.attended}
                      onCheckedChange={(checked) => 
                        handleAttendanceChange(booking.id, Boolean(checked))
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Textarea
                      value={notes[booking.id] || ""}
                      onChange={(e) => handleNoteChange(booking.id, e.target.value)}
                      placeholder="Add notes..."
                      rows={2}
                    />
                  </TableCell>
                  <TableCell>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleSaveNote(booking.id)}
                    >
                      <Save className="h-4 w-4 mr-1" /> Save Note
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}