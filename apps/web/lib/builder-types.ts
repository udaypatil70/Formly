import type {
  ConditionalLogic,
  FieldType,
  ValidationRules,
} from "@repo/validators";

export interface BuilderOption {
  id?: string;
  label: string;
  value: string;
  order: number;
}

export interface BuilderField {
  id: string;
  formId?: string;
  type: FieldType;
  label: string;
  placeholder?: string | null;
  helpText?: string | null;
  required: boolean;
  order: number;
  validationRules?: ValidationRules | null;
  conditionalLogic?: ConditionalLogic | null;
  options?: BuilderOption[];
}

export interface BuilderFormSettings {
  password?: string;
  expiry?: string | null;
  responseLimit?: number | null;
  thankYouMessage?: string;
}

export interface ThemeColorSet {
  primary: string;
  background: string;
  surface: string;
  text: string;
}

export type BuilderThemeBackground =
  | { type: "solid"; color: string }
  | { type: "gradient"; from: string; to: string }
  | { type: "image"; url: string };

export interface BuilderTheme {
  id?: string;
  name?: string;
  category?: string;
  ownerId?: string | null;
  font?: string | null;
  colors: ThemeColorSet;
  background?: BuilderThemeBackground | null;
}
