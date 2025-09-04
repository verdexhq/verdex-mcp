export interface SelectorTestError {
  name: string;
  selector: string;
  line: number;
  error_type:
    | "timeout_error"
    | "invalid_selector"
    | "navigation_error"
    | "ambiguous_selector";
  error_message: string;
  element_count?: number; // Only for ambiguous_selector
}

export interface SelectorTestResult {
  file: string;
  url: string;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
  errors: SelectorTestError[];
}

export interface Selector {
  name: string;
  selector: string;
  line: number;
  baseReference?: string;
  isChained?: boolean;
}
