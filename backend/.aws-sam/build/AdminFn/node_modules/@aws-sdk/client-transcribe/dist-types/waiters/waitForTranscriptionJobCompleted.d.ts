import { type WaiterConfiguration, type WaiterResult } from "@smithy/core/client";
import { type GetTranscriptionJobCommandInput, type GetTranscriptionJobCommandOutput } from "../commands/GetTranscriptionJobCommand";
import type { TranscribeServiceException } from "../models/TranscribeServiceException";
import type { TranscribeClient } from "../TranscribeClient";
/**
 *
 *  @deprecated Use waitUntilTranscriptionJobCompleted instead. waitForTranscriptionJobCompleted does not throw error in non-success cases.
 */
export declare const waitForTranscriptionJobCompleted: (params: WaiterConfiguration<TranscribeClient>, input: GetTranscriptionJobCommandInput) => Promise<WaiterResult<GetTranscriptionJobCommandOutput | TranscribeServiceException>>;
/**
 *
 *  @param params - Waiter configuration options.
 *  @param input - The input to GetTranscriptionJobCommand for polling.
 */
export declare const waitUntilTranscriptionJobCompleted: (params: WaiterConfiguration<TranscribeClient>, input: GetTranscriptionJobCommandInput) => Promise<WaiterResult<GetTranscriptionJobCommandOutput>>;
