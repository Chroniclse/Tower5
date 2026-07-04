import { WaiterConfiguration, WaiterResult } from "@smithy/core/client";
import {
  GetCallAnalyticsJobCommandInput,
  GetCallAnalyticsJobCommandOutput,
} from "../commands/GetCallAnalyticsJobCommand";
import { TranscribeServiceException } from "../models/TranscribeServiceException";
import { TranscribeClient } from "../TranscribeClient";
export declare const waitForCallAnalyticsJobCompleted: (
  params: WaiterConfiguration<TranscribeClient>,
  input: GetCallAnalyticsJobCommandInput
) => Promise<
  WaiterResult<GetCallAnalyticsJobCommandOutput | TranscribeServiceException>
>;
export declare const waitUntilCallAnalyticsJobCompleted: (
  params: WaiterConfiguration<TranscribeClient>,
  input: GetCallAnalyticsJobCommandInput
) => Promise<WaiterResult<GetCallAnalyticsJobCommandOutput>>;
