import { WaiterConfiguration, WaiterResult } from "@smithy/core/client";
import {
  DescribeLanguageModelCommandInput,
  DescribeLanguageModelCommandOutput,
} from "../commands/DescribeLanguageModelCommand";
import { TranscribeServiceException } from "../models/TranscribeServiceException";
import { TranscribeClient } from "../TranscribeClient";
export declare const waitForLanguageModelCompleted: (
  params: WaiterConfiguration<TranscribeClient>,
  input: DescribeLanguageModelCommandInput
) => Promise<
  WaiterResult<DescribeLanguageModelCommandOutput | TranscribeServiceException>
>;
export declare const waitUntilLanguageModelCompleted: (
  params: WaiterConfiguration<TranscribeClient>,
  input: DescribeLanguageModelCommandInput
) => Promise<WaiterResult<DescribeLanguageModelCommandOutput>>;
