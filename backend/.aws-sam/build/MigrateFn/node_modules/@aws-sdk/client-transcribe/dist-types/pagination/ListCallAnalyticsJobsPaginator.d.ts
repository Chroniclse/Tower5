import type { Paginator } from "@smithy/types";
import { ListCallAnalyticsJobsCommandInput, ListCallAnalyticsJobsCommandOutput } from "../commands/ListCallAnalyticsJobsCommand";
import type { TranscribePaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListCallAnalyticsJobs: (config: TranscribePaginationConfiguration, input: ListCallAnalyticsJobsCommandInput, ...rest: any[]) => Paginator<ListCallAnalyticsJobsCommandOutput>;
