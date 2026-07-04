import { type WaiterConfiguration, type WaiterResult } from "@smithy/core/client";
import { type GetMedicalTranscriptionJobCommandInput, type GetMedicalTranscriptionJobCommandOutput } from "../commands/GetMedicalTranscriptionJobCommand";
import type { TranscribeServiceException } from "../models/TranscribeServiceException";
import type { TranscribeClient } from "../TranscribeClient";
/**
 *
 *  @deprecated Use waitUntilMedicalTranscriptionJobCompleted instead. waitForMedicalTranscriptionJobCompleted does not throw error in non-success cases.
 */
export declare const waitForMedicalTranscriptionJobCompleted: (params: WaiterConfiguration<TranscribeClient>, input: GetMedicalTranscriptionJobCommandInput) => Promise<WaiterResult<GetMedicalTranscriptionJobCommandOutput | TranscribeServiceException>>;
/**
 *
 *  @param params - Waiter configuration options.
 *  @param input - The input to GetMedicalTranscriptionJobCommand for polling.
 */
export declare const waitUntilMedicalTranscriptionJobCompleted: (params: WaiterConfiguration<TranscribeClient>, input: GetMedicalTranscriptionJobCommandInput) => Promise<WaiterResult<GetMedicalTranscriptionJobCommandOutput>>;
