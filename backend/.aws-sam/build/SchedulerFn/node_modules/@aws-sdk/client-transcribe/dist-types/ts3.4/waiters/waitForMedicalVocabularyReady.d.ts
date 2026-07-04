import { WaiterConfiguration, WaiterResult } from "@smithy/core/client";
import {
  GetMedicalVocabularyCommandInput,
  GetMedicalVocabularyCommandOutput,
} from "../commands/GetMedicalVocabularyCommand";
import { TranscribeServiceException } from "../models/TranscribeServiceException";
import { TranscribeClient } from "../TranscribeClient";
export declare const waitForMedicalVocabularyReady: (
  params: WaiterConfiguration<TranscribeClient>,
  input: GetMedicalVocabularyCommandInput
) => Promise<
  WaiterResult<GetMedicalVocabularyCommandOutput | TranscribeServiceException>
>;
export declare const waitUntilMedicalVocabularyReady: (
  params: WaiterConfiguration<TranscribeClient>,
  input: GetMedicalVocabularyCommandInput
) => Promise<WaiterResult<GetMedicalVocabularyCommandOutput>>;
