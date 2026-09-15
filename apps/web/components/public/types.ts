import type {
  ConditionalLogic,
  FieldType,
  ValidationRules,
} from "@repo/validators";
import type { BuilderThemeBackground, ThemeColorSet } from "~/lib/builder-types";

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
  colors: ThemeColorSet;
  font?: string | null;
  background?: BuilderThemeBackground | null;
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
