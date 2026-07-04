import { WaiterConfiguration, WaiterResult } from "@smithy/core/client";
import {
  GetMedicalTranscriptionJobCommandInput,
  GetMedicalTranscriptionJobCommandOutput,
} from "../commands/GetMedicalTranscriptionJobCommand";
import { TranscribeServiceException } from "../models/TranscribeServiceException";
import { TranscribeClient } from "../TranscribeClient";
export declare const waitForMedicalTranscriptionJobCompleted: (
  params: WaiterConfiguration<TranscribeClient>,
  input: GetMedicalTranscriptionJobCommandInput
) => Promise<
  WaiterResult<
    GetMedicalTranscriptionJobCommandOutput | TranscribeServiceException
  >
>;
export declare const waitUntilMedicalTranscriptionJobCompleted: (
  params: WaiterConfiguration<TranscribeClient>,
  input: GetMedicalTranscriptionJobCommandInput
) => Promise<WaiterResult<GetMedicalTranscriptionJobCommandOutput>>;
