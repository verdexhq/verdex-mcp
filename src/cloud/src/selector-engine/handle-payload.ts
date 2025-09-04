// receives a file
// parameters: auth file, page object file, url
// uses the selector extractor to extract the selectors
// use engine.ts to run the selectors and capture the results
// returns: selectors that are valid, selectors with errors and error details

import { extractSelectors } from "./selector-extractor";
import { runSelectors } from "./engine";
import { SelectorTestResult } from "./types";

// receive file, parameters, and run the engine
// return the results

export async function handlePayload(
  file: string,
  authFile: string,
  url: string
): Promise<SelectorTestResult> {
  const selectors = extractSelectors(file);
  const results = await runSelectors(selectors, authFile, url, file);
  return results;
}
