import { type WaiterConfiguration, type WaiterResult } from "@smithy/core/client";
import { type GetVocabularyCommandInput, type GetVocabularyCommandOutput } from "../commands/GetVocabularyCommand";
import type { TranscribeServiceException } from "../models/TranscribeServiceException";
import type { TranscribeClient } from "../TranscribeClient";
/**
 *
 *  @deprecated Use waitUntilVocabularyReady instead. waitForVocabularyReady does not throw error in non-success cases.
 */
export declare const waitForVocabularyReady: (params: WaiterConfiguration<TranscribeClient>, input: GetVocabularyCommandInput) => Promise<WaiterResult<GetVocabularyCommandOutput | TranscribeServiceException>>;
/**
 *
 *  @param params - Waiter configuration options.
 *  @param input - The input to GetVocabularyCommand for polling.
 */
export declare const waitUntilVocabularyReady: (params: WaiterConfiguration<TranscribeClient>, input: GetVocabularyCommandInput) => Promise<WaiterResult<GetVocabularyCommandOutput>>;
