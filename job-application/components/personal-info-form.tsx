"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

export default function PersonalInfoForm({ formData, updateFormData }) {
  const handleChange = (e) => {
    const { name, value } = e.target
    updateFormData({ [name]: value })
  }

  const handleGenderChange = (value) => {
    updateFormData({ gender: value })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fullName">
          Full Name (As per NRIC) <span className="text-red-500">*</span>
        </Label>
        <Input
          id="fullName"
          name="fullName"
          value={formData.fullName}
          onChange={handleChange}
          placeholder="Enter your full name"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nric">
          NRIC <span className="text-red-500">*</span>
        </Label>
        <Input
          id="nric"
          name="nric"
          value={formData.nric}
          onChange={handleChange}
          placeholder="Enter your NRIC"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="age">
          Age <span className="text-red-500">*</span>
        </Label>
        <Input
          id="age"
          name="age"
          type="number"
          value={formData.age}
          onChange={handleChange}
          placeholder="Enter your age"
          required
        />
      </div>

      <div className="space-y-2">
        <Label>
          Gender <span className="text-red-500">*</span>
        </Label>
        <RadioGroup value={formData.gender} onValueChange={handleGenderChange} className="flex space-x-4">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="male" id="male" />
            <Label htmlFor="male">Male</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="female" id="female" />
            <Label htmlFor="female">Female</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="other" id="other" />
            <Label htmlFor="other">Other</Label>
          </div>
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label htmlFor="contactNumber">
          Contact Number (As per WhatsApp) <span className="text-red-500">*</span>
        </Label>
        <Input
          id="contactNumber"
          name="contactNumber"
          value={formData.contactNumber}
          onChange={handleChange}
          placeholder="Enter your contact number"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nearestMRT">
          Nearest MRT <span className="text-red-500">*</span>
        </Label>
        <Input
          id="nearestMRT"
          name="nearestMRT"
          value={formData.nearestMRT}
          onChange={handleChange}
          placeholder="Enter your nearest MRT station"
          required
        />
      </div>
    </div>
  )
}
