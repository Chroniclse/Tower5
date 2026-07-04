import { type WaiterConfiguration, type WaiterResult } from "@smithy/core/client";
import { type GetCallAnalyticsJobCommandInput, type GetCallAnalyticsJobCommandOutput } from "../commands/GetCallAnalyticsJobCommand";
import type { TranscribeServiceException } from "../models/TranscribeServiceException";
import type { TranscribeClient } from "../TranscribeClient";
/**
 *
 *  @deprecated Use waitUntilCallAnalyticsJobCompleted instead. waitForCallAnalyticsJobCompleted does not throw error in non-success cases.
 */
export declare const waitForCallAnalyticsJobCompleted: (params: WaiterConfiguration<TranscribeClient>, input: GetCallAnalyticsJobCommandInput) => Promise<WaiterResult<GetCallAnalyticsJobCommandOutput | TranscribeServiceException>>;
/**
 *
 *  @param params - Waiter configuration options.
 *  @param input - The input to GetCallAnalyticsJobCommand for polling.
 */
export declare const waitUntilCallAnalyticsJobCompleted: (params: WaiterConfiguration<TranscribeClient>, input: GetCallAnalyticsJobCommandInput) => Promise<WaiterResult<GetCallAnalyticsJobCommandOutput>>;
