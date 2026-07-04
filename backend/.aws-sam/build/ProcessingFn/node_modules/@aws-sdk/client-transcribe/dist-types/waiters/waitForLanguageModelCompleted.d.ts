import { type WaiterConfiguration, type WaiterResult } from "@smithy/core/client";
import { type DescribeLanguageModelCommandInput, type DescribeLanguageModelCommandOutput } from "../commands/DescribeLanguageModelCommand";
import type { TranscribeServiceException } from "../models/TranscribeServiceException";
import type { TranscribeClient } from "../TranscribeClient";
/**
 *
 *  @deprecated Use waitUntilLanguageModelCompleted instead. waitForLanguageModelCompleted does not throw error in non-success cases.
 */
export declare const waitForLanguageModelCompleted: (params: WaiterConfiguration<TranscribeClient>, input: DescribeLanguageModelCommandInput) => Promise<WaiterResult<DescribeLanguageModelCommandOutput | TranscribeServiceException>>;
/**
 *
 *  @param params - Waiter configuration options.
 *  @param input - The input to DescribeLanguageModelCommand for polling.
 */
export declare const waitUntilLanguageModelCompleted: (params: WaiterConfiguration<TranscribeClient>, input: DescribeLanguageModelCommandInput) => Promise<WaiterResult<DescribeLanguageModelCommandOutput>>;
