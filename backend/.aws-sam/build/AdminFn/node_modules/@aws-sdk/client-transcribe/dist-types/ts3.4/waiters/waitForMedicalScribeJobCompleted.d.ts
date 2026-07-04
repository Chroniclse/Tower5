import { WaiterConfiguration, WaiterResult } from "@smithy/core/client";
import {
  GetMedicalScribeJobCommandInput,
  GetMedicalScribeJobCommandOutput,
} from "../commands/GetMedicalScribeJobCommand";
import { TranscribeServiceException } from "../models/TranscribeServiceException";
import { TranscribeClient } from "../TranscribeClient";
export declare const waitForMedicalScribeJobCompleted: (
  params: WaiterConfiguration<TranscribeClient>,
  input: GetMedicalScribeJobCommandInput
) => Promise<
  WaiterResult<GetMedicalScribeJobCommandOutput | TranscribeServiceException>
>;
export declare const waitUntilMedicalScribeJobCompleted: (
  params: WaiterConfiguration<TranscribeClient>,
  input: GetMedicalScribeJobCommandInput
) => Promise<WaiterResult<GetMedicalScribeJobCommandOutput>>;
