"use client"

import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"

export default function HealthLegalForm({ formData, updateFormData }) {
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
          Do you consume any medication? <span className="text-red-500">*</span>
        </Label>
        <RadioGroup
          value={formData.medication}
          onValueChange={(value) => handleSelectChange("medication", value)}
          className="flex space-x-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="yes" id="medication-yes" />
            <Label htmlFor="medication-yes">Yes</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="no" id="medication-no" />
            <Label htmlFor="medication-no">No</Label>
          </div>
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label>
          Do you smoke cigarettes or e-cigarettes? <span className="text-red-500">*</span>
        </Label>
        <RadioGroup
          value={formData.smoking}
          onValueChange={(value) => handleSelectChange("smoking", value)}
          className="flex space-x-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="yes" id="smoking-yes" />
            <Label htmlFor="smoking-yes">Yes</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="no" id="smoking-no" />
            <Label htmlFor="smoking-no">No</Label>
          </div>
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label>
          Do you have any pre-existing medical conditions? <span className="text-red-500">*</span>
        </Label>
        <RadioGroup
          value={formData.medicalConditions ? "yes" : "no"}
          onValueChange={(value) => {
            if (value === "no") {
              updateFormData({ medicalConditions: "" })
            } else {
              // Just set a placeholder if they select yes, they'll fill in details in the textarea
              updateFormData({ medicalConditions: formData.medicalConditions || " " })
            }
          }}
          className="flex space-x-4 mb-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="yes" id="medical-yes" />
            <Label htmlFor="medical-yes">Yes</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="no" id="medical-no" />
            <Label htmlFor="medical-no">No</Label>
          </div>
        </RadioGroup>

        {formData.medicalConditions && (
          <Textarea
            id="medicalConditions"
            name="medicalConditions"
            value={formData.medicalConditions}
            onChange={handleChange}
            placeholder="Please describe your medical conditions"
            rows={3}
          />
        )}
      </div>

      <div className="space-y-2">
        <Label>
          Have you been investigated for any criminal offense in Singapore? <span className="text-red-500">*</span>
        </Label>
        <RadioGroup
          value={formData.criminalInvestigation}
          onValueChange={(value) => handleSelectChange("criminalInvestigation", value)}
          className="flex space-x-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="yes" id="criminal-investigation-yes" />
            <Label htmlFor="criminal-investigation-yes">Yes</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="no" id="criminal-investigation-no" />
            <Label htmlFor="criminal-investigation-no">No</Label>
          </div>
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label>
          Have you been charged in any court in Singapore? <span className="text-red-500">*</span>
        </Label>
        <RadioGroup
          value={formData.courtCharges}
          onValueChange={(value) => handleSelectChange("courtCharges", value)}
          className="flex space-x-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="yes" id="court-charges-yes" />
            <Label htmlFor="court-charges-yes">Yes</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="no" id="court-charges-no" />
            <Label htmlFor="court-charges-no">No</Label>
          </div>
        </RadioGroup>
      </div>
    </div>
  )
}
