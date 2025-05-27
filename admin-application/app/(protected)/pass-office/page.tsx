
import { createClient } from "@/utils/supabase/client"
import PassOfficeTable from "@/components/pass-office-table"
import { subDays, formatISO, startOfDay, endOfDay, parseISO } from 'date-fns';

// Helper functions to replace date-fns-tz functionality
function zonedToUtc(date: Date, timeZone: string): Date {
  // Simple implementation - offset by the timezone difference
  const offsetMinutes = new Date().getTimezoneOffset();
  // For Asia/Singapore (+8), we need to subtract 8 hours worth of minutes
  // when converting to UTC
  return new Date(date.getTime() - offsetMinutes * 60000);
}

function utcToZonedTime(date: Date, timeZone: string): Date {
  // Simple implementation for SGT (+8)
  // For Asia/Singapore, we add 8 hours when converting from UTC to local
  const offsetMinutes = new Date().getTimezoneOffset();
  return new Date(date.getTime() - offsetMinutes * 60000);
}

export type PassOfficeBooking = {
  id: string // booking id
  interview_date: string
  visitor_pass_number: string | null
  pass_office_code: string | null
  attended: boolean
  interview_notes: string | null
  application_id: string
  applications: {
    name: string
    nric: string | null
  } | null
}

async function getPassOfficeData(date: Date): Promise<PassOfficeBooking[]> {
  const supabase = createClient()
  const timeZone = 'Asia/Singapore';

  // Convert selected date to SGT start and end of day, then to UTC for query
  const startOfSelectedDaySGT = startOfDay(date);
  const endOfSelectedDaySGT = endOfDay(date);

  const startOfSelectedDayUTC = zonedToUtc(startOfSelectedDaySGT, timeZone);
  const endOfSelectedDayUTC = zonedToUtc(endOfSelectedDaySGT, timeZone);

  const { data, error } = await supabase
    .from('interview_bookings')
    .select(`
      id,
      interview_date,
      visitor_pass_number,
      pass_office_code,
      attended,
      interview_notes,
      application_id,
      applications (
        name,
        nric
      )
    `)
    .gte('interview_date', startOfSelectedDayUTC.toISOString())
    .lt('interview_date', endOfSelectedDayUTC.toISOString())
    .order('visitor_pass_number', { ascending: true });

  if (error) {
    console.error("Error fetching pass office data:", error)
    return []
  }
  // Ensure applications is not null, provide default if it is
  return data.map(item => ({
    ...item,
    applications: item.applications || { name: 'N/A', nric: 'N/A' }
  })) as PassOfficeBooking[];
}

// Fix: Make the page component properly handle dynamic searchParams
export default async function PassOfficePage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  // Fix: Convert searchParams to a resolved object before accessing properties
  const resolvedParams = searchParams || {};
  const selectedDateParam = resolvedParams.date as string | undefined;
  
  // Default to today in SGT if no date is provided or if date is invalid
  const timeZone = 'Asia/Singapore';
  let currentDateInSGT = new Date(); // Simplified for now

  let selectedDate: Date;
  if (selectedDateParam) {
    try {
      // Use a simpler approach for parsing dates
      const parsedDate = new Date(selectedDateParam);
      if (!isNaN(parsedDate.getTime())) {
        selectedDate = parsedDate;
      } else {
        selectedDate = currentDateInSGT;
      }
    } catch (e) {
      selectedDate = currentDateInSGT;
    }
  } else {
    selectedDate = currentDateInSGT;
  }
  
  const bookings = await getPassOfficeData(selectedDate);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pass Office - Visitor List</h1>
      </div>
      <PassOfficeTable initialBookings={bookings} initialDate={selectedDate} />
    </div>
  )
}