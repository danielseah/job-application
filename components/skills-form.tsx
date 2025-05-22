"use client"

import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function SkillsForm({ formData, updateFormData }) {
  const handleChange = (e) => {
    const { name, value } = e.target
    updateFormData({ [name]: value })
  }

  const handleSelectChange = (name, value) => {
    updateFormData({ [name]: value })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>
          Do you have any experience in the electronics industry? <span className="text-red-500">*</span>
        </Label>
        <RadioGroup
          value={formData.electronicsExperience ? "yes" : "no"}
          onValueChange={(value) => {
            if (value === "no") {
              updateFormData({ electronicsExperience: "" })
            } else {
              // Just set a placeholder if they select yes, they'll fill in details in the textarea
              updateFormData({ electronicsExperience: formData.electronicsExperience || " " })
            }
          }}
          className="flex space-x-4 mb-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="yes" id="electronics-yes" />
            <Label htmlFor="electronics-yes">Yes</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="no" id="electronics-no" />
            <Label htmlFor="electronics-no">No</Label>
          </div>
        </RadioGroup>

        {formData.electronicsExperience && (
          <Textarea
            id="electronicsExperience"
            name="electronicsExperience"
            value={formData.electronicsExperience}
            onChange={handleChange}
            placeholder="Please describe your experience in the electronics industry"
            rows={3}
          />
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="excelFamiliarity">
          How familiar are you with Excel or Google Sheets? <span className="text-red-500">*</span>
        </Label>
        <Select
          value={formData.excelFamiliarity}
          onValueChange={(value) => handleSelectChange("excelFamiliarity", value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select your familiarity level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="not-familiar">Not familiar at all</SelectItem>
            <SelectItem value="basic">Basic knowledge</SelectItem>
            <SelectItem value="intermediate">Intermediate</SelectItem>
            <SelectItem value="advanced">Advanced</SelectItem>
            <SelectItem value="expert">Expert</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
