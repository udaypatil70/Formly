import type {
  ConditionalLogic,
  FieldType,
  ValidationRules,
} from "@repo/validators";

export interface PublicOption {
  value: string;
  label: string;
}

export interface PublicField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string | null;
  helpText?: string | null;
  required: boolean;
  options?: PublicOption[];
  validationRules?: ValidationRules;
  conditionalLogic?: ConditionalLogic;
}

export interface PublicTheme {
  colors: {
    primary: string;
    background: string;
    surface: string;
    text: string;
  };
}

export interface PublicFormSettings {
  thankYouMessage?: string;
}

export interface PublicFormData {
  title: string;
  description?: string | null;
  requiresPassword: boolean;
  fields: PublicField[];
  theme: PublicTheme | null;
  settings?: PublicFormSettings;
}
