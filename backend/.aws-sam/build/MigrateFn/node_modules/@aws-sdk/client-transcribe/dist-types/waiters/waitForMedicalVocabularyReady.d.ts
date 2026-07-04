import { type WaiterConfiguration, type WaiterResult } from "@smithy/core/client";
import { type GetMedicalVocabularyCommandInput, type GetMedicalVocabularyCommandOutput } from "../commands/GetMedicalVocabularyCommand";
import type { TranscribeServiceException } from "../models/TranscribeServiceException";
import type { TranscribeClient } from "../TranscribeClient";
/**
 *
 *  @deprecated Use waitUntilMedicalVocabularyReady instead. waitForMedicalVocabularyReady does not throw error in non-success cases.
 */
export declare const waitForMedicalVocabularyReady: (params: WaiterConfiguration<TranscribeClient>, input: GetMedicalVocabularyCommandInput) => Promise<WaiterResult<GetMedicalVocabularyCommandOutput | TranscribeServiceException>>;
/**
 *
 *  @param params - Waiter configuration options.
 *  @param input - The input to GetMedicalVocabularyCommand for polling.
 */
export declare const waitUntilMedicalVocabularyReady: (params: WaiterConfiguration<TranscribeClient>, input: GetMedicalVocabularyCommandInput) => Promise<WaiterResult<GetMedicalVocabularyCommandOutput>>;
