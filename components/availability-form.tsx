"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function AvailabilityForm({ formData, updateFormData }) {
  const handleChange = (e) => {
    const { name, value } = e.target
    updateFormData({ [name]: value })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="startDate">
          When will you be able to start work? <span className="text-red-500">*</span>
        </Label>
        <Input
          id="startDate"
          name="startDate"
          type="date"
          value={formData.startDate}
          onChange={handleChange}
          min={new Date().toISOString().split("T")[0]}
          required
        />
      </div>
    </div>
  )
}
