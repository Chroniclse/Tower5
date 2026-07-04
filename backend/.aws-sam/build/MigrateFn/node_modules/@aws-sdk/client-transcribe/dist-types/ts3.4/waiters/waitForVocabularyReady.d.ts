import { WaiterConfiguration, WaiterResult } from "@smithy/core/client";
import {
  GetVocabularyCommandInput,
  GetVocabularyCommandOutput,
} from "../commands/GetVocabularyCommand";
import { TranscribeServiceException } from "../models/TranscribeServiceException";
import { TranscribeClient } from "../TranscribeClient";
export declare const waitForVocabularyReady: (
  params: WaiterConfiguration<TranscribeClient>,
  input: GetVocabularyCommandInput
) => Promise<
  WaiterResult<GetVocabularyCommandOutput | TranscribeServiceException>
>;
export declare const waitUntilVocabularyReady: (
  params: WaiterConfiguration<TranscribeClient>,
  input: GetVocabularyCommandInput
) => Promise<WaiterResult<GetVocabularyCommandOutput>>;
