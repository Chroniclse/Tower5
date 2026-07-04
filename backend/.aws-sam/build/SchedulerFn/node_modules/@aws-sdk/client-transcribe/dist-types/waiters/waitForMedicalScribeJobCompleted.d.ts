import { type WaiterConfiguration, type WaiterResult } from "@smithy/core/client";
import { type GetMedicalScribeJobCommandInput, type GetMedicalScribeJobCommandOutput } from "../commands/GetMedicalScribeJobCommand";
import type { TranscribeServiceException } from "../models/TranscribeServiceException";
import type { TranscribeClient } from "../TranscribeClient";
/**
 *
 *  @deprecated Use waitUntilMedicalScribeJobCompleted instead. waitForMedicalScribeJobCompleted does not throw error in non-success cases.
 */
export declare const waitForMedicalScribeJobCompleted: (params: WaiterConfiguration<TranscribeClient>, input: GetMedicalScribeJobCommandInput) => Promise<WaiterResult<GetMedicalScribeJobCommandOutput | TranscribeServiceException>>;
/**
 *
 *  @param params - Waiter configuration options.
 *  @param input - The input to GetMedicalScribeJobCommand for polling.
 */
export declare const waitUntilMedicalScribeJobCompleted: (params: WaiterConfiguration<TranscribeClient>, input: GetMedicalScribeJobCommandInput) => Promise<WaiterResult<GetMedicalScribeJobCommandOutput>>;
