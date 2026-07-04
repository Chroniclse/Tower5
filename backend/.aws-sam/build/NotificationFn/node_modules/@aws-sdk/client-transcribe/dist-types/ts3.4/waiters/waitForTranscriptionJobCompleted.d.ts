import { WaiterConfiguration, WaiterResult } from "@smithy/core/client";
import {
  GetTranscriptionJobCommandInput,
  GetTranscriptionJobCommandOutput,
} from "../commands/GetTranscriptionJobCommand";
import { TranscribeServiceException } from "../models/TranscribeServiceException";
import { TranscribeClient } from "../TranscribeClient";
export declare const waitForTranscriptionJobCompleted: (
  params: WaiterConfiguration<TranscribeClient>,
  input: GetTranscriptionJobCommandInput
) => Promise<
  WaiterResult<GetTranscriptionJobCommandOutput | TranscribeServiceException>
>;
export declare const waitUntilTranscriptionJobCompleted: (
  params: WaiterConfiguration<TranscribeClient>,
  input: GetTranscriptionJobCommandInput
) => Promise<WaiterResult<GetTranscriptionJobCommandOutput>>;
