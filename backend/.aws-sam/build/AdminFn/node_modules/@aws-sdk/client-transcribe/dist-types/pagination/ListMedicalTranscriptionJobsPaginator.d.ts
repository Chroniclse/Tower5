import type { Paginator } from "@smithy/types";
import { ListMedicalTranscriptionJobsCommandInput, ListMedicalTranscriptionJobsCommandOutput } from "../commands/ListMedicalTranscriptionJobsCommand";
import type { TranscribePaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListMedicalTranscriptionJobs: (config: TranscribePaginationConfiguration, input: ListMedicalTranscriptionJobsCommandInput, ...rest: any[]) => Paginator<ListMedicalTranscriptionJobsCommandOutput>;
