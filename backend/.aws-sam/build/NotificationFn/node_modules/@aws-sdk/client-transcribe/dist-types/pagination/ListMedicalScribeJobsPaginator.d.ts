import type { Paginator } from "@smithy/types";
import { ListMedicalScribeJobsCommandInput, ListMedicalScribeJobsCommandOutput } from "../commands/ListMedicalScribeJobsCommand";
import type { TranscribePaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListMedicalScribeJobs: (config: TranscribePaginationConfiguration, input: ListMedicalScribeJobsCommandInput, ...rest: any[]) => Paginator<ListMedicalScribeJobsCommandOutput>;
