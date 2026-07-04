import type { Paginator } from "@smithy/types";
import { ListTranscriptionJobsCommandInput, ListTranscriptionJobsCommandOutput } from "../commands/ListTranscriptionJobsCommand";
import type { TranscribePaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListTranscriptionJobs: (config: TranscribePaginationConfiguration, input: ListTranscriptionJobsCommandInput, ...rest: any[]) => Paginator<ListTranscriptionJobsCommandOutput>;
